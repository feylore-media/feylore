import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { statsMediaTypeFromWorkType } from "../../../shared/stats.js";
import { resolveWorkFromRepresentation } from "../reading-progress/resolve-work.js";
import { StatsFactRecorder } from "./facts.js";

export interface StatsBackfillCounts {
  users: number;
  ratings: number;
  completions: number;
  sessions: number;
  plays: number;
}

const READING_COMPLETION_EVENTS = new Set([
  "book.reading_finished",
  "listening.finished",
]);

/**
 * Replays historical state into `user_stat_facts` idempotently.
 * Re-runs are safe: same `(source, source_key)` pairs dedupe.
 * See docs/STATS.md §8.
 */
export async function runStatsBackfill(
  db: Database,
  recorder: StatsFactRecorder,
  userId: string | null,
): Promise<StatsBackfillCounts> {
  const counts: StatsBackfillCounts = {
    users: 0,
    ratings: 0,
    completions: 0,
    sessions: 0,
    plays: 0,
  };

  const userCondition = userId ? [eq(schema.users.id, userId)] : [];

  const users = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(...userCondition));

  for (const user of users) {
    counts.users += 1;

    const ratings = await db
      .select({
        subjectType: schema.userRatings.subjectType,
        subjectId: schema.userRatings.subjectId,
        rating: schema.userRatings.rating,
        createdAt: schema.userRatings.createdAt,
      })
      .from(schema.userRatings)
      .where(eq(schema.userRatings.userId, user.id));

    for (const rating of ratings) {
      const wrote = await recorder.recordRated({
        userId: user.id,
        subjectType: rating.subjectType,
        subjectId: rating.subjectId,
        occurredAt: rating.createdAt,
        value: rating.rating,
        unit: "stars",
        ratingScale: 5,
        source: "user_ratings",
        sourceKey: `${rating.subjectType}:${rating.subjectId}`,
      });
      if (wrote) counts.ratings += 1;
    }

    const completions = await db
      .select({
        workType: schema.readingProgress.workType,
        workId: schema.readingProgress.workId,
        completedAt: schema.readingProgress.completedAt,
      })
      .from(schema.readingProgress)
      .where(
        and(
          eq(schema.readingProgress.userId, user.id),
          isNotNull(schema.readingProgress.completedAt),
        ),
      );

    for (const completion of completions) {
      if (!completion.completedAt) continue;
      const mediaType = statsMediaTypeFromWorkType(completion.workType);
      if (!mediaType) continue;
      const wrote = await recorder.record({
        userId: user.id,
        kind: "completed",
        mediaType,
        subjectType: completion.workType,
        subjectId: completion.workId,
        occurredAt: completion.completedAt,
        value: 1,
        unit: "count",
        source: "reading",
        sourceKey: `${completion.workType}:${completion.workId}`,
      });
      if (wrote) counts.completions += 1;
    }

    const events = await db
      .select({
        id: schema.activityEvents.id,
        type: schema.activityEvents.type,
        subjectType: schema.activityEvents.subjectType,
        subjectId: schema.activityEvents.subjectId,
        createdAt: schema.activityEvents.createdAt,
      })
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.actorUserId, user.id))
      .orderBy(schema.activityEvents.createdAt);

    for (const event of events) {
      if (!event.subjectType || !event.subjectId) continue;
      if (event.type === "listening.started") {
        const wrote = await recorder.record({
          userId: user.id,
          kind: "play",
          subjectType: event.subjectType,
          subjectId: event.subjectId,
          occurredAt: event.createdAt,
          value: 1,
          unit: "plays",
          source: "activity",
          sourceKey: `event:${event.id}`,
        });
        if (wrote) counts.plays += 1;
      } else if (READING_COMPLETION_EVENTS.has(event.type)) {
        const exists = await db
          .select({ id: schema.userStatFacts.id })
          .from(schema.userStatFacts)
          .where(
            and(
              eq(schema.userStatFacts.userId, user.id),
              eq(schema.userStatFacts.kind, "completed"),
              eq(schema.userStatFacts.subjectType, event.subjectType),
              eq(schema.userStatFacts.subjectId, event.subjectId),
            ),
          )
          .limit(1);
        if (exists.length > 0) continue;
        const wrote = await recorder.record({
          userId: user.id,
          kind: "completed",
          subjectType: event.subjectType,
          subjectId: event.subjectId,
          occurredAt: event.createdAt,
          value: 1,
          unit: "count",
          source: "activity",
          sourceKey: `event:${event.id}`,
        });
        if (wrote) counts.completions += 1;
      }
    }

    const sessions = await db
      .select({
        id: schema.readingActivity.id,
        representationId: schema.readingActivity.representationId,
        startedAt: schema.readingActivity.startedAt,
        duration: schema.readingActivity.duration,
      })
      .from(schema.readingActivity)
      .where(eq(schema.readingActivity.userId, user.id));

    for (const s of sessions) {
      let subjectType = "unknown";
      let subjectId = s.representationId;
      try {
        const work = await resolveWorkFromRepresentation(db, s.representationId);
        subjectType = work.workType;
        subjectId = work.workId;
      } catch {
        // representation deleted; keep an opaque subject
      }
      const wrote = await recorder.record({
        userId: user.id,
        kind: "session",
        subjectType,
        subjectId,
        occurredAt: s.startedAt,
        value: s.duration,
        unit: "seconds",
        source: "reading_activity",
        sourceKey: `${s.id}`,
      });
      if (wrote) counts.sessions += 1;
    }
  }

  return counts;
}