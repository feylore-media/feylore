import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import type { AuthUser } from "../authorization/service.js";
import type { ActivityService } from "../activity/service.js";
import type { DomainEventBus } from "../notifications/events.js";
import type { SystemSettingsService } from "../settings/system-service.js";
import { ACTIVITY_TYPES } from "../../../shared/activity.js";
import {
  achievementDefineSchema,
  achievementDefinitionUpdateSchema,
  achievementGrantSnapshotSchema,
  type AchievementDefinitionPublic,
  type AchievementDefineInput,
  type AchievementDefinitionUpdateInput,
  type AchievementGrantSnapshot,
  type ProfileAchievementView,
  type UserAchievementPublic,
} from "../../../shared/achievements.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../shared/errors.js";
import type { AchievementSourceGuard } from "./source-guards.js";
import { UnknownAchievementSourceError } from "./source-guards.js";

type DefinitionRow = typeof schema.achievementDefinitions.$inferSelect;
type GrantRow = typeof schema.userAchievements.$inferSelect;

export interface GrantAchievementInput {
  source: { type: string; id: string };
  /** Stable definition key within the source (e.g. "completed"). */
  definitionKey: string;
  recipientId: string;
  reason?: { type: string; id?: string | null; label?: string | null };
  /** Opaque feature context preserved for historical meaning. */
  metadata?: Record<string, unknown>;
  /** Issuing actor for activity/domain provenance; defaults to recipient. */
  actorUserId?: string;
  earnedAt?: Date;
}

export interface GrantVisibilityContext {
  viewer: AuthUser;
  ownerId: string;
  /**
   * Profile/privacy gate result (e.g. `profiles.canViewProfileAsync`).
   * The owner always passes; other viewers must pass this AND every grant's
   * source-visibility check.
   */
  viewerMaySeeProfile: boolean;
}

const MODULE_DISABLED_MESSAGE = "Achievements are disabled";

/**
 * Owns achievement definitions and grants. Feature modules never insert
 * grants directly: they call `grantAchievement` with a source/reason
 * reference, and the service enforces idempotency, provenance capture, and
 * `achievement.earned` emission.
 */
export class AchievementService {
  private readonly guards = new Map<string, AchievementSourceGuard>();
  private activity?: ActivityService;
  private events?: DomainEventBus;

