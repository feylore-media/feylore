import { NOTIFICATION_TYPES } from "../../../../shared/notifications.js";
import type { DomainEvent } from "../events.js";
import type { NotificationDraft, NotificationSource } from "../sources.js";

export interface AchievementEarnedPayload {
  grantId?: unknown;
  definitionId?: unknown;
  definitionKey?: unknown;
  recipientUserId?: unknown;
  reasonType?: unknown;
  reasonId?: unknown;
  source?: unknown;
  achievement?: unknown;
  earnedAt?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Renders the canonical `achievement.earned` domain event into a recipient
 * notification. The event carries IDs and safe structured context; this
 * source is where presentation copy is composed.
 */
export class AchievementEarnedSource implements NotificationSource {
  readonly eventType = "achievement.earned";

  resolve(event: DomainEvent): NotificationDraft[] {
    const payload = event.payload as AchievementEarnedPayload;
    const grantId =
      typeof payload.grantId === "string" ? payload.grantId : null;
    const recipientUserId =
      typeof payload.recipientUserId === "string"
        ? payload.recipientUserId
        : null;
    if (!grantId || !recipientUserId) return [];

    const achievement = asRecord(payload.achievement);
    const source = asRecord(payload.source);
    const name =
      achievement && typeof achievement.name === "string" && achievement.name
        ? achievement.name
        : "an achievement";
    const sourceLabel =
      source && typeof source.label === "string" && source.label
        ? source.label
        : null;

    return [
      {
        recipient: { kind: "users", userIds: [recipientUserId] },
        type: NOTIFICATION_TYPES.ACHIEVEMENT_EARNED,
        title: `You earned ${name}`,
        body: sourceLabel ? `From ${sourceLabel}` : undefined,
        actorUserId: event.actorUserId,
        subjectType: "achievement",
        subjectId:
          typeof payload.definitionId === "string"
            ? payload.definitionId
            : grantId,
        payload: {
          grantId,
          definitionId:
            typeof payload.definitionId === "string"
              ? payload.definitionId
              : null,
          definitionKey:
            typeof payload.definitionKey === "string"
              ? payload.definitionKey
              : null,
          reasonType:
            typeof payload.reasonType === "string" ? payload.reasonType : null,
          reasonId:
            typeof payload.reasonId === "string" ? payload.reasonId : null,
        },
        dedupeKey: `achievement-earned:${grantId}`,
      },
    ];
  }
}
