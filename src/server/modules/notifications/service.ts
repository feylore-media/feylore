import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import {
  NOTIFICATION_TYPE_CATALOG,
  NOTIFICATION_TYPE_LIST,
  isNotificationType,
  type NotificationPublic,
  type NotificationSettingsBase,
  type NotificationSettingsUpdate,
  type NotificationType,
  type NotificationsListResponse,
} from "../../../shared/notifications.js";
import { NotFoundError, ValidationError } from "../../../shared/errors.js";
import type { DomainEvent, DomainEventBus } from "./events.js";
import type {
  NotificationChannelService,
  NotificationChannelDispatch,
} from "./channels.js";
import type {
  NotificationDraft,
  NotificationSource,
  NotificationSourceRegistry,
  RecipientRule,
} from "./sources.js";

export interface ListNotificationsOptions {
  cursor?: string;
  limit?: number;
  types?: NotificationType[];
}

/**
 * Owns notification persistence, delivery, read/seen state and preferences.
 *
 * Features never construct notifications directly: they publish a domain
 * event, a registered NotificationSource renders drafts, and the service
 * resolves recipients, applies preference and privacy rules, and persists the
 * rows. `deliverDraft` is also public so internal callers (and tests) can
 * deliver a fully-specified draft without going through an event.
 */
export class NotificationService {
  constructor(
    private readonly db: Database,
    private readonly sources?: NotificationSourceRegistry,
    private readonly channels?: NotificationChannelService,
  ) {}

  /** Route an emitted domain event through its registered source. */
  async notifyFromEvent(event: DomainEvent): Promise<number> {
    if (!this.sources) return 0;
    const source = this.sources.forEventType(event.type);
    if (!source) return 0;
    const drafts = await source.resolve(event);
    let delivered = 0;
    for (const draft of drafts) {
      delivered += await this.deliverDraft(draft);
    }
    return delivered;
  }

  async deliverDraft(draft: NotificationDraft): Promise<number> {
    const recipientIds = await this.resolveRecipients(
      draft.recipient,
      draft.excludeUserIds,
    );
    if (recipientIds.length === 0) return 0;
    const enabledIds = await this.filterEnabledByPreference(
      recipientIds,
      draft.type,
    );
    const deliverableIds = await this.filterPaused(enabledIds, draft.type);
    let delivered = 0;
    for (const recipientUserId of deliverableIds) {
      const notificationId = await this.persistForRecipient(
        recipientUserId,
        draft,
      );
      if (notificationId) {
        delivered += 1;
        if (this.channels) {
          await this.channels.dispatch({
            userId: recipientUserId,
            notificationId,
            type: draft.type,
          } satisfies NotificationChannelDispatch);
        }
      }
    }
    return delivered;
  }

  async listForUser(
    userId: string,
    options: ListNotificationsOptions = {},
  ): Promise<NotificationsListResponse> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const conditions = [
      eq(schema.notifications.recipientUserId, userId),
      eq(schema.notifications.hidden, false),
    ];
    if (options.cursor) {
      conditions.push(lt(schema.notifications.createdAt, new Date(options.cursor)));
    }
    if (options.types && options.types.length > 0) {
      conditions.push(inArray(schema.notifications.type, options.types));
    }