  constructor(
    private readonly db: Database,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  registerSourceGuard(sourceType: string, guard: AchievementSourceGuard) {
    this.guards.set(sourceType, guard);
  }

  /** Exposed so feature routes can apply issuance-side ownership checks. */
  getSourceGuard(sourceType: string): AchievementSourceGuard {
    return this.guardFor(sourceType);
  }

  setActivityService(activity: ActivityService) {
    this.activity = activity;
  }

  setDomainEvents(events: DomainEventBus) {
    this.events = events;
  }

  async isEnabled(): Promise<boolean> {
    const enabled = await this.systemSettings.getEnabledFeatureModules();
    return enabled.includes("achievements");
  }

  private async requireEnabled() {
    if (!(await this.isEnabled())) {
      throw new ForbiddenError(MODULE_DISABLED_MESSAGE);
    }
  }

  private guardFor(sourceType: string): AchievementSourceGuard {
    const guard = this.guards.get(sourceType);
    if (!guard) throw new UnknownAchievementSourceError(sourceType);
    return guard;
  }

  // ------------------------------------------------------------------
  // Definitions (feature-owned management)
  // ------------------------------------------------------------------

  async defineAchievement(
    actor: AuthUser,
    input: unknown,
  ): Promise<AchievementDefinitionPublic> {
    await this.requireEnabled();
    const parsed: AchievementDefineInput = achievementDefineSchema.parse(input);
    const guard = this.guardFor(parsed.source.type);
    await guard.assertCanManage(actor, parsed.source.id);

    const existing = await this.db.query.achievementDefinitions.findFirst({
      where: and(
        eq(schema.achievementDefinitions.sourceType, parsed.source.type),
        eq(schema.achievementDefinitions.sourceId, parsed.source.id),
        eq(schema.achievementDefinitions.key, parsed.key),
      ),
    });
    if (existing) {
      throw new ConflictError(
        "Achievement definition already exists for this source",
      );
    }

    const sourceLabel = await guard.resolveSourceLabel(parsed.source.id);
    const id = generateId();
    await this.db.insert(schema.achievementDefinitions).values({
      id,
      key: parsed.key,
      name: parsed.name,
      description: parsed.description ?? null,
      icon: parsed.icon ?? null,
      presentation: parsed.presentation ?? null,
      sourceType: parsed.source.type,
      sourceId: parsed.source.id,
      sourceLabel,
      createdByUserId: actor.id,
      state: "active",
    });
    return this.toPublicDefinition(await this.requireDefinition(id));
  }

  async updateAchievementDefinition(
    actor: AuthUser,
    definitionId: string,
    input: unknown,
  ): Promise<AchievementDefinitionPublic> {
    await this.requireEnabled();
    const parsed: AchievementDefinitionUpdateInput =
      achievementDefinitionUpdateSchema.parse(input);
    const row = await this.requireDefinition(definitionId);
    const guard = this.guardFor(row.sourceType);
    await guard.assertCanManage(actor, row.sourceId);

    await this.db
      .update(schema.achievementDefinitions)
      .set({
        name: parsed.name ?? row.name,
        description:
          parsed.description === undefined
            ? row.description
            : parsed.description,
        icon: parsed.icon === undefined ? row.icon : parsed.icon,
        presentation:
          parsed.presentation === undefined
            ? row.presentation
            : parsed.presentation,
        updatedAt: new Date(),
      })
      .where(eq(schema.achievementDefinitions.id, definitionId));
    return this.toPublicDefinition(await this.requireDefinition(definitionId));
  }

  async archiveAchievement(
    actor: AuthUser,
    definitionId: string,
  ): Promise<AchievementDefinitionPublic> {
    await this.requireEnabled();
    const row = await this.requireDefinition(definitionId);
    const guard = this.guardFor(row.sourceType);
    await guard.assertCanManage(actor, row.sourceId);
    return this.setDefinitionState(definitionId, "archived");
  }

  async restoreAchievement(
    actor: AuthUser,
    definitionId: string,
  ): Promise<AchievementDefinitionPublic> {
    await this.requireEnabled();
    const row = await this.requireDefinition(definitionId);
    const guard = this.guardFor(row.sourceType);
    await guard.assertCanManage(actor, row.sourceId);
    return this.setDefinitionState(definitionId, "active");
  }

  /**
   * Source-internal lifecycle hook: archive every definition owned by a
   * source (e.g. goal deleted). Grants survive — definitions are archived,
   * never destructively deleted by the service.
   */
  async archiveDefinitionsForSource(
    sourceType: string,
    sourceId: string,
  ): Promise<number> {
    const rows = await this.db
      .select({ id: schema.achievementDefinitions.id })
      .from(schema.achievementDefinitions)
      .where(
        and(
          eq(schema.achievementDefinitions.sourceType, sourceType),
          eq(schema.achievementDefinitions.sourceId, sourceId),
        ),
      );
    for (const row of rows) {
      await this.db
        .update(schema.achievementDefinitions)
        .set({ state: "archived", updatedAt: new Date() })
        .where(eq(schema.achievementDefinitions.id, row.id));
    }
    return rows.length;
  }

  /**
   * Source-internal helper: refresh the cached source label on owned
   * definitions (e.g. goal renamed). Grant rows keep their own snapshot.
   */
  async setSourceLabel(
    sourceType: string,
    sourceId: string,
    label: string | null,
  ): Promise<void> {
    await this.db
      .update(schema.achievementDefinitions)
      .set({ sourceLabel: label, updatedAt: new Date() })
      .where(
        and(
          eq(schema.achievementDefinitions.sourceType, sourceType),
          eq(schema.achievementDefinitions.sourceId, sourceId),
        ),
      );
  }

  async getAchievement(
    definitionId: string,
  ): Promise<AchievementDefinitionPublic> {
    return this.toPublicDefinition(await this.requireDefinition(definitionId));
  }

  async getSourceAchievements(
    sourceType: string,
    sourceId: string,
    options: { includeArchived?: boolean } = {},
  ): Promise<AchievementDefinitionPublic[]> {
    const includeArchived = options.includeArchived ?? true;
    const conditions = [
      eq(schema.achievementDefinitions.sourceType, sourceType),
      eq(schema.achievementDefinitions.sourceId, sourceId),
    ];
    if (!includeArchived) {
      conditions.push(eq(schema.achievementDefinitions.state, "active"));
    }
    const rows = await this.db
      .select()
      .from(schema.achievementDefinitions)
      .where(and(...conditions));
    return rows.map((row) => this.toPublicDefinition(row));
  }

  private async setDefinitionState(
    definitionId: string,
    state: "active" | "archived",
  ): Promise<AchievementDefinitionPublic> {
    await this.db
      .update(schema.achievementDefinitions)
      .set({ state, updatedAt: new Date() })
      .where(eq(schema.achievementDefinitions.id, definitionId));
    return this.toPublicDefinition(await this.requireDefinition(definitionId));
  }

  private async requireDefinition(
    definitionId: string,
  ): Promise<DefinitionRow> {
    const row = await this.db.query.achievementDefinitions.findFirst({
      where: eq(schema.achievementDefinitions.id, definitionId),
    });
    if (!row) throw new NotFoundError("Achievement definition not found");
    return row;
  }

  private toPublicDefinition(row: DefinitionRow): AchievementDefinitionPublic {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description ?? null,
      icon: row.icon ?? null,
      presentation:
        (row.presentation as Record<string, unknown> | null) ?? null,
      // Definitions only ever persist registry-validated source types.
      sourceType: row.sourceType as AchievementDefinitionPublic["sourceType"],
      sourceId: row.sourceId,
      sourceLabel: row.sourceLabel ?? null,
      state: row.state === "archived" ? "archived" : "active",
      createdByUserId: row.createdByUserId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ------------------------------------------------------------------
  // Grants
  // ------------------------------------------------------------------

  /**
   * Idempotent grant. Reprocessing the same completion event never creates a
   * duplicate: default behavior is one grant per user per definition.
   * Archived definitions stop granting; existing grants are preserved.
   */
  async grantAchievement(
    input: GrantAchievementInput,
  ): Promise<{ grant: UserAchievementPublic; created: boolean }> {
    await this.requireEnabled();
    const definition = await this.db.query.achievementDefinitions.findFirst({
      where: and(
        eq(schema.achievementDefinitions.sourceType, input.source.type),
        eq(schema.achievementDefinitions.sourceId, input.source.id),
        eq(schema.achievementDefinitions.key, input.definitionKey),
      ),
    });
    if (!definition || definition.state !== "active") {
      throw new NotFoundError("Achievement definition not found");
    }

    const recipient = await this.db.query.users.findFirst({
      where: eq(schema.users.id, input.recipientId),
      columns: { id: true },
    });
    if (!recipient) throw new NotFoundError("Recipient not found");

    const guard = this.guardFor(definition.sourceType);
    const sourceLabel = await guard.resolveSourceLabel(definition.sourceId);
    const earnedAt = input.earnedAt ?? new Date();
    const snapshot = achievementGrantSnapshotSchema.parse({
      achievement: {
        id: definition.id,
        key: definition.key,
        name: definition.name,
        description: definition.description ?? null,
        icon: definition.icon ?? null,
        presentation: definition.presentation ?? null,
      },
      source: {
        type: definition.sourceType,
        id: definition.sourceId,
        label: sourceLabel ?? definition.sourceLabel ?? null,
      },
    });

    const inserted = await this.db
      .insert(schema.userAchievements)
      .values({
        id: generateId(),
        userId: input.recipientId,
        achievementDefinitionId: definition.id,
        earnedAt,
        sourceType: definition.sourceType,
        sourceId: definition.sourceId,
        sourceLabel: sourceLabel ?? definition.sourceLabel ?? null,
        reasonType: input.reason?.type ?? null,
        reasonId: input.reason?.id ?? null,
        reasonLabel: input.reason?.label ?? null,
        snapshot,
        metadata: input.metadata ?? null,
      })
      .onConflictDoNothing({
        target: [
          schema.userAchievements.userId,
          schema.userAchievements.achievementDefinitionId,
        ],
      })
      .returning();

    if (inserted.length === 0) {
      // Reprocessed completion event: return the existing grant unchanged.
      const existingGrant = await this.db.query.userAchievements.findFirst({
        where: and(
          eq(schema.userAchievements.userId, input.recipientId),
          eq(schema.userAchievements.achievementDefinitionId, definition.id),
        ),
      });
      if (!existingGrant) {
        throw new ConflictError("Achievement already granted");
      }
      return {
        grant: this.toPublicGrant(existingGrant, definition),
        created: false,
      };
    }

    const row = inserted[0]!;
    const grant = this.toPublicGrant(row, definition);

    if (this.activity) {
      await this.activity.record(
        input.recipientId,
        ACTIVITY_TYPES.ACHIEVEMENT_EARNED,
        {
          subjectType: "achievement",
          subjectId: definition.id,
          payload: {
            grantId: row.id,
            definitionId: definition.id,
            definitionKey: definition.key,
            sourceType: definition.sourceType,
            sourceId: definition.sourceId,
            sourceLabel: row.sourceLabel ?? null,
            reasonType: row.reasonType ?? null,
            reasonId: row.reasonId ?? null,
            earnedAt: row.earnedAt.toISOString(),
          },
        },
      );
    }

    if (this.events) {
      await this.events.publish(
        "achievement.earned",
        {
          grantId: row.id,
          definitionId: definition.id,
          definitionKey: definition.key,
          recipientUserId: input.recipientId,
          reasonType: row.reasonType ?? null,
          reasonId: row.reasonId ?? null,
          source: {
            type: definition.sourceType,
            id: definition.sourceId,
            label: row.sourceLabel ?? null,
          },
          achievement: {
            name: definition.name,
            icon: definition.icon ?? null,
          },
          earnedAt: row.earnedAt.toISOString(),
        },
        { actorUserId: input.actorUserId ?? input.recipientId },
      );
    }

    return { grant, created: true };
  }

  async hasAchievement(userId: string, definitionId: string): Promise<boolean> {
    const row = await this.db.query.userAchievements.findFirst({
      where: and(
        eq(schema.userAchievements.userId, userId),
        eq(schema.userAchievements.achievementDefinitionId, definitionId),
      ),
    });
    return Boolean(row);
  }

  /**
   * The recipient's grant of one definition (profile/history lookups).
   * Returns null when unearned or when the viewer may not see the grant's
   * source. Throws ForbiddenError when the viewer may not see the owner's
   * achievements at all.
   */
  async getUserGrantForDefinition(
    context: GrantVisibilityContext & { definitionId: string },
  ): Promise<UserAchievementPublic | null> {
    this.requireGrantVisibility(context);
    const row = await this.db.query.userAchievements.findFirst({
      where: and(
        eq(schema.userAchievements.userId, context.ownerId),
        eq(
          schema.userAchievements.achievementDefinitionId,
          context.definitionId,
        ),
      ),
    });
    if (!row) return null;
    if (!(await this.viewerMaySeeGrant(context, row))) return null;
    return (await this.toPublicGrantRows([row]))[0]!;
  }

  /**
   * All of an owner's earned achievements, oldest first (stable history),
   * paginated and source-visibility filtered for non-owners.
   */
  async listUserGrants(
    context: GrantVisibilityContext & { limit?: number; offset?: number },
  ): Promise<{ items: UserAchievementPublic[]; total: number }> {
    this.requireGrantVisibility(context);
    const visible = await this.visibleGrants(context);
    const limit = Math.min(Math.max(context.limit ?? 20, 1), 100);
    const offset = Math.max(context.offset ?? 0, 0);
    const page = visible.slice(offset, offset + limit);
    return {
      items: await this.toPublicGrantRows(page),
      total: visible.length,
    };
  }

  async recentUserGrants(
    context: GrantVisibilityContext & { limit?: number },
  ): Promise<ProfileAchievementView[]> {
    this.requireGrantVisibility(context);
    const limit = Math.min(Math.max(context.limit ?? 10, 1), 50);
    const visible = await this.visibleGrants(context);
    const newest = visible.slice(-limit).reverse();
    const grants = await this.toPublicGrantRows(newest);
    return grants.map((view) => ({
      id: view.id,
      definitionId: view.definitionId,
      definitionKey: view.definitionKey,
      name: view.name,
      description: view.description,
      icon: view.icon,
      sourceType: view.sourceType,
      sourceLabel: view.sourceLabel,
      earnedAt: view.earnedAt,
    }));
  }

  async countUserGrants(context: GrantVisibilityContext): Promise<number> {
    this.requireGrantVisibility(context);
    const visible = await this.visibleGrants(context);
    return visible.length;
  }

  // ------------------------------------------------------------------
  // Visibility + presentation
  // ------------------------------------------------------------------

  private requireGrantVisibility(context: GrantVisibilityContext) {
    if (context.viewer.id === context.ownerId) return;
    if (!context.viewerMaySeeProfile) throw new ForbiddenError();
  }

  /**
   * Grants ordered oldest-first with source visibility applied. Owners see
   * everything (including private sources); other viewers only see grants
   * whose source they may learn about.
   */
  private async visibleGrants(
    context: GrantVisibilityContext,
  ): Promise<GrantRow[]> {
    const rows = await this.db
      .select()
      .from(schema.userAchievements)
      .where(eq(schema.userAchievements.userId, context.ownerId))
      .orderBy(
        desc(schema.userAchievements.earnedAt),
        desc(schema.userAchievements.createdAt),
      );
    // Oldest-first is the stable history order; reverse for recency.
    const oldestFirst = [...rows].reverse();
    if (context.viewer.id === context.ownerId) return oldestFirst;
    const visible: GrantRow[] = [];
    for (const row of oldestFirst) {
      if (await this.viewerMaySeeGrant(context, row)) visible.push(row);
    }
    return visible;
  }

  private async viewerMaySeeGrant(
    context: GrantVisibilityContext,
    row: GrantRow,
  ): Promise<boolean> {
    if (context.viewer.id === context.ownerId) return true;
    try {
      const guard = this.guardFor(row.sourceType);
      return guard.canViewerSeeSource(context.viewer, row.sourceId);
    } catch {
      // Unknown source type: fail closed — never leak an achievement whose
      // provenance cannot be reasoned about.
      return false;
    }
  }

  private async loadDefinitions(
    definitionIds: string[],
  ): Promise<Map<string, DefinitionRow>> {
    const map = new Map<string, DefinitionRow>();
    const unique = [...new Set(definitionIds)];
    if (unique.length === 0) return map;
    const rows = await this.db
      .select()
      .from(schema.achievementDefinitions)
      .where(inArray(schema.achievementDefinitions.id, unique));
    for (const row of rows) map.set(row.id, row);
    return map;
  }

  /**
   * Grants are self-describing via their immutable snapshot; the joined
   * definition is only a fallback for rows that predate snapshots. Snapshot
   * wins so history keeps its earned-time meaning after renames.
   */
  private toPublicGrant(
    row: GrantRow,
    definition?: DefinitionRow,
  ): UserAchievementPublic {
    const snapshot = this.parseSnapshot(row.snapshot);
    return {
      id: row.id,
      userId: row.userId,
      definitionId: row.achievementDefinitionId,
      definitionKey: snapshot?.achievement.key ?? definition?.key ?? "",
      name: snapshot?.achievement.name ?? definition?.name ?? "Achievement",
      description:
        snapshot?.achievement.description ?? definition?.description ?? null,
      icon: snapshot?.achievement.icon ?? definition?.icon ?? null,
      presentation:
        (snapshot?.achievement.presentation as
          Record<string, unknown> | null | undefined) ??
        (definition?.presentation as Record<string, unknown> | null) ??
        null,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceLabel: row.sourceLabel ?? snapshot?.source.label ?? null,
      reasonType: row.reasonType ?? null,
      reasonId: row.reasonId ?? null,
      reasonLabel: row.reasonLabel ?? null,
      snapshot,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      earnedAt: row.earnedAt.toISOString(),
    };
  }

  private parseSnapshot(value: unknown): AchievementGrantSnapshot | null {
    if (!value || typeof value !== "object") return null;
    const parsed = achievementGrantSnapshotSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  /** Joins live definitions as a fallback; snapshots remain authoritative. */
  private async toPublicGrantRows(
    rows: GrantRow[],
  ): Promise<UserAchievementPublic[]> {
    const definitions = await this.loadDefinitions(
      rows.map((row) => row.achievementDefinitionId),
    );
    return rows.map((row) =>
      this.toPublicGrant(row, definitions.get(row.achievementDefinitionId)),
    );
  }
}
