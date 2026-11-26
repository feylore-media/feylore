import { ClubContentProjection } from "./content-projection.js";
import { and, asc, desc, eq, sql, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as s from "../../db/schema.js";
import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { BooksService } from "../books/service.js";
import type { ReadingProgressService } from "../reading-progress/service.js";
import type { UserStateService } from "../user-state/service.js";
import type { RatingConfigService } from "../ratings/config-service.js";
import type { ClubSelectionService } from "./selection.js";
import { serializeClubRead } from "./reads.js";
import { canSeeClubLocation, safeLocationLabel } from "./safe-projection.js";
import type {
  ClubExperienceOverview,
  ReadExperience,
  ReadSummary,
  SafeClubItem,
  SelectionSummary,
} from "../../../shared/club-experience.js";
import type { ClubUpcomingService } from "./upcoming.js";
import type { CandidateSnapshot } from "../../../shared/club-reads.js";
import type { ConsumptionTarget } from "../../../shared/clubs.js";
import { isReadingProgressLocator } from "../../../shared/progress-locator.js";
import { extractChapterNumber } from "../../../shared/club-spoiler.js";
import { normalizeProfileCosmetics } from "../../../shared/profile-cosmetics.js";
import { generateId } from "../../security/crypto.js";
import { participantIds } from "./participation.js";
import { aggregateParticipantRatings } from "./rating-aggregate.js";
import {
  ForbiddenError,
  ValidationError,
  NotFoundError,
} from "../../../shared/errors.js";

type ReadRow = typeof s.clubReads.$inferSelect;
export class ClubExperienceService {
  private projection: ClubContentProjection;
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly books: BooksService,
    private readonly progress: ReadingProgressService,
    private readonly userState: UserStateService,
    private readonly ratings: RatingConfigService,
    _selection: ClubSelectionService,
    private readonly upcoming: ClubUpcomingService,
  ) {
    this.projection = new ClubContentProjection(db, userState, progress);
  }

  private async identity(
    read: ReadRow,
    user: AuthUser,
  ): Promise<{
    snapshot: CandidateSnapshot;
    workHref: string | null;
    readerHref: string | null;
  }> {
    let snapshot = read.candidateSnapshot ?? {
      title: "Unavailable work",
      authors: [],
      genres: [],
      contentWarnings: [],
      providerIdentifiers: {},
      provenance: [],
    };
    if (read.workSubjectType !== "book" || !read.workSubjectId)
      return { snapshot, workHref: null, readerHref: null };
    const book = await this.db.query.books.findFirst({
      where: eq(s.books.id, read.workSubjectId),
    });
    if (!book) return { snapshot, workHref: null, readerHref: null };
    const [authors, genres, series, readable] = await Promise.all([
      this.books.getAuthorNames(book.id),
      this.books.getGenreNames(book.id),
      this.books.getSeriesForBook(book.id),
      this.books.canReadBook(user.id, book.id),
    ]);
    snapshot = {
      ...snapshot,
      title: book.title,
      subtitle: book.subtitle ?? undefined,
      description: book.description ?? undefined,
      authors,
      genres,
      coverFileId: book.coverFileId,
      series: series?.name,
      seriesPosition: series?.position ?? undefined,
    };
    return {
      snapshot,
      workHref: `/books/${book.slug}`,
      readerHref:
        readable && user.permissions.has("books.read")
          ? `/read/book/${book.slug}`
          : null,
    };
  }
  private engagedUsers(read: ReadRow) {
    return participantIds(read.id);
  }
  private async participants(read: ReadRow) {
    const result = await this.db.execute<{
      userId: string;
      displayName: string;
      cosmetics: unknown;
    }>(
      sql`SELECT u.id AS "userId",u.display_name AS "displayName",p.cosmetics AS cosmetics FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id IN (${this.engagedUsers(read)}) ORDER BY u.display_name,u.id LIMIT 100`,
    );
    return result.rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      cosmetics: normalizeProfileCosmetics(row.cosmetics),
    }));
  }
  async summary(user: AuthUser, read: ReadRow): Promise<ReadSummary> {
    const [identity, participants, counts, aggregate] = await Promise.all([
      this.identity(read, user),
      this.db.execute<{ count: number }>(
        sql`SELECT count(*)::int count FROM users WHERE id IN (${this.engagedUsers(read)})`,
      ),
      this.db.execute<{ discussions: number; journal: number }>(
        sql`SELECT (SELECT count(*)::int FROM club_topics WHERE club_read_id=${read.id}) discussions,(SELECT count(*)::int FROM club_quotes WHERE club_read_id=${read.id}) journal`,
      ),
      this.aggregate(read),
    ]);
    return {
      read: serializeClubRead(read),
      ...identity,
      participantCount: participants.rows[0]!.count,
      discussionCount: counts.rows[0]!.discussions,
      journalCount: counts.rows[0]!.journal,
      averageRating: aggregate.averageRating,
      ratingCount: aggregate.ratingCount,
      recommendations: aggregate.recommendations,
    };
  }
  private async aggregate(read: ReadRow) {
    const empty = {
      averageRating: null as number | null,
      ratingCount: 0,
      recommendations: null as number | null,
      coreValues: {} as Record<string, number>,
      genreValues: {} as Record<string, Record<string, number>>,
      trajectory: [] as { progress: number; rating: number }[],
    };
    if (
      read.status !== "completed" ||
      !read.workSubjectId ||
      read.workSubjectType !== "book"
    )
      return empty;
    const rows = await this.db
      .select({
        userId: s.bookReviews.userId,
        finalRating: s.bookReviews.finalRating,
        recommendation: s.bookReviews.recommendation,
        coreValues: s.bookReviews.coreValues,
        genreValues: s.bookReviews.genreValues,
        trajectory: s.bookReviews.trajectory,
      })
      .from(s.bookReviews)
      .where(
        and(
          eq(s.bookReviews.bookId, read.workSubjectId),
          eq(s.bookReviews.status, "completed"),
          sql`${s.bookReviews.userId} IN (${this.engagedUsers(read)})`,
        ),
      );
    const stars = await this.db
      .select()
      .from(s.userRatings)
      .where(
        and(
          eq(s.userRatings.subjectType, "book"),
          eq(s.userRatings.subjectId, read.workSubjectId),
          sql`${s.userRatings.userId} IN (${this.engagedUsers(read)})`,
        ),
      );
    const aggregate = aggregateParticipantRatings(rows, stars);
    return {
      averageRating: aggregate.averageRating,
      ratingCount: aggregate.ratingCount,
      recommendations: aggregate.recommendations,
      coreValues: aggregate.coreValues,
      genreValues: aggregate.genreValues,
      trajectory: aggregate.trajectory,
    };
  }
  async detail(
    user: AuthUser,
    clubId: string,
    readId: string,
  ): Promise<ReadExperience> {
    await this.clubs.requireView(user, clubId);
    const read = await this.db.query.clubReads.findFirst({
      where: and(eq(s.clubReads.id, readId), eq(s.clubReads.clubId, clubId)),
    });
    if (!read) throw new NotFoundError("Club Read not found");
    const [
      summary,
      progress,
      members,
      occurrences,
      topics,
      quotes,
      participants,
      aggregate,
      dimensions,
      settings,
      review,
    ] = await Promise.all([
      this.summary(user, read),
      read.workSubjectId
        ? this.progress.getPrimaryProgressForWork(
            user.id,
            read.workSubjectType,
            read.workSubjectId,
          )
        : null,
      this.db
        .select({
          userId: s.clubMembers.userId,
          displayName: s.users.displayName,
          cosmetics: s.userProfiles.cosmetics,
        })
        .from(s.clubMembers)
        .innerJoin(s.users, eq(s.clubMembers.userId, s.users.id))
        .leftJoin(s.userProfiles, eq(s.userProfiles.userId, s.users.id))
        .where(eq(s.clubMembers.clubId, clubId))
        .orderBy(asc(s.clubMembers.joinedAt))
        .limit(8),
      this.db
        .select()
        .from(s.clubScheduleOccurrences)
        .where(eq(s.clubScheduleOccurrences.clubReadId, readId))
        .orderBy(asc(s.clubScheduleOccurrences.scheduledAt))
        .limit(100),
      this.db
        .select({ topic: s.clubTopics, author: s.users.displayName })
        .from(s.clubTopics)
        .innerJoin(s.users, eq(s.users.id, s.clubTopics.authorUserId))
        .where(eq(s.clubTopics.clubReadId, readId))
        .orderBy(desc(s.clubTopics.lastActivityAt))
        .limit(20),
      this.db
        .select({ quote: s.clubQuotes, author: s.users.displayName })
        .from(s.clubQuotes)
        .innerJoin(s.users, eq(s.users.id, s.clubQuotes.authorUserId))
        .where(eq(s.clubQuotes.clubReadId, readId))
        .orderBy(desc(s.clubQuotes.createdAt))
        .limit(20),
      this.participants(read),
      this.aggregate(read),
      this.ratings.listCoreDimensions(),
      this.ratings.getSettings(),
      read.workSubjectId
        ? this.db.query.bookReviews.findFirst({
            where: and(
              eq(s.bookReviews.userId, user.id),
              eq(s.bookReviews.bookId, read.workSubjectId),
            ),
          })
        : null,
    ]);
    const fallback =
      !progress && read.workSubjectId
        ? await this.userState.getProgress(
            user.id,
            read.workSubjectType,
            read.workSubjectId,
          )
        : null;
    const viewerProgress = progress
      ? { kind: "reading" as const, ...progress.progress.locator }
      : (fallback?.locator ?? null);
    const now = Date.now();
    const target =
      read.status === "active"
        ? (occurrences
            .filter(
              (o) =>
                o.opensAt.getTime() <= now &&
                o.status !== "skipped" &&
                o.status !== "completed",
            )
            .at(-1) ??
          occurrences.find(
            (o) => o.status === "upcoming" && o.opensAt.getTime() > now,
          ))
        : undefined;
    const checks = target
      ? await this.db
          .select()
          .from(s.clubOccurrenceCheckIns)
          .where(eq(s.clubOccurrenceCheckIns.occurrenceId, target.id))
      : [];
    const checked = new Set(checks.map((check) => check.userId));
    const totals = await this.db.execute<{ members: number; checked: number }>(
      sql`SELECT count(*)::int members,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM club_occurrence_check_ins c WHERE c.user_id=m.user_id AND c.occurrence_id=${target?.id ?? null}::uuid))::int checked FROM club_members m WHERE m.club_id=${clubId}`,
    );
    const consumption = target?.consumption as ConsumptionTarget | undefined;
    const label =
      viewerProgress && isReadingProgressLocator(viewerProgress)
        ? extractChapterNumber(viewerProgress.title ?? "")
        : null;
    const [topicSafety, quoteSafety, seen] = await Promise.all([
      this.projection.topics(
        user.id,
        topics.map((row) => row.topic),
      ),
      this.projection.quotes(
        user.id,
        quotes.map((row) => row.quote),
      ),
      this.db
        .select()
        .from(s.clubTopicReadState)
        .where(
          and(
            eq(s.clubTopicReadState.userId, user.id),
            topics.length
              ? inArray(
                  s.clubTopicReadState.topicId,
                  topics.map((row) => row.topic.id),
                )
              : sql`false`,
          ),
        ),
    ]);
    const discussions: SafeClubItem[] = topics.map(({ topic, author }) => {
      const visible = topicSafety.get(topic.id)!.visible;
      return {
        id: topic.id,
        kind: "discussion",
        label: topicSafety.get(topic.id)!.label,
        text: visible ? topic.title : null,
        locked: !visible,
        author,
        createdAt: topic.lastActivityAt.toISOString(),
        href: `/clubs/${clubId}/topics/${topic.id}`,
        unread:
          topic.lastActivityAt.getTime() >
          (seen.find((row) => row.topicId === topic.id)?.readAt.getTime() ?? 0),
      };
    });
    const journal: SafeClubItem[] = quotes.map(({ quote, author }) => {
      const locator = quote.locatorJson as {
        totalProgression?: number;
        title?: string;
      } | null;
      const boundary =
        quote.spoilerBoundary ??
        (locator?.totalProgression !== undefined
          ? { kind: "chapter" as const, progression: locator.totalProgression }
          : { kind: "final" as const });
      const visible = quoteSafety.get(quote.id)!.visible;
      return {
        id: quote.id,
        kind: "passage",
        label: safeLocationLabel(quote.mediaLocation ?? boundary),
        text: visible ? quote.text : null,
        locked: !visible,
        author,
        createdAt: quote.createdAt.toISOString(),
        href: null,
        unread: false,
      };
    });
    return {
      ...summary,
      viewerProgress,
      progressPercent:
        viewerProgress &&
        isReadingProgressLocator(viewerProgress) &&
        viewerProgress.totalProgression !== undefined
          ? Math.round(viewerProgress.totalProgression * 100)
          : null,
      progressLabel: label ? `Chapter ${label}` : null,
      caughtUp: consumption
        ? canSeeClubLocation(viewerProgress, null, consumption)
        : null,
      viewerCheckedIn: checked.has(user.id),
      caughtUpCount: totals.rows[0]!.checked,
      memberCount: totals.rows[0]!.members,
      members: members.slice(0, 8).map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        cosmetics: normalizeProfileCosmetics(member.cosmetics),
        checkedIn: checked.has(member.userId),
      })),
      checkIn: target
        ? {
            id: target.id,
            consumption: consumption!,
            label: safeLocationLabel(null, consumption as ConsumptionTarget),
            scheduledAt: target.scheduledAt.toISOString(),
            topicHref: target.topicId
              ? `/clubs/${clubId}/topics/${target.topicId}`
              : null,
            available:
              target.opensAt.getTime() <= now &&
              (target.status === "open" || target.status === "upcoming"),
          }
        : null,
      schedule: occurrences.map((o) => ({
        id: o.id,
        label: safeLocationLabel(null, o.consumption as ConsumptionTarget),
        scheduledAt: o.scheduledAt.toISOString(),
        status: o.status,
        href: o.topicId ? `/clubs/${clubId}/topics/${o.topicId}` : null,
      })),
      discussions,
      journal,
      participants,
      rating: {
        coreValues: aggregate.coreValues,
        genreValues: aggregate.genreValues,
        trajectory: aggregate.trajectory,
        dimensions,
        scale: settings.scale,
      },
      viewerRatingStatus: review?.status ?? null,
    };
  }
  async setCheckIn(
    user: AuthUser,
    clubId: string,
    readId: string,
    checkedIn: boolean,
  ) {
    const member = await this.db.query.clubMembers.findFirst({
      where: and(
        eq(s.clubMembers.clubId, clubId),
        eq(s.clubMembers.userId, user.id),
      ),
    });
    if (!member) throw new ForbiddenError("Club membership required");
    const detail = await this.detail(user, clubId, readId);
    if (detail.read.status !== "active" || !detail.checkIn?.available)
      throw new ValidationError("Check-in is not available");
    if (checkedIn)
      await this.db
        .insert(s.clubOccurrenceCheckIns)
        .values({
          id: generateId(),
          clubId,
          occurrenceId: detail.checkIn.id,
          userId: user.id,
        })
        .onConflictDoNothing();
    else
      await this.db
        .delete(s.clubOccurrenceCheckIns)
        .where(
          and(
            eq(s.clubOccurrenceCheckIns.occurrenceId, detail.checkIn.id),
            eq(s.clubOccurrenceCheckIns.userId, user.id),
          ),
        );
    return { checkedIn };
  }
  async library(user: AuthUser, clubId: string, cursor?: string, limit = 20) {
    await this.clubs.requireView(user, clubId);
    const rows = await this.db
      .select()
      .from(s.clubReads)
      .where(
        and(
          eq(s.clubReads.clubId, clubId),
          eq(s.clubReads.status, "completed"),
          cursor
            ? sql`(COALESCE(${s.clubReads.completedAt},${s.clubReads.targetEndDate},${s.clubReads.startDate},'-infinity'::timestamptz),${s.clubReads.id}) < (SELECT COALESCE(completed_at,target_end_date,start_date,'-infinity'::timestamptz),id FROM club_reads WHERE id=${cursor}::uuid AND club_id=${clubId}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        sql`COALESCE(${s.clubReads.completedAt},${s.clubReads.targetEndDate},${s.clubReads.startDate},'-infinity'::timestamptz) DESC`,
        desc(s.clubReads.id),
      )
      .limit(limit);
    return {
      reads: await Promise.all(rows.map((row) => this.summary(user, row))),
      nextCursor: rows.length === limit ? rows.at(-1)!.id : null,
    };
  }
  async overview(
    user: AuthUser,
    clubId: string,
  ): Promise<ClubExperienceOverview> {
    await this.clubs.requireView(user, clubId);
    const [active, round, history] = await Promise.all([
      this.db.query.clubReads.findFirst({
        where: and(
          eq(s.clubReads.clubId, clubId),
          eq(s.clubReads.status, "active"),
        ),
      }),
      this.db.query.clubSelectionRounds.findFirst({
        where: eq(s.clubSelectionRounds.clubId, clubId),
        orderBy: [
          sql`CASE WHEN ${s.clubSelectionRounds.phase} IN ('nominations_open','voting_open','nominations_closed') THEN 0 ELSE 1 END`,
          desc(s.clubSelectionRounds.createdAt),
        ],
      }),
      this.library(user, clubId, undefined, 1),
    ]);
    const activeRead = active
      ? await this.detail(user, clubId, active.id)
      : null;
    let selection: SelectionSummary | null = null;
    if (round) {
      const result = round.result as { winnerId?: string } | null;
      const [winner, counts] = await Promise.all([
        result?.winnerId
          ? this.db.query.clubSelectionCandidates.findFirst({
              where: eq(s.clubSelectionCandidates.id, result.winnerId),
            })
          : null,
        this.db.execute<{
          candidates: number;
          nominators: number;
          voted: number;
          own: number;
          ballot: boolean;
        }>(sql`SELECT
          (SELECT count(*)::int FROM club_selection_candidates WHERE round_id=${round.id} AND eligible) candidates,
          (SELECT count(DISTINCT user_id)::int FROM club_selection_nominations WHERE round_id=${round.id}) nominators,
          (SELECT count(*)::int FROM club_selection_ballots WHERE round_id=${round.id}) voted,
          (SELECT count(*)::int FROM club_selection_nominations WHERE round_id=${round.id} AND user_id=${user.id}) own,
          EXISTS(SELECT 1 FROM club_selection_ballots WHERE round_id=${round.id} AND user_id=${user.id}) ballot`),
      ]);
      selection = {
        id: round.id,
        title: round.title,
        phase: round.phase,
        method: round.method,
        nominationEndsAt: round.nominationEndsAt?.toISOString() ?? null,
        votingStartsAt: round.votingStartsAt?.toISOString() ?? null,
        votingEndsAt: round.votingEndsAt?.toISOString() ?? null,
        candidateCount: counts.rows[0]!.candidates,
        nominatorCount: counts.rows[0]!.nominators,
        votedCount: counts.rows[0]!.voted,
        remainingNominations: Math.max(
          0,
          round.nominationLimit - counts.rows[0]!.own,
        ),
        hasBallot: counts.rows[0]!.ballot,
        winner: winner?.snapshot ?? null,
        nextReadStartsAt: round.nextReadStartsAt?.toISOString() ?? null,
        href: `/clubs/${clubId}/selection-rounds/${round.id}`,
      };
    }
    const activity: SafeClubItem[] = [
      ...(activeRead?.discussions ?? []),
      ...(activeRead?.journal ?? []),
    ];
    if (active)
      activity.push({
        id: active.id,
        kind: "read",
        label: "Club Read started",
        text: null,
        locked: false,
        author: null,
        createdAt: (active.startDate ?? active.createdAt).toISOString(),
        href: `/clubs/${clubId}/reads/${active.id}`,
        unread: false,
      });
    if (round && round.phase !== "draft")
      activity.push({
        id: round.id,
        kind: "selection",
        label: "Selection: " + round.phase.replaceAll("_", " "),
        text: null,
        locked: false,
        author: null,
        createdAt: round.updatedAt.toISOString(),
        href: selection!.href,
        unread: false,
      });
    if (active) {
      const checks = await this.db
        .select({
          check: s.clubOccurrenceCheckIns,
          consumption: s.clubScheduleOccurrences.consumption,
        })
        .from(s.clubOccurrenceCheckIns)
        .innerJoin(
          s.clubScheduleOccurrences,
          eq(
            s.clubOccurrenceCheckIns.occurrenceId,
            s.clubScheduleOccurrences.id,
          ),
        )
        .where(eq(s.clubScheduleOccurrences.clubReadId, active.id))
        .orderBy(desc(s.clubOccurrenceCheckIns.checkedInAt))
        .limit(3);
      for (const { check, consumption } of checks)
        activity.push({
          id: check.id,
          kind: "checkin",
          label:
            "Check-in: " +
            safeLocationLabel(null, consumption as ConsumptionTarget),
          text: null,
          locked: false,
          author: null,
          createdAt: check.checkedInAt.toISOString(),
          href: `/clubs/${clubId}/current-read`,
          unread: false,
        });
    }
    return {
      activeRead: activeRead
        ? {
            ...activeRead,
            discussions: activeRead.discussions.slice(0, 4),
            journal: activeRead.journal.slice(0, 3),
            schedule: [],
            participants: [],
            rating: { ...activeRead.rating, dimensions: [] },
          }
        : null,
      selection,
      upcoming: await this.upcoming.forClub(user, clubId),
      recentActivity: activity
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
      lastRead: history.reads[0] ?? null,
    };
  }
}
