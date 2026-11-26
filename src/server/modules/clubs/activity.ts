import { eq, inArray, sql, and, ne } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";

/**
 * V1 club activity: discussion topics/replies and non-owner member joins.
 * Extend this helper when adding reactions, reading progress, schedule events, etc.
 */
export async function getClubDiscussionActivityAt(
  db: Database,
  clubIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (clubIds.length === 0) return result;

  for (const clubId of clubIds) {
    result.set(clubId, null);
  }

  const toIso = (value: Date | string | null | undefined): string | null => {
    if (value == null) return null;
    if (typeof value === "string") return value;
    return value.toISOString();
  };

  const topicRows = await db
    .select({
      clubId: schema.clubTopics.clubId,
      lastActivityAt: sql<Date | string | null>`max(${schema.clubTopics.lastActivityAt})`,
    })
    .from(schema.clubTopics)
    .where(inArray(schema.clubTopics.clubId, clubIds))
    .groupBy(schema.clubTopics.clubId);

  const memberRows = await db
    .select({
      clubId: schema.clubMembers.clubId,
      lastJoinAt: sql<Date | string | null>`max(${schema.clubMembers.joinedAt})`,
    })
    .from(schema.clubMembers)
    .innerJoin(schema.clubs, eq(schema.clubMembers.clubId, schema.clubs.id))
    .where(
      and(
        inArray(schema.clubMembers.clubId, clubIds),
        ne(schema.clubMembers.userId, schema.clubs.ownerUserId),
      ),
    )
    .groupBy(schema.clubMembers.clubId);

  for (const row of topicRows) {
    const iso = toIso(row.lastActivityAt);
    if (!iso) continue;
    const existing = result.get(row.clubId);
    if (!existing || iso > existing) {
      result.set(row.clubId, iso);
    }
  }

  for (const row of memberRows) {
    const iso = toIso(row.lastJoinAt);
    if (!iso) continue;
    const existing = result.get(row.clubId);
    if (!existing || iso > existing) {
      result.set(row.clubId, iso);
    }
  }

  return result;
}
