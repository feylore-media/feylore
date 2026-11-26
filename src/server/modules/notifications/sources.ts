import type { Permission, RoleName } from "../../../shared/permissions.js";
import type { NotificationType } from "../../../shared/notifications.js";
import type { DomainEvent } from "./events.js";

export type RecipientRule =
  | { kind: "users"; userIds: string[] }
  | { kind: "permission"; permission: Permission }
  | { kind: "role"; roleName: RoleName }
  | { kind: "all" };

export interface NotificationDraft {
  recipient: RecipientRule;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  actorUserId?: string;
  subjectType?: string;
  subjectId?: string;
  payload?: Record<string, unknown>;
  /**
   * Stable per-recipient key. When a notification with the same key already
   * exists for a recipient, the draft is skipped (idempotent replay). Use to
   * guarantee a single notification per source event/entity.
   */
  dedupeKey?: string;
  /**
   * Stable per-recipient key that merges new unread notifications of the same
   * type+recipient+aggregateKey into one row, incrementing `aggregatedCount`
   * and refreshing title/body.
   */
  aggregateKey?: string;
  /** Users explicitly excluded from delivery (e.g. the actor). */
  excludeUserIds?: string[];
  hidden?: boolean;
}

export interface NotificationSource {
  eventType: string;
  resolve(event: DomainEvent): Promise<NotificationDraft[]> | NotificationDraft[];
}

export class NotificationSourceRegistry {
  private readonly sources = new Map<string, NotificationSource>();

  register(source: NotificationSource): void {
    this.sources.set(source.eventType, source);
  }

  forEventType(eventType: string): NotificationSource | undefined {
    return this.sources.get(eventType);
  }
}