    const rows = await this.db
      .select({
        row: schema.notifications,
        actorDisplayName: schema.users.displayName,
        actorAvatarFileId: schema.users.avatarFileId,
      })
      .from(schema.notifications)
      .leftJoin(schema.users, eq(schema.users.id, schema.notifications.actorUserId))
      .where(and(...conditions))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit + 1);

    const items = rows.slice(0, limit).map(
      ({ row, actorDisplayName, actorAvatarFileId }) =>
        this.toPublic(row, actorDisplayName, actorAvatarFileId),
    );
    const hasMore = rows.length > limit;
    return {
      items,
      nextCursor: hasMore && items.length > 0 ? items.at(-1)!.createdAt : null,
    };
  }

  async unreadCountForUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.recipientUserId, userId),
          isNull(schema.notifications.readAt),
          eq(schema.notifications.hidden, false),
        ),
      );
    return row?.count ?? 0;
  }

  async markRead(userId: string, id: string): Promise<void> {
    const now = new Date();
    const rows = await this.db
      .update(schema.notifications)
      .set({ readAt: now, seenAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.recipientUserId, userId),
          eq(schema.notifications.hidden, false),
        ),
      )
      .returning({ id: schema.notifications.id });
    if (rows.length === 0) throw new NotFoundError("Notification not found");
  }

  async markAllRead(userId: string): Promise<number> {
    const rows = await this.db
      .update(schema.notifications)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.notifications.recipientUserId, userId),
          isNull(schema.notifications.readAt),
          eq(schema.notifications.hidden, false),
        ),
      )
      .returning({ id: schema.notifications.id });
    return rows.length;
  }

  async markSeen(userId: string, id: string): Promise<void> {
    const rows = await this.db
      .update(schema.notifications)
      .set({ seenAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.recipientUserId, userId),
          eq(schema.notifications.hidden, false),
        ),
      )
      .returning({ id: schema.notifications.id });
    if (rows.length === 0) throw new NotFoundError("Notification not found");
  }

  /** Read full settings (catalog-shaped preferences + pause) for a user. */
  async getSettings(userId: string): Promise<NotificationSettingsBase> {
    const rows = await this.db
      .select({
        typeKey: schema.userNotificationPreferences.typeKey,
        enabled: schema.userNotificationPreferences.enabled,
        emailEnabled: schema.userNotificationPreferences.emailEnabled,
      })
      .from(schema.userNotificationPreferences)
      .where(eq(schema.userNotificationPreferences.userId, userId));
    const overrides = new Map(rows.map((r) => [r.typeKey, r]));
    return {
      preferences: NOTIFICATION_TYPE_LIST.map((def) => {
        const row = overrides.get(def.key);
        return {
          type: def.key,
          category: def.category,
          enabled: row?.enabled ?? def.defaultEnabled,
          emailEnabled: row?.emailEnabled ?? false,
        };
      }),
      paused: await this.isPaused(userId),
    };
  }

  async setSettings(
    userId: string,
    updates: NotificationSettingsUpdate,
  ): Promise<NotificationSettingsBase> {
    if (updates.paused !== undefined) {
      await this.setPaused(userId, updates.paused);
    }
    if (updates.preferences && updates.preferences.length > 0) {
      for (const update of updates.preferences) {
        if (!isNotificationType(update.type)) {
          throw new ValidationError(
            `Unknown notification type "${update.type}"`,
          );
        }
        const set: Record<string, unknown> = {};
        if (update.enabled !== undefined) set.enabled = update.enabled;
        if (update.emailEnabled !== undefined) {
          set.emailEnabled = update.emailEnabled;
        }
        if (Object.keys(set).length === 0) continue;
        await this.db
          .insert(schema.userNotificationPreferences)
          .values({
            userId,
            typeKey: update.type,
            ...set,
          })
          .onConflictDoUpdate({
            target: [
              schema.userNotificationPreferences.userId,
              schema.userNotificationPreferences.typeKey,
            ],
            set: { ...set, updatedAt: new Date() },
          });
      }
    }
    return this.getSettings(userId);
  }

  private async isPaused(userId: string): Promise<boolean> {
    const row = await this.db
      .select({ paused: schema.userPreferences.notificationsPaused })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .limit(1);
    return row[0]?.paused ?? false;
  }

  private async setPaused(userId: string, paused: boolean): Promise<void> {
    await this.db
      .insert(schema.userPreferences)
      .values({ userId, notificationsPaused: paused })
      .onConflictDoUpdate({
        target: schema.userPreferences.userId,
        set: { notificationsPaused: paused },
      });
  }

  /** Hide notifications related to removed/hidden content (e.g. deleted topics). */
  async hideBySubject(subjectType: string, subjectId: string): Promise<number> {
    const rows = await this.db
      .update(schema.notifications)
      .set({ hidden: true, updatedAt: new Date() })
      .where(
        and(
          eq(schema.notifications.subjectType, subjectType),
          eq(schema.notifications.subjectId, subjectId),
          eq(schema.notifications.hidden, false),
        ),
      )
      .returning({ id: schema.notifications.id });
    return rows.length;
  }

  private async resolveRecipients(
    rule: RecipientRule,
    excludeUserIds: string[] = [],
  ): Promise<string[]> {
    let userIds: string[] = [];
    if (rule.kind === "users") {
      const ids = [...new Set(rule.userIds)];
      if (ids.length > 0) {
        const rows = await this.db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(
            and(
              inArray(schema.users.id, ids),
              isNull(schema.users.disabledAt),
            ),
          );
        userIds = rows.map((r) => r.id);
      }
    } else if (rule.kind === "permission") {
      const rows = await this.db
        .select({ userId: schema.userRoles.userId })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
        .innerJoin(
          schema.rolePermissions,
          eq(schema.rolePermissions.roleId, schema.roles.id),
        )
        .innerJoin(
          schema.permissions,
          eq(schema.permissions.id, schema.rolePermissions.permissionId),
        )
        .innerJoin(schema.users, eq(schema.users.id, schema.userRoles.userId))
        .where(
          and(
            eq(schema.permissions.key, rule.permission),
            isNull(schema.users.disabledAt),
          ),
        );
      userIds = rows.map((r) => r.userId);
    } else if (rule.kind === "role") {
      const rows = await this.db
        .select({ userId: schema.userRoles.userId })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
        .innerJoin(schema.users, eq(schema.users.id, schema.userRoles.userId))
        .where(
          and(
            eq(schema.roles.name, rule.roleName),
            isNull(schema.users.disabledAt),
          ),
        );
      userIds = rows.map((r) => r.userId);
    } else {
      const rows = await this.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(isNull(schema.users.disabledAt));
      userIds = rows.map((r) => r.id);
    }

    const excluded = new Set(excludeUserIds);
    return [...new Set(userIds)].filter((id) => !excluded.has(id));
  }

  private async filterEnabledByPreference(
    userIds: string[],
    type: NotificationType,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({
        userId: schema.userNotificationPreferences.userId,
        enabled: schema.userNotificationPreferences.enabled,
      })
      .from(schema.userNotificationPreferences)
      .where(
        and(
          eq(schema.userNotificationPreferences.typeKey, type),
          inArray(schema.userNotificationPreferences.userId, userIds),
        ),
      );
    const overrides = new Map(rows.map((r) => [r.userId, r.enabled]));
    const definition = NOTIFICATION_TYPE_CATALOG[type];
    return userIds.filter((id) => overrides.get(id) ?? definition.defaultEnabled);
  }

  /**
   * Remove recipients with notifications paused. Mandatory types bypass the
   * pause so future truly-critical notifications always land.
   */
  private async filterPaused(
    userIds: string[],
    type: NotificationType,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    if (NOTIFICATION_TYPE_CATALOG[type].mandatory) return userIds;
    const rows = await this.db
      .select({ userId: schema.userPreferences.userId })
      .from(schema.userPreferences)
      .where(
        and(
          inArray(schema.userPreferences.userId, userIds),
          eq(schema.userPreferences.notificationsPaused, true),
        ),
      );
    const paused = new Set(rows.map((r) => r.userId));
    return userIds.filter((id) => !paused.has(id));
  }

  /**
   * Persist a draft for one recipient. Returns the new notification id when a
   * fresh row was inserted, or null when the draft was deduped or merged into
   * an existing aggregate. Only fresh inserts count as delivered.
   */
  private async persistForRecipient(
    recipientUserId: string,
    draft: NotificationDraft,
  ): Promise<string | null> {
    if (draft.dedupeKey) {
      const existing = await this.db.query.notifications.findFirst({
        where: and(
          eq(schema.notifications.recipientUserId, recipientUserId),
          eq(schema.notifications.dedupeKey, draft.dedupeKey),
        ),
      });
      if (existing) return null;
    }

    if (draft.aggregateKey) {
      const aggregate = await this.db
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.recipientUserId, recipientUserId),
            eq(schema.notifications.type, draft.type),
            eq(schema.notifications.aggregateKey, draft.aggregateKey),
            isNull(schema.notifications.readAt),
            eq(schema.notifications.hidden, false),
          ),
        )
        .limit(1);
      if (aggregate.length > 0) {
        await this.db
          .update(schema.notifications)
          .set({
            aggregatedCount: sql`${schema.notifications.aggregatedCount} + 1`,
            title: draft.title,
            body: draft.body ?? null,
            href: draft.href ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.notifications.id, aggregate[0]!.id));
        return null;
      }
    }

    const id = generateId();
    await this.db.insert(schema.notifications).values({
      id,
      recipientUserId,
      type: draft.type,
      title: draft.title,
      body: draft.body ?? null,
      href: draft.href ?? null,
      actorUserId: draft.actorUserId ?? null,
      subjectType: draft.subjectType ?? null,
      subjectId: draft.subjectId ?? null,
      payload: draft.payload ?? {},
      dedupeKey: draft.dedupeKey ?? null,
      aggregateKey: draft.aggregateKey ?? null,
      aggregatedCount: 1,
      hidden: draft.hidden ?? false,
    });
    return id;
  }

  private toPublic(
    row: typeof schema.notifications.$inferSelect,
    actorDisplayName: string | null,
    actorAvatarFileId: string | null = null,
  ): NotificationPublic {
    return {
      id: row.id,
      type: row.type as NotificationType,
      title: row.title,
      body: row.body,
      href: row.href,
      actorUserId: row.actorUserId,
      actorDisplayName,
      actorAvatarUrl: actorAvatarFileId
        ? `/api/v1/files/${actorAvatarFileId}/content`
        : null,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      aggregatedCount: row.aggregatedCount,
      readAt: row.readAt?.toISOString() ?? null,
      seenAt: row.seenAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export function registerNotificationSource(
  events: DomainEventBus,
  registry: NotificationSourceRegistry,
  service: NotificationService,
  source: NotificationSource,
): void {
  registry.register(source);
  events.subscribe(source.eventType, (event) => service.notifyFromEvent(event));
}