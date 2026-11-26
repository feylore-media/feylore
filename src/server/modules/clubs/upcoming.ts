import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Database } from "../../db/client.js";
import * as s from "../../db/schema.js";
import type { AuthUser } from "../authorization/service.js";
import { PERMISSIONS } from "../../../shared/permissions.js";
import type { ClubEvent } from "../../../shared/club-experience.js";
import type { ClubService } from "./service.js";

/** Derived events have no independent lifecycle; their IDs name their source. */
export class ClubUpcomingService {
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
  ) {}

  async forClub(user: AuthUser, clubId: string, now = new Date(), limit = 8) {
    const club = await this.clubs.requireView(user, clubId);
    const end = new Date(now.getTime() + 90 * 86400000);
    return this.project([{ id: club.id, name: club.name }], now, end, limit);
  }

  async global(user: AuthUser, now = new Date(), limit = 30) {
    if (!user.permissions.has(PERMISSIONS.CLUBS_READ)) return [];
    const clubs = await this.clubsForUser(user);
    const end = new Date(now.getTime() + 90 * 86400000);
    return this.project(clubs, now, end, limit);
  }

  /** All club events whose date falls anywhere within [from, to]. */
  async globalRange(
    user: AuthUser,
    from: Date,
    to: Date,
    limit = 500,
  ): Promise<ClubEvent[]> {
    if (!user.permissions.has(PERMISSIONS.CLUBS_READ)) return [];
    const clubs = await this.clubsForUser(user);
    return this.project(clubs, from, to, limit);
  }

  private async clubsForUser(user: AuthUser): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: s.clubs.id, name: s.clubs.name })
      .from(s.clubs)
      .leftJoin(
        s.clubMembers,
        and(
          eq(s.clubMembers.clubId, s.clubs.id),
          eq(s.clubMembers.userId, user.id),
        ),
      )
      .where(
        or(
          eq(s.clubs.visibility, "public"),
          sql`${s.clubMembers.userId} IS NOT NULL`,
        ),
      );
  }

  private async project(
    clubs: { id: string; name: string }[],
    from: Date,
    to: Date,
    limit: number,
  ): Promise<ClubEvent[]> {
    if (!clubs.length) return [];
    const ids = clubs.map((club) => club.id);
    const names = new Map(clubs.map((club) => [club.id, club.name]));
    const readWindow = (dateColumn: AnyPgColumn) =>
      this.db
        .select()
        .from(s.clubReads)
        .where(
          and(
            inArray(s.clubReads.clubId, ids),
            inArray(s.clubReads.status, ["active", "scheduled"]),
            sql`${dateColumn} >= ${from} AND ${dateColumn} <= ${to}`,
          ),
        )
        .orderBy(asc(dateColumn), asc(s.clubReads.id))
        .limit(limit);
    const roundWindow = (
      dateColumn: AnyPgColumn,
      phases: (typeof s.clubSelectionRounds.$inferSelect)["phase"][],
    ) =>
      this.db
        .select()
        .from(s.clubSelectionRounds)
        .where(
          and(
            inArray(s.clubSelectionRounds.clubId, ids),
            inArray(s.clubSelectionRounds.phase, phases),
            sql`${dateColumn} >= ${from} AND ${dateColumn} <= ${to}`,
          ),
        )
        .orderBy(asc(dateColumn), asc(s.clubSelectionRounds.id))
        .limit(limit);
    const [
      readStarts,
      readEnds,
      occurrences,
      nominationOpens,
      nominationCloses,
      votingOpens,
      votingCloses,
    ] = await Promise.all([
      readWindow(s.clubReads.startDate),
      readWindow(s.clubReads.targetEndDate),
      this.db
        .select({
          occurrence: s.clubScheduleOccurrences,
          readStatus: s.clubReads.status,
          eventKind: s.clubSchedules.eventKind,
        })
        .from(s.clubScheduleOccurrences)
        .innerJoin(
          s.clubSchedules,
          eq(s.clubScheduleOccurrences.scheduleId, s.clubSchedules.id),
        )
        .leftJoin(
          s.clubReads,
          eq(s.clubScheduleOccurrences.clubReadId, s.clubReads.id),
        )
        .where(
          and(
            inArray(s.clubScheduleOccurrences.clubId, ids),
            inArray(s.clubScheduleOccurrences.status, ["upcoming", "open"]),
            eq(s.clubSchedules.status, "active"),
            or(
              isNull(s.clubReads.id),
              inArray(s.clubReads.status, ["active", "scheduled"]),
            ),
            gt(s.clubScheduleOccurrences.scheduledAt, from),
            lte(s.clubScheduleOccurrences.scheduledAt, to),
          ),
        )
        .orderBy(
          asc(s.clubScheduleOccurrences.scheduledAt),
          asc(s.clubScheduleOccurrences.id),
        )
        .limit(limit),
      roundWindow(s.clubSelectionRounds.nominationStartsAt, ["draft"]),
      roundWindow(s.clubSelectionRounds.nominationEndsAt, [
        "draft",
        "nominations_open",
      ]),
      roundWindow(s.clubSelectionRounds.votingStartsAt, [
        "draft",
        "nominations_closed",
      ]),
      roundWindow(s.clubSelectionRounds.votingEndsAt, [
        "draft",
        "nominations_open",
        "nominations_closed",
        "voting_open",
      ]),
    ]);
    const reads = [
      ...new Map(
        [...readStarts, ...readEnds].map((row) => [row.id, row]),
      ).values(),
    ];
    const rounds = [
      ...new Map(
        [
          ...nominationOpens,
          ...nominationCloses,
          ...votingOpens,
          ...votingCloses,
        ].map((row) => [row.id, row]),
      ).values(),
    ];
    const events: ClubEvent[] = [];
    const add = (
      clubId: string,
      id: string,
      kind: ClubEvent["kind"],
      date: Date | null,
      label: string,
      href: string,
      clubReadId: string | null,
    ) => {
      if (!date || date < from || date > to) return;
      events.push({
        id,
        clubId,
        clubReadId,
        kind,
        startsAt: date.toISOString(),
        label: `${names.get(clubId)} · ${label}`,
        href,
      });
    };
    for (const read of reads) {
      const href = `/clubs/${read.clubId}/reads/${read.id}`;
      const title = read.candidateSnapshot?.title;
      add(
        read.clubId,
        `club_read_start:${read.id}`,
        "club_read_start",
        read.startDate,
        title ? `${title} starts` : "Club Read starts",
        href,
        read.id,
      );
      add(
        read.clubId,
        `club_read_end:${read.id}`,
        "club_read_end",
        read.targetEndDate,
        title ? `${title} target end` : "Club Read target end",
        href,
        read.id,
      );
    }
    for (const { occurrence, readStatus, eventKind } of occurrences) {
      if (readStatus === "cancelled" || readStatus === "completed") continue;
      const final = eventKind === "final_discussion";
      add(
        occurrence.clubId,
        `${final ? "club_final_discussion" : "club_checkin"}:${occurrence.id}`,
        final ? "final_discussion" : "checkin",
        occurrence.scheduledAt,
        final ? "Final discussion" : "Check-in",
        occurrence.topicId
          ? `/clubs/${occurrence.clubId}/topics/${occurrence.topicId}`
          : `/clubs/${occurrence.clubId}/current-read`,
        occurrence.clubReadId,
      );
    }
    for (const round of rounds) {
      const href = `/clubs/${round.clubId}/selection-rounds/${round.id}`;
      if (round.phase === "draft")
        add(
          round.clubId,
          `club_nomination_open:${round.id}`,
          "nomination_open",
          round.nominationStartsAt,
          "Nominations open",
          href,
          null,
        );
      if (round.phase === "draft" || round.phase === "nominations_open")
        add(
          round.clubId,
          `club_nomination_close:${round.id}`,
          "nomination_close",
          round.nominationEndsAt,
          "Nominations close",
          href,
          null,
        );
      if (round.phase !== "voting_open")
        add(
          round.clubId,
          `club_voting_open:${round.id}`,
          "voting_open",
          round.votingStartsAt,
          "Voting opens",
          href,
          null,
        );
      add(
        round.clubId,
        `club_voting_close:${round.id}`,
        "voting_close",
        round.votingEndsAt,
        "Voting closes",
        href,
        null,
      );
    }
    return events
      .sort(
        (a, b) =>
          a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
      )
      .slice(0, limit);
  }
}
