import { NOTIFICATION_TYPES } from "../../../../shared/notifications.js";
import type { DomainEvent } from "../events.js";
import type { NotificationDraft, NotificationSource } from "../sources.js";

export interface ChallengeInvitedPayload {
  inviteId?: unknown;
  challengeId?: unknown;
  title?: unknown;
  clubId?: unknown;
  inviterUserId?: unknown;
  inviteeUserId?: unknown;
}

/**
 * Renders the `challenge.invited` domain event into a notification for the
 * invitee. The invite itself (accept/decline) lives on the Challenges hub;
 * the notification only points at it. Republishing is a no-op via the
 * dedupe key.
 */
export class ChallengeInviteSource implements NotificationSource {
  readonly eventType = "challenge.invited";

  resolve(event: DomainEvent): NotificationDraft[] {
    const payload = event.payload as ChallengeInvitedPayload;
    const inviteId =
      typeof payload.inviteId === "string" ? payload.inviteId : null;
    const challengeId =
      typeof payload.challengeId === "string" ? payload.challengeId : null;
    const inviteeUserId =
      typeof payload.inviteeUserId === "string" ? payload.inviteeUserId : null;
    if (!inviteId || !challengeId || !inviteeUserId) return [];

    const title =
      typeof payload.title === "string" && payload.title
        ? `"${payload.title}"`
        : "a challenge";

    return [
      {
        recipient: { kind: "users", userIds: [inviteeUserId] },
        type: NOTIFICATION_TYPES.CHALLENGE_INVITED,
        title: `You were invited to ${title}`,
        href: `/challenges/${challengeId}`,
        actorUserId: event.actorUserId,
        subjectType: "challenge",
        subjectId: challengeId,
        payload: {
          inviteId,
          challengeId,
          clubId: typeof payload.clubId === "string" ? payload.clubId : null,
        },
        dedupeKey: `challenge-invite:${inviteId}`,
        excludeUserIds: event.actorUserId ? [event.actorUserId] : [],
      },
    ];
  }
}
