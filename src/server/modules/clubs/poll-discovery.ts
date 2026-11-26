import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  rankPollDiscoveryCandidates,
  scoreClubQueuedCandidate,
  scoreLibraryCandidate,
  scoreTbrCandidate,
  workSubjectKey,
  type ClubPollDiscoveryCandidate,
} from "../../../shared/club-poll-discovery.js";
import {
  CLUB_WORK_SUBJECT_TYPES_BY_CONTEXT,
  type ClubContext,
} from "../../../shared/clubs.js";
import type { WorkSubjectType } from "../../../shared/subject.js";

export class ClubPollDiscoveryService {
  constructor(private readonly db: Database) {}

  async discoverForClub(
    clubId: string,
    context: ClubContext,
  ): Promise<ClubPollDiscoveryCandidate[]> {
    const allowedTypes = CLUB_WORK_SUBJECT_TYPES_BY_CONTEXT[context];
    if (allowedTypes.length === 0) return [];

    const memberRows = await this.db
      .select({ userId: schema.clubMembers.userId })
      .from(schema.clubMembers)
      .where(eq(schema.clubMembers.clubId, clubId));
    const memberIds = memberRows.map((row) => row.userId);
    if (memberIds.length === 0) return [];

    const excludedKeys = await this.loadExcludedWorkKeys(clubId);
    const candidates: ClubPollDiscoveryCandidate[] = [];

    const tbrRows = await this.db
      .select({
        subjectType: schema.shelfItems.subjectType,
        subjectId: schema.shelfItems.subjectId,
        memberCount: sql<number>`count(distinct ${schema.shelves.ownerUserId})::int`,
      })
      .from(schema.shelfItems)
      .innerJoin(schema.shelves, eq(schema.shelfItems.shelfId, schema.shelves.id))
      .where(
        and(
          inArray(schema.shelves.ownerUserId, memberIds),
          inArray(schema.shelfItems.subjectType, [...allowedTypes]),
        ),
      )
      .groupBy(schema.shelfItems.subjectType, schema.shelfItems.subjectId);

    for (const row of tbrRows) {
      const workSubjectType = row.subjectType as WorkSubjectType;
      if (!allowedTypes.includes(workSubjectType)) continue;
      const key = workSubjectKey(workSubjectType, row.subjectId);
      if (excludedKeys.has(key)) continue;
      candidates.push({
        workSubjectType,
        workSubjectId: row.subjectId,
        source: "tbr",
        tbrMemberCount: row.memberCount,
        score: scoreTbrCandidate(row.memberCount),
      });
    }

    const clubWorkRows = await this.db
      .select({
        workSubjectType: schema.clubWorks.workSubjectType,
        workSubjectId: schema.clubWorks.workSubjectId,
      })
      .from(schema.clubWorks)
      .where(
        and(
          eq(schema.clubWorks.clubId, clubId),
          inArray(schema.clubWorks.status, ["queued", "associated"]),
        ),
      );

    for (const row of clubWorkRows) {
      const workSubjectType = row.workSubjectType as WorkSubjectType;
      const key = workSubjectKey(workSubjectType, row.workSubjectId);
      if (excludedKeys.has(key)) continue;
      candidates.push({
        workSubjectType,
        workSubjectId: row.workSubjectId,
        source: "club_queued",
        score: scoreClubQueuedCandidate(),
      });
    }

    const libraryRows = await this.db
      .select({
        targetType: schema.libraryMemberships.targetType,
        targetId: schema.libraryMemberships.targetId,
        memberCount: sql<number>`count(distinct ${schema.libraryMemberships.userId})::int`,
      })
      .from(schema.libraryMemberships)
      .where(
        and(
          inArray(schema.libraryMemberships.userId, memberIds),
          inArray(schema.libraryMemberships.targetType, [...allowedTypes]),
        ),
      )
      .groupBy(
        schema.libraryMemberships.targetType,
        schema.libraryMemberships.targetId,
      );

    for (const row of libraryRows) {
      const workSubjectType = row.targetType as WorkSubjectType;
      if (!allowedTypes.includes(workSubjectType)) continue;
      const key = workSubjectKey(workSubjectType, row.targetId);
      if (excludedKeys.has(key)) continue;
      candidates.push({
        workSubjectType,
        workSubjectId: row.targetId,
        source: "library",
        score: scoreLibraryCandidate(row.memberCount),
      });
    }

    return rankPollDiscoveryCandidates(candidates).slice(0, 25);
  }

  private async loadExcludedWorkKeys(clubId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({
        workSubjectType: schema.clubWorks.workSubjectType,
        workSubjectId: schema.clubWorks.workSubjectId,
      })
      .from(schema.clubWorks)
      .where(
        and(
          eq(schema.clubWorks.clubId, clubId),
          inArray(schema.clubWorks.status, ["current", "completed"]),
        ),
      );

    return new Set(
      rows.map((row) =>
        workSubjectKey(row.workSubjectType, row.workSubjectId),
      ),
    );
  }
}
