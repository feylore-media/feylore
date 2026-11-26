import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import * as schema from "../../../db/schema.js";
import { NOTIFICATION_TYPES } from "../../../../shared/notifications.js";
import type { DomainEvent } from "../events.js";
import type { NotificationDraft, NotificationSource } from "../sources.js";

export interface ClubMentionPayload {
  clubId?: unknown;
  topicId?: unknown;
  postId?: unknown;
  mentionedUserIds?: unknown;
  actorUsername?: unknown;
  actorDisplayName?: unknown;
  excerpt?: unknown;
}

/**
 * Renders the `club.mention.created` domain event into notifications for the
 * mentioned users. Recipients are filtered to users who are still current club
 * members (privacy: leaving a club stops mention notifications) and the actor
 * is always excluded. A single mention creates one notification per recipient;
 * republishing the same event is a no-op via the dedupe key.
 */
export class ClubMentionSource implements NotificationSource {
  readonly eventType = "club.mention.created";

  constructor(private readonly db: Database) {}

  async resolve(event: DomainEvent): Promise<NotificationDraft[]> {
    const payload = event.payload as ClubMentionPayload;
    if (
      typeof payload.clubId !== "string" ||
      typeof payload.topicId !== "string" ||
      !Array.isArray(payload.mentionedUserIds) ||
      !payload.mentionedUserIds.every((id) => typeof id === "string")
    ) {
      return [];
    }
    if (payload.mentionedUserIds.length === 0) return [];

    const mentionIds = payload.mentionedUserIds as string[];
    const [club, topic] = await Promise.all([
      this.db.query.clubs.findFirst({
        where: eq(schema.clubs.id, payload.clubId),
      }),
      this.db.query.clubTopics.findFirst({
        where: eq(schema.clubTopics.id, payload.topicId),
      }),
    ]);
    if (!club || !topic) return [];

    const members = await this.db
      .select({ userId: schema.clubMembers.userId })
      .from(schema.clubMembers)
      .where(
        and(
          eq(schema.clubMembers.clubId, payload.clubId),
          inArray(schema.clubMembers.userId, mentionIds),
        ),
      );
    const memberIds = new Set(members.map((m) => m.userId));
    const recipientIds = mentionIds.filter((id) => memberIds.has(id));
    if (recipientIds.length === 0) return [];

    const actorName =
      typeof payload.actorDisplayName === "string" && payload.actorDisplayName
        ? payload.actorDisplayName
        : typeof payload.actorUsername === "string"
          ? payload.actorUsername
          : "Someone";
    const topicLabel = topic.title ? `"${topic.title}"` : "a club discussion";
    const excerpt =
      typeof payload.excerpt === "string" && payload.excerpt.trim()
        ? payload.excerpt.slice(0, 160).trim()
        : undefined;

    return [
      {
        recipient: { kind: "users", userIds: recipientIds },
        type: NOTIFICATION_TYPES.CLUB_MENTION,
        title: `${actorName} mentioned you in ${topicLabel}`,
        body: excerpt,
        href: `/clubs/${payload.clubId}/topics/${payload.topicId}`,
        actorUserId: event.actorUserId,
        subjectType: "club_topic",
        subjectId: payload.topicId,
        payload: {
          clubId: payload.clubId,
          topicId: payload.topicId,
          postId:
            typeof payload.postId === "string" ? payload.postId : null,
          actorUsername:
            typeof payload.actorUsername === "string"
              ? payload.actorUsername
              : null,
        },
        dedupeKey: `club-mention:${
          typeof payload.postId === "string" && payload.postId
            ? payload.postId
            : `topic:${payload.topicId}`
        }`,
        excludeUserIds: event.actorUserId ? [event.actorUserId] : [],
      },
    ];
  }
}