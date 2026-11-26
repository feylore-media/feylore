import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as s from "../../db/schema.js";
import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { RatingConfigService } from "../ratings/config-service.js";
import { participantPairsForClub } from "./participation.js";
import { NotFoundError } from "../../../shared/errors.js";
import type {
  ClubMemberPresence,
  ClubMembersExperience,
  ClubMemberExperience,
  ClubStatsExperience,
} from "../../../shared/club-presence.js";
import { normalizeProfileCosmetics } from "../../../shared/profile-cosmetics.js";
import { extractChapterNumber } from "../../../shared/club-spoiler.js";
import { normalizeVocabularyKey } from "../../../shared/metadata-formatting.js";
import {
  aggregateParticipantRatings,
  type ParticipantReview,
  type ParticipantStar,
} from "./rating-aggregate.js";

type Read = typeof s.clubReads.$inferSelect;
type ProgressRow = {
  userId: string;
  locator: Record<string, unknown>;
  finished: boolean;
};
const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return (
    (sorted[Math.floor((sorted.length - 1) / 2)]! +
      sorted[Math.floor(sorted.length / 2)]!) /
    2
  );
};
const title = (read: Read) =>
  read.candidateSnapshot?.title ?? "Unavailable work";

/** Club projections contain only explicitly shared Club activity and coarse reading progress. */
export class ClubPresenceService {
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly ratings: RatingConfigService,
  ) {}

  private async presence(
    user: AuthUser,
    clubId: string,
  ): Promise<ClubMembersExperience> {
    await this.clubs.requireView(user, clubId);
    const viewerMembership = await this.clubs.getMembership(clubId, user.id);
    const [active, members] = await Promise.all([
      this.db.query.clubReads.findFirst({
        where: and(
          eq(s.clubReads.clubId, clubId),
          eq(s.clubReads.status, "active"),
        ),
      }),
      this.db
        .select({
          userId: s.users.id,
          username: s.users.username,
          displayName: s.users.displayName,
          avatarFileId: s.users.avatarFileId,
          visibility: s.users.profileVisibility,
          cosmetics: s.userProfiles.cosmetics,
          joinedAt: s.clubMembers.joinedAt,
        })
        .from(s.clubMembers)
        .innerJoin(s.users, eq(s.users.id, s.clubMembers.userId))
        .leftJoin(s.userProfiles, eq(s.userProfiles.userId, s.users.id))
        .where(eq(s.clubMembers.clubId, clubId))
        .orderBy(s.users.displayName, s.users.id),
    ]);
    const workId =
      active?.workSubjectType === "book" ? active.workSubjectId : null;
    const [canonical, legacy, history, target] = await Promise.all([
      workId
        ? this.db.execute<ProgressRow>(
            sql`SELECT DISTINCT ON (user_id) user_id AS "userId", locator_json AS locator, (completed_at IS NOT NULL) AS finished FROM reading_progress WHERE work_type='book' AND work_id=${workId} ORDER BY user_id,(completed_at IS NOT NULL),updated_at DESC,id DESC`,
          )
        : Promise.resolve({ rows: [] as ProgressRow[] }),
      workId
        ? this.db.execute<ProgressRow>(
            sql`SELECT user_id AS "userId", locator_json AS locator,false AS finished FROM user_progress WHERE subject_type='book' AND subject_id=${workId}`,
          )
        : Promise.resolve({ rows: [] as ProgressRow[] }),
      this.db.execute<{ userId: string; reads: number; completed: number }>(
        sql`SELECT p.user_id AS "userId",count(*)::int AS reads,count(*) FILTER (WHERE r.status='completed' AND EXISTS(SELECT 1 FROM reading_progress rp WHERE rp.user_id=p.user_id AND rp.work_type=r.work_subject_type AND rp.work_id=r.work_subject_id AND rp.completed_at IS NOT NULL))::int AS completed FROM (${participantPairsForClub(clubId)}) p JOIN club_reads r ON r.id=p.read_id WHERE r.club_id=${clubId} GROUP BY p.user_id`,
      ),
      active
        ? this.db.query.clubScheduleOccurrences.findFirst({
            where: and(
              eq(s.clubScheduleOccurrences.clubReadId, active.id),
              sql`${s.clubScheduleOccurrences.opensAt}<=now()`,
              sql`${s.clubScheduleOccurrences.status} IN ('open','upcoming')`,
            ),
            orderBy: [desc(s.clubScheduleOccurrences.opensAt)],
          })
        : null,
    ]);
    const checkIns = target
      ? await this.db.execute<{ userId: string }>(
          sql`SELECT user_id AS "userId" FROM club_occurrence_check_ins WHERE occurrence_id=${target.id}`,
        )
      : { rows: [] as { userId: string }[] };
    const current = new Map(legacy.rows.map((row) => [row.userId, row]));
    for (const row of canonical.rows) current.set(row.userId, row);
    const checked = new Set(checkIns.rows.map((row) => row.userId));
    const counts = new Map(history.rows.map((row) => [row.userId, row]));
    return {
      activeRead: active ? { id: active.id, title: title(active) } : null,
      members: members.map((member) => {
        const visible =
          member.userId === user.id ||
          member.visibility === "public" ||
          (member.visibility === "members" && !!viewerMembership);
        const row = visible ? current.get(member.userId) : undefined;
        const locator = row?.locator ?? {};
        const fraction =
          typeof locator.totalProgression === "number"
            ? locator.totalProgression
            : typeof locator.progression === "number"
              ? locator.progression
              : null;
        const chapter =
          typeof locator.title === "string"
            ? extractChapterNumber(locator.title)
            : null;
        const page =
          typeof locator.displayPage === "number" ? locator.displayPage : null;
        const state = !visible
          ? "private"
          : !workId && active
            ? "unknown"
            : row?.finished || (fraction !== null && fraction >= 0.99)
              ? "finished"
              : row
                ? "reading"
                : "not_started";
        const count = counts.get(member.userId);
        return {
          userId: member.userId,
          username: member.username,
          displayName: member.displayName,
          cosmetics: normalizeProfileCosmetics(member.cosmetics),
          avatarUrl:
            visible && member.avatarFileId
              ? `/api/v1/files/${member.avatarFileId}/content`
              : null,
          joinedAt: member.joinedAt.toISOString(),
          progress: {
            state,
            percent: fraction === null ? null : Math.round(fraction * 100),
            chapter: chapter ? Number(chapter) : null,
            page,
          },
          checkIn:
            target && visible
              ? checked.has(member.userId)
                ? "caught_up"
                : "not_yet"
              : null,
          readCount: count?.reads ?? 0,
          completedCount: count?.completed ?? 0,
        } satisfies ClubMemberPresence;
      }),
    };
  }

  members(user: AuthUser, clubId: string) {
    return this.presence(user, clubId);
  }

  async member(
    user: AuthUser,
    clubId: string,
    memberId: string,
    cursor?: string,
  ): Promise<ClubMemberExperience> {
    const experience = await this.presence(user, clubId);
    const member = experience.members.find((item) => item.userId === memberId);
    if (!member) throw new NotFoundError("Club member not found");
    const reads = await this.db.execute<{
      id: string;
      title: string;
      completedAt: Date | null;
      workId: string | null;
    }>(
      sql`SELECT r.id,COALESCE(r.candidate_snapshot->>'title','Unavailable work') AS title,r.completed_at AS "completedAt",r.work_subject_id AS "workId" FROM club_reads r JOIN (${participantPairsForClub(clubId)}) p ON p.read_id=r.id WHERE r.club_id=${clubId} AND p.user_id=${memberId} AND r.status='completed' AND (${cursor ?? null}::uuid IS NULL OR (COALESCE(r.completed_at,r.target_end_date,r.start_date,'-infinity'::timestamptz),r.id)<(SELECT COALESCE(completed_at,target_end_date,start_date,'-infinity'::timestamptz),id FROM club_reads WHERE id=${cursor ?? null}::uuid AND club_id=${clubId})) ORDER BY COALESCE(r.completed_at,r.target_end_date,r.start_date,'-infinity'::timestamptz) DESC,r.id DESC LIMIT 21`,
    );
    const page = reads.rows.slice(0, 20);
    const workIds = [
      ...new Set(
        page.map((read) => read.workId).filter((id): id is string => !!id),
      ),
    ];
    const ratings =
      memberId === user.id && workIds.length
        ? await this.db.execute<{ bookId: string; rating: number }>(
            sql`SELECT DISTINCT ON (book_id) book_id AS "bookId",final_rating AS rating FROM book_reviews WHERE user_id=${memberId} AND status='completed' AND final_rating IS NOT NULL AND book_id IN (${sql.join(
              workIds.map((id) => sql`${id}`),
              sql`,`,
            )}) ORDER BY book_id,updated_at DESC`,
          )
        : { rows: [] };
    const ratingMap = new Map(
      ratings.rows.map((row) => [row.bookId, row.rating]),
    );
    const activity = await this.db.execute<{
      passages: number;
      discussions: number;
    }>(
      sql`SELECT (SELECT count(*)::int FROM club_quotes WHERE club_id=${clubId} AND author_user_id=${memberId}) AS passages,(SELECT count(*)::int FROM club_topics WHERE club_id=${clubId} AND author_user_id=${memberId}) AS discussions`,
    );
    return {
      member,
      recentReads: page.map((read) => ({
        id: read.id,
        title: read.title,
        completedAt: read.completedAt
          ? new Date(read.completedAt).toISOString()
          : null,
        rating: ratingMap.get(read.workId ?? "") ?? null,
      })),
      nextCursor: reads.rows.length > 20 ? page.at(-1)!.id : null,
      sharedPassages: activity.rows[0]?.passages ?? 0,
      discussions: activity.rows[0]?.discussions ?? 0,
    };
  }

  async stats(user: AuthUser, clubId: string): Promise<ClubStatsExperience> {
    const club = await this.clubs.requireView(user, clubId);
    const reads = await this.db
      .select()
      .from(s.clubReads)
      .where(
        and(
          eq(s.clubReads.clubId, clubId),
          eq(s.clubReads.status, "completed"),
        ),
      );
    const participants = await this.db.execute<{
      readId: string;
      userId: string;
      finished: boolean;
      checked: boolean;
      discussed: boolean;
    }>(
      sql`SELECT p.read_id AS "readId",p.user_id AS "userId",EXISTS(SELECT 1 FROM reading_progress rp WHERE rp.user_id=p.user_id AND rp.work_type=r.work_subject_type AND rp.work_id=r.work_subject_id AND rp.completed_at IS NOT NULL) AS finished,EXISTS(SELECT 1 FROM club_occurrence_check_ins c JOIN club_schedule_occurrences o ON o.id=c.occurrence_id WHERE o.club_read_id=p.read_id AND c.user_id=p.user_id) AS checked,EXISTS(SELECT 1 FROM club_topics t WHERE t.club_read_id=p.read_id AND t.author_user_id=p.user_id UNION SELECT 1 FROM club_posts x JOIN club_topics t ON t.id=x.topic_id WHERE t.club_read_id=p.read_id AND x.author_user_id=p.user_id) AS discussed FROM (${participantPairsForClub(clubId)}) p JOIN club_reads r ON r.id=p.read_id WHERE r.club_id=${clubId} AND r.status='completed'`,
    );
    const canonicalIds = [
      ...new Set(
        reads
          .filter(
            (read) => read.workSubjectType === "book" && read.workSubjectId,
          )
          .map((read) => read.workSubjectId!),
      ),
    ];
    const genreRows = canonicalIds.length
      ? await this.db
          .select({ bookId: s.bookGenres.bookId, name: s.bookGenres.name })
          .from(s.bookGenres)
          .where(
            sql`${s.bookGenres.bookId} IN (${sql.join(
              canonicalIds.map((id) => sql`${id}`),
              sql`,`,
            )})`,
          )
      : [];
    const terms = await this.db
      .select()
      .from(s.metadataVocabularyTerms)
      .where(eq(s.metadataVocabularyTerms.kind, "genre"));
    const aliases = await this.db
      .select()
      .from(s.metadataVocabularyAliases)
      .where(eq(s.metadataVocabularyAliases.kind, "genre"));
    const termById = new Map(terms.map((term) => [term.id, term]));
    const termByName = new Map(
      terms.map((term) => [term.normalizedName, term]),
    );
    for (const alias of aliases) {
      const term = termById.get(alias.termId);
      if (term) termByName.set(alias.normalizedAlias, term);
    }
    const canonicalGenres = (raw: string) => {
      const names: string[] = [];
      let term = termByName.get(normalizeVocabularyKey(raw));
      if (!term) return [raw];
      while (term) {
        names.push(term.name);
        term = term.parentId ? termById.get(term.parentId) : undefined;
      }
      return names;
    };
    const genresByBook = new Map<string, string[]>();
    for (const row of genreRows) {
      const list = genresByBook.get(row.bookId) ?? [];
      for (const name of canonicalGenres(row.name))
        if (!list.includes(name)) list.push(name);
      genresByBook.set(row.bookId, list);
    }
    const genreCount = new Map<string, number>();
    const pages: number[] = [],
      durations: number[] = [];
    const workCounts = new Map<string, number>();
    for (const read of reads) {
      const key = read.workSubjectId
        ? `${read.workSubjectType}:${read.workSubjectId}`
        : `external:${read.candidateSnapshot?.title ?? read.id}`;
      workCounts.set(key, (workCounts.get(key) ?? 0) + 1);
      const pageCount = read.candidateSnapshot?.pageCount;
      if (pageCount) pages.push(pageCount);
      if (read.startDate && read.completedAt)
        durations.push(
          Math.max(
            0,
            (read.completedAt.getTime() - read.startDate.getTime()) / 86400000,
          ),
        );
      const names =
        read.workSubjectType === "book" && read.workSubjectId
          ? (genresByBook.get(read.workSubjectId) ?? [])
          : (read.candidateSnapshot?.genres ?? []);
      for (const name of new Set(names.flatMap(canonicalGenres)))
        genreCount.set(name, (genreCount.get(name) ?? 0) + 1);
    }
    const reviewRows = canonicalIds.length
      ? await this.db.execute<{
          bookId: string;
          userId: string;
          rating: number | null;
          recommendation: "yes" | "no" | null;
          core: Record<string, number> | null;
          genre: Record<string, Record<string, number>> | null;
          trajectory: { progress: number; rating: number }[] | null;
        }>(
          sql`SELECT book_id AS "bookId",user_id AS "userId",final_rating AS rating,recommendation,core_values AS core,genre_values AS genre,trajectory FROM book_reviews WHERE status='completed' AND book_id IN (${sql.join(
            canonicalIds.map((id) => sql`${id}`),
            sql`,`,
          )})`,
        )
      : { rows: [] };
    const fallback = canonicalIds.length
      ? await this.db.execute<{
          bookId: string;
          userId: string;
          rating: number;
        }>(
          sql`SELECT subject_id AS "bookId",user_id AS "userId",rating FROM user_ratings WHERE subject_type='book' AND subject_id IN (${sql.join(
            canonicalIds.map((id) => sql`${id}`),
            sql`,`,
          )})`,
        )
      : { rows: [] };
    const reviews = new Map(
      reviewRows.rows.map((row) => [`${row.bookId}:${row.userId}`, row]),
    );
    const stars = new Map(
      fallback.rows.map((row) => [`${row.bookId}:${row.userId}`, row.rating]),
    );
    const selectedReviews: ParticipantReview[] = [];
    const selectedStars: ParticipantStar[] = [];
    const ratingByRead = new Map<string, number[]>();
    for (const person of participants.rows) {
      const read = reads.find((item) => item.id === person.readId)!;
      if (read.workSubjectType !== "book" || !read.workSubjectId) continue;
      const key = `${read.workSubjectId}:${person.userId}`;
      const review = reviews.get(key);
      const rating = review?.rating ?? stars.get(key);
      if (review)
        selectedReviews.push({
          userId: `${read.id}:${person.userId}`,
          finalRating: review.rating,
          recommendation: review.recommendation,
          coreValues: review.core,
          genreValues: review.genre,
          trajectory: review.trajectory,
        });
      const fallbackRating = stars.get(key);
      if (fallbackRating != null)
        selectedStars.push({
          userId: `${read.id}:${person.userId}`,
          rating: fallbackRating,
        });
      if (rating != null) {
        const values = ratingByRead.get(read.id) ?? [];
        values.push(rating);
        ratingByRead.set(read.id, values);
      }
    }
    const aggregate = aggregateParticipantRatings(
      selectedReviews,
      selectedStars,
    );
    const distribution = new Map<number, number>();
    for (const rating of aggregate.values)
      distribution.set(rating, (distribution.get(rating) ?? 0) + 1);
    const months = new Map<string, number>();
    for (const read of reads)
      if (read.completedAt) {
        const month = read.completedAt.toISOString().slice(0, 7);
        months.set(month, (months.get(month) ?? 0) + 1);
      }
    const rated = [...ratingByRead].map(([id, values]) => ({
      read: reads.find((item) => item.id === id)!,
      values,
      average: average(values)!,
    }));
    const highest = rated
      .filter((item) => item.values.length >= 2)
      .sort((a, b) => b.average - a.average)[0];
    const dispersed = rated
      .filter((item) => item.values.length >= 3)
      .map((item) => ({
        ...item,
        sd: Math.sqrt(
          item.values.reduce(
            (sum, value) => sum + (value - item.average) ** 2,
            0,
          ) / item.values.length,
        ),
      }))
      .sort((a, b) => b.sd - a.sd)[0];
    const [dimensions, settings, allGenreDefinitions] = await Promise.all([
      this.ratings.listCoreDimensions(),
      this.ratings.getSettings(),
      this.ratings.listAllGenreDefinitions(),
    ]);
    return {
      since: club.createdAt.toISOString(),
      summary: {
        reads: reads.length,
        distinctWorks: workCounts.size,
        rereads: [...workCounts.values()].reduce(
          (sum, count) => sum + count - 1,
          0,
        ),
        knownPages: pages.length ? pages.reduce((a, b) => a + b, 0) : null,
        pageCountKnown: pages.length,
      },
      length: {
        median: median(pages),
        average: average(pages),
        shortest: pages.length ? Math.min(...pages) : null,
        longest: pages.length ? Math.max(...pages) : null,
      },
      pace: {
        medianDays: median(durations),
        averageDays: average(durations),
        datedReads: durations.length,
      },
      participation: {
        typicalParticipants: median(
          reads.map(
            (read) =>
              participants.rows.filter((person) => person.readId === read.id)
                .length,
          ),
        ),
        participantOccurrences: participants.rows.length,
        completedParticipantOccurrences: participants.rows.filter(
          (person) => person.finished,
        ).length,
        checkInParticipantOccurrences: participants.rows.filter(
          (person) => person.checked,
        ).length,
        discussionParticipantOccurrences: participants.rows.filter(
          (person) => person.discussed,
        ).length,
      },
      genres: [...genreCount]
        .map(([name, count]) => ({ name, reads: count }))
        .sort((a, b) => b.reads - a.reads || a.name.localeCompare(b.name)),
      ratings: {
        average: aggregate.averageRating,
        count: aggregate.ratingCount,
        distribution: [...distribution]
          .map(([rating, count]) => ({ rating, count }))
          .sort((a, b) => a.rating - b.rating),
        coreValues: aggregate.coreValues,
        genreValues: aggregate.genreValues,
        trajectory: aggregate.trajectory,
        dimensions,
        genreDefinitions: allGenreDefinitions.filter(
          (definition) => !!aggregate.genreValues[definition.genreTermId],
        ),
        scale: settings.scale,
      },
      recommendations: {
        yes: aggregate.recommendations ?? 0,
        total: aggregate.recommendationCount,
      },
      overTime: [...months]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, reads: count })),
      highlights: {
        highestRated: highest
          ? {
              readId: highest.read.id,
              title: title(highest.read),
              rating: highest.average,
            }
          : null,
        divisive: dispersed
          ? {
              readId: dispersed.read.id,
              title: title(dispersed.read),
              standardDeviation: dispersed.sd,
            }
          : null,
      },
    };
  }
}
