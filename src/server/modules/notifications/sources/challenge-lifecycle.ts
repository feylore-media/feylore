import { and, eq, ne } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import * as schema from "../../../db/schema.js";
import { NOTIFICATION_TYPES } from "../../../../shared/notifications.js";
import type { DomainEvent } from "../events.js";
import type { NotificationDraft, NotificationSource } from "../sources.js";

export interface ChallengeLifecyclePayload {
  challengeId?: unknown;
  title?: unknown;
  clubId?: unknown;
}

async function participantUserIds(
  db: Database,
  challengeId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: schema.challengeParticipants.userId })
    .from(schema.challengeParticipants)
    .where(
      and(
        eq(schema.challengeParticipants.challengeId, challengeId),
        ne(schema.challengeParticipants.state, "left"),
      ),
    );
  return rows.map((row) => row.userId);
}

function challengeTitle(payload: ChallengeLifecyclePayload): string {
  return typeof payload.title === "string" && payload.title
    ? `"${payload.title}"`
    : "a challenge";
}

function challengeIdOf(payload: ChallengeLifecyclePayload): string | null {
  return typeof payload.challengeId === "string" ? payload.challengeId : null;
}

/**
 * Renders `challenge.started` into one notification per current
 * participant. The sweep publishes once per challenge; the dedupe key
 * keeps replays a no-op per recipient.
 */
export class ChallengeStartedSource implements NotificationSource {
  readonly eventType = "challenge.started";

  constructor(private readonly db: Database) {}

  async resolve(event: DomainEvent): Promise<NotificationDraft[]> {
    const payload = event.payload as ChallengeLifecyclePayload;
    const challengeId = challengeIdOf(payload);
    if (!challengeId) return [];
    const recipientIds = await participantUserIds(this.db, challengeId);
    if (recipientIds.length === 0) return [];
    return [
      {
        recipient: { kind: "users", userIds: recipientIds },
        type: NOTIFICATION_TYPES.CHALLENGE_STARTED,
        title: `${challengeTitle(payload)} has started`,
        href: `/challenges/${challengeId}`,
        actorUserId: event.actorUserId,
        subjectType: "challenge",
        subjectId: challengeId,
        payload: {
          challengeId,
          clubId: typeof payload.clubId === "string" ? payload.clubId : null,
        },
        dedupeKey: `challenge-started:${challengeId}`,
      },
    ];
  }
}

/**
 * Renders `challenge.ending_soon` into one notification per current
 * participant as the evaluation window closes.
 */
export class ChallengeEndingSoonSource implements NotificationSource {
  readonly eventType = "challenge.ending_soon";

  constructor(private readonly db: Database) {}

  async resolve(event: DomainEvent): Promise<NotificationDraft[]> {
    const payload = event.payload as ChallengeLifecyclePayload;
    const challengeId = challengeIdOf(payload);
    if (!challengeId) return [];
    const recipientIds = await participantUserIds(this.db, challengeId);
    if (recipientIds.length === 0) return [];
    return [
      {
        recipient: { kind: "users", userIds: recipientIds },
        type: NOTIFICATION_TYPES.CHALLENGE_ENDING_SOON,
        title: `${challengeTitle(payload)} ends soon`,
        href: `/challenges/${challengeId}`,
        actorUserId: event.actorUserId,
        subjectType: "challenge",
        subjectId: challengeId,
        payload: {
          challengeId,
          clubId: typeof payload.clubId === "string" ? payload.clubId : null,
        },
        dedupeKey: `challenge-ending-soon:${challengeId}`,
      },
    ];
  }
}

export interface ChallengeMilestonePayload extends ChallengeLifecyclePayload {
  userId?: unknown;
  milestone?: unknown;
}

/**
 * Renders `challenge.milestone` for the participant who reached it.
 * Milestones aggregate per challenge so 50% and 100% readings share one
 * row instead of stacking notifications.
 */
export class ChallengeMilestoneSource implements NotificationSource {
  readonly eventType = "challenge.milestone";

  constructor(private readonly db: Database) {}

  async resolve(event: DomainEvent): Promise<NotificationDraft[]> {
    const payload = event.payload as ChallengeMilestonePayload;
    const challengeId = challengeIdOf(payload);
    const userId =
      typeof payload.userId === "string" ? payload.userId : null;
    const milestone =
      typeof payload.milestone === "number" ? payload.milestone : null;
    if (!challengeId || !userId || milestone === null) return [];
    let title = challengeTitle(payload);
    const challenge = await this.db.query.challenges.findFirst({
      where: eq(schema.challenges.id, challengeId),
    });
    if (challenge?.title) title = `"${challenge.title}"`;
    return [
      {
        recipient: { kind: "users", userIds: [userId] },
        type: NOTIFICATION_TYPES.CHALLENGE_MILESTONE,
        title: `You're ${milestone}% through ${title}`,
        href: `/challenges/${challengeId}`,
        actorUserId: event.actorUserId,
        subjectType: "challenge",
        subjectId: challengeId,
        payload: { challengeId, userId, milestone },
        aggregateKey: `challenge-milestone:${challengeId}`,
      },
    ];
  }
}

export interface ChallengeCompletedPayload extends ChallengeLifecyclePayload {
  userId?: unknown;
}

/**
 * Renders `challenge.completed` for the participant who finished.
 * Completions are personal accomplishments, not broadcasts: only the
 * finisher is notified (their achievement notification arrives
 * separately through the existing achievement source).
 */
export class ChallengeCompletedSource implements NotificationSource {
  readonly eventType = "challenge.completed";

  resolve(event: DomainEvent): NotificationDraft[] {
    const payload = event.payload as ChallengeCompletedPayload;
    const challengeId = challengeIdOf(payload);
    const userId =
      typeof payload.userId === "string" ? payload.userId : null;
    if (!challengeId || !userId) return [];
    return [
      {
        recipient: { kind: "users", userIds: [userId] },
        type: NOTIFICATION_TYPES.CHALLENGE_COMPLETED,
        title: `You completed ${challengeTitle(payload)}`,
        href: `/challenges/${challengeId}`,
        actorUserId: event.actorUserId,
        subjectType: "challenge",
        subjectId: challengeId,
        payload: { challengeId, userId },
        dedupeKey: `challenge-completed:${challengeId}`,
      },
    ];
  }
}
