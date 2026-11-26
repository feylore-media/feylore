import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as s from "../../db/schema.js";
import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { BooksService } from "../books/service.js";
import type { PostgresSearchIndex } from "../search/index.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { selectionConfigurationSchema } from "../../../shared/club-selection.js";
import { normalizeProfileCosmetics } from "../../../shared/profile-cosmetics.js";
import type {
  SelectionAudit,
  SelectionCandidateSummary,
  SelectionExperience,
} from "../../../shared/club-selection-experience.js";

type Round = typeof s.clubSelectionRounds.$inferSelect;
export class ClubSelectionExperienceService {
  constructor(
    private db: Database,
    private clubs: ClubService,
    private books: BooksService,
    private searchIndex: PostgresSearchIndex,
  ) {}
  private async round(user: AuthUser, clubId: string, id?: string) {
    await this.clubs.requireView(user, clubId);
    const row = await this.db.query.clubSelectionRounds.findFirst({
      where: and(
        eq(s.clubSelectionRounds.clubId, clubId),
        id ? eq(s.clubSelectionRounds.id, id) : undefined,
      ),
      orderBy: [
        sql`CASE WHEN ${s.clubSelectionRounds.phase} IN ('nominations_open','nominations_closed','voting_open') THEN 0 ELSE 1 END`,
        desc(s.clubSelectionRounds.createdAt),
      ],
    });
    if (id && !row) throw new NotFoundError("Selection Round not found");
    return row;
  }
  private resultVisible(round: Round) {
    return (
      round.phase === "completed" ||
      (round.phase === "voting_open" &&
        selectionConfigurationSchema.parse(round.configuration)
          .resultVisibility === "during_voting")
    );
  }
  async experience(
    user: AuthUser,
    clubId: string,
    id?: string,
    cursor?: string,
  ): Promise<SelectionExperience | null> {
    const round = await this.round(user, clubId, id);
    if (!round) return null;
    const club = await this.clubs.getClub(clubId);
    const [totals, ballot, membership, moderation, page] = await Promise.all([
      this.db.execute<{
        candidateCount: number;
        eligibleCount: number;
        nominationCount: number;
        nominatorCount: number;
        memberCount: number;
        own: number;
        votedCount: number;
      }>(sql`SELECT
        (SELECT count(*)::int FROM club_selection_candidates WHERE round_id=${round.id}) AS "candidateCount",
        (SELECT count(*)::int FROM club_selection_candidates WHERE round_id=${round.id} AND eligible) AS "eligibleCount",
        (SELECT count(*)::int FROM club_selection_nominations WHERE round_id=${round.id}) AS "nominationCount",
        (SELECT count(DISTINCT user_id)::int FROM club_selection_nominations WHERE round_id=${round.id}) AS "nominatorCount",
        (SELECT count(*)::int FROM club_members WHERE club_id=${clubId}) AS "memberCount",
        (SELECT count(*)::int FROM club_selection_nominations WHERE round_id=${round.id} AND user_id=${user.id}) AS own,
        (SELECT count(*)::int FROM club_selection_ballots WHERE round_id=${round.id}) AS "votedCount"`),
      this.db.query.clubSelectionBallots.findFirst({
        where: and(
          eq(s.clubSelectionBallots.roundId, round.id),
          eq(s.clubSelectionBallots.userId, user.id),
        ),
      }),
      this.clubs.getMembership(clubId, user.id),
      this.clubs.canModerate(user, club),
      this.candidates(user, clubId, round.id, cursor),
    ]);
    const counts = totals.rows[0]!;
    const resultVisible = this.resultVisible(round);
    const audit = resultVisible
      ? (round.result as unknown as SelectionAudit | null)
      : null;
    const winner = audit?.winnerId
      ? await this.db.query.clubSelectionCandidates.findFirst({
          where: and(
            eq(s.clubSelectionCandidates.id, audit.winnerId),
            eq(s.clubSelectionCandidates.roundId, round.id),
          ),
        })
      : null;
    const choices = ballot?.ranking.length
      ? await this.db
          .select({
            id: s.clubSelectionCandidates.id,
            title: sql<string>`${s.clubSelectionCandidates.snapshot}->>'title'`,
          })
          .from(s.clubSelectionCandidates)
          .where(
            and(
              eq(s.clubSelectionCandidates.roundId, round.id),
              inArray(s.clubSelectionCandidates.id, ballot.ranking),
            ),
          )
      : [];
    const inPeriod = (start: Date | null, end: Date | null) =>
      (!start || start.getTime() <= Date.now()) &&
      (!end || Date.now() < end.getTime());
    const writable = Boolean(membership && user.permissions.has("clubs.write"));
    const source = round.configuration.shelfSnapshot as
      { name: string; ruleSummary: string | null } | undefined;
    return {
      id: round.id,
      title: round.title,
      phase: round.phase,
      method: round.method,
      nominationStartsAt: round.nominationStartsAt?.toISOString() ?? null,
      nominationEndsAt: round.nominationEndsAt?.toISOString() ?? null,
      votingStartsAt: round.votingStartsAt?.toISOString() ?? null,
      votingEndsAt: round.votingEndsAt?.toISOString() ?? null,
      nextReadStartsAt: round.nextReadStartsAt?.toISOString() ?? null,
      nominationLimit: round.nominationLimit,
      configuration: selectionConfigurationSchema.parse(round.configuration),
      source: source ?? null,
      ...counts,
      remainingNominations: Math.max(0, round.nominationLimit - counts.own),
      viewerBallot: ballot?.ranking ?? [],
      viewerChoices: choices,
      canNominate:
        writable &&
        round.phase === "nominations_open" &&
        inPeriod(round.nominationStartsAt, round.nominationEndsAt) &&
        counts.own < round.nominationLimit,
      canVote:
        writable &&
        round.phase === "voting_open" &&
        round.method !== "random_draw" &&
        inPeriod(round.votingStartsAt, round.votingEndsAt),
      canModerate: moderation && user.permissions.has("clubs.write"),
      isMember: Boolean(membership),
      resultVisible,
      result: audit
        ? {
            winner: winner
              ? { id: winner.id, snapshot: winner.snapshot }
              : null,
            decidedAt: audit.decidedAt,
            eligibleCount: audit.eligibleIds?.length ?? 0,
            clubReadId: audit.clubReadId ?? null,
            runoffRoundId: audit.runoffRoundId ?? null,
            requiresTieResolution: audit.requiresTieResolution ?? false,
            tiedIds: audit.tiedIds,
            tieResolution: audit.tieResolution ?? null,
          }
        : null,
      parentRoundId:
        typeof round.configuration.parentRoundId === "string"
          ? round.configuration.parentRoundId
          : null,
      ...page,
    };
  }
  async candidates(
    user: AuthUser,
    clubId: string,
    roundId: string,
    cursor?: string,
    historicalPool = false,
  ) {
    const round = await this.round(user, clubId, roundId);
    const audit = round!.result as unknown as SelectionAudit | null;
    if (historicalPool && !this.resultVisible(round!))
      throw new ForbiddenError("Results are not available");
    const eligibleIds = historicalPool ? (audit?.eligibleIds ?? []) : null;
    const rows = await this.db
      .select({
        id: s.clubSelectionCandidates.id,
        workSubjectType: s.clubSelectionCandidates.workSubjectType,
        workSubjectId: s.clubSelectionCandidates.workSubjectId,
        snapshot: sql<
          SelectionCandidateSummary["snapshot"]
        >`(${s.clubSelectionCandidates.snapshot}-'description'-'contentWarnings') || jsonb_build_object('hasContentWarnings',jsonb_array_length(COALESCE(${s.clubSelectionCandidates.snapshot}->'contentWarnings','[]'::jsonb))>0)`,
        eligible: s.clubSelectionCandidates.eligible,
        nominationCount: sql<number>`(SELECT count(*)::int FROM club_selection_nominations n WHERE n.candidate_id=${s.clubSelectionCandidates.id})`,
      })
      .from(s.clubSelectionCandidates)
      .where(
        and(
          eq(s.clubSelectionCandidates.roundId, roundId),
          cursor
            ? sql`${s.clubSelectionCandidates.id}>${cursor}::uuid`
            : undefined,
          eligibleIds
            ? inArray(s.clubSelectionCandidates.id, eligibleIds)
            : undefined,
        ),
      )
      .orderBy(asc(s.clubSelectionCandidates.id))
      .limit(25);
    const page = rows.slice(0, 24);
    const nominations = page.length
      ? (
          await this.db.execute<{
            candidateId: string;
            displayName: string;
            reason: string | null;
            cosmetics: unknown;
          }>(
            sql`SELECT "candidateId","displayName",reason,cosmetics FROM (SELECT n.candidate_id "candidateId",u.display_name "displayName",n.reason,p.cosmetics,row_number() OVER(PARTITION BY n.candidate_id ORDER BY n.created_at,n.id) rn FROM club_selection_nominations n JOIN users u ON u.id=n.user_id LEFT JOIN user_profiles p ON p.user_id=u.id WHERE n.candidate_id IN (${sql.join(
              page.map((c) => sql`${c.id}::uuid`),
              sql`,`,
            )})) ranked WHERE rn<=3`,
          )
        ).rows
      : [];
    const readable = user.permissions.has("books.read")
      ? await this.books.readableBookIds(
          user.id,
          page
            .filter((c) => c.workSubjectType === "book" && c.workSubjectId)
            .map((c) => c.workSubjectId!),
        )
      : new Set<string>();
    return {
      candidates: page.map((c) => ({
        ...c,
        availableToRead: Boolean(
          c.workSubjectId && readable.has(c.workSubjectId),
        ),
        nominators: nominations
          .filter((n) => n.candidateId === c.id)
          .slice(0, 3)
          .map((n) => ({
            displayName: n.displayName,
            reason: n.reason,
            cosmetics: normalizeProfileCosmetics(n.cosmetics),
          })),
      })),
      nextCursor: rows.length > 24 ? page.at(-1)!.id : null,
    };
  }
  async candidate(
    user: AuthUser,
    clubId: string,
    roundId: string,
    candidateId: string,
  ) {
    await this.round(user, clubId, roundId);
    const candidate = await this.db.query.clubSelectionCandidates.findFirst({
      where: and(
        eq(s.clubSelectionCandidates.roundId, roundId),
        eq(s.clubSelectionCandidates.id, candidateId),
      ),
    });
    if (!candidate) throw new NotFoundError("Candidate not found");
    const nominators = await this.db
      .select({
        displayName: s.users.displayName,
        reason: s.clubSelectionNominations.reason,
        cosmetics: s.userProfiles.cosmetics,
      })
      .from(s.clubSelectionNominations)
      .innerJoin(s.users, eq(s.users.id, s.clubSelectionNominations.userId))
      .leftJoin(s.userProfiles, eq(s.userProfiles.userId, s.users.id))
      .where(eq(s.clubSelectionNominations.candidateId, candidateId))
      .limit(100);
    const normalizedNominators = nominators.map((n) => ({
      displayName: n.displayName,
      reason: n.reason,
      cosmetics: normalizeProfileCosmetics(n.cosmetics),
    }));
    const [{ count: nominationCount }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(s.clubSelectionNominations)
      .where(eq(s.clubSelectionNominations.candidateId, candidateId));
    const book =
      candidate.workSubjectType === "book" &&
      candidate.workSubjectId &&
      user.permissions.has("books.read")
        ? await this.db.query.books.findFirst({
            where: eq(s.books.id, candidate.workSubjectId),
          })
        : null;
    let accessible = false;
    if (book) {
      try {
        await this.books.ensureUserAccess(user.id, book.id);
        accessible = true;
      } catch (e) {
        if (!(e instanceof ForbiddenError)) throw e;
      }
    }
    const readable = Boolean(
      accessible && book && (await this.books.canReadBook(user.id, book.id)),
    );
    const ids = candidate.snapshot.contentWarnings
      .filter((w) => w.provenance.source === "user" && w.provenance.sourceId)
      .map((w) => w.provenance.sourceId!);
    // Only warning provenance identifiers are resolved; no personal reading state is disclosed.
    const people = ids.length
      ? await this.db
          .select({ id: s.users.id, name: s.users.displayName })
          .from(s.users)
          .where(
            inArray(
              s.users.id,
              ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
            ),
          )
      : [];
    return {
      ...candidate,
      availableToRead: readable,
      nominators: normalizedNominators,
      nominationCount,
      workHref: accessible && book ? `/books/${book.slug}` : null,
      readerHref: readable && book ? `/read/book/${book.slug}` : null,
      warningSources: Object.fromEntries(people.map((p) => [p.id, p.name])),
    };
  }
  async audit(user: AuthUser, clubId: string, roundId: string) {
    const round = await this.round(user, clubId, roundId);
    if (!this.resultVisible(round!))
      throw new ForbiddenError("Results are not available");
    // Stored election only. No ballots or recalculation are returned.
    const result = round!.result as unknown as SelectionAudit | null;
    const titleIds = result
      ? [
          ...new Set(
            [
              result.winnerId,
              ...result.tiedIds,
              ...result.tieBreaks.flatMap((tie) => [
                tie.eliminated,
                ...tie.tiedIds,
              ]),
              ...result.rounds.flatMap((count) => Object.keys(count.counts)),
            ].filter((id): id is string => Boolean(id)),
          ),
        ]
      : [];
    const names = titleIds.length
      ? await this.db
          .select({
            id: s.clubSelectionCandidates.id,
            title: sql<string>`${s.clubSelectionCandidates.snapshot}->>'title'`,
          })
          .from(s.clubSelectionCandidates)
          .where(
            and(
              eq(s.clubSelectionCandidates.roundId, roundId),
              inArray(s.clubSelectionCandidates.id, titleIds),
            ),
          )
      : [];
    return result
      ? {
          ...result,
          eligibleIds: undefined,
          eligibleCount: result.eligibleIds?.length ?? 0,
          candidateTitles: Object.fromEntries(
            names.map((c) => [c.id, c.title]),
          ),
        }
      : null;
  }
  async search(user: AuthUser, clubId: string, query: string) {
    const club = await this.clubs.requireView(user, clubId);
    if (club.context !== "book" || !user.permissions.has("books.read"))
      return [];
    // Uses the shared search index; ISBN falls through the bibliographic identity tables.
    const normalized = query.replace(/[-\s]/g, "");
    let ids: string[];
    if (/^\d{9}[\dXx]$|^\d{13}$/.test(normalized)) {
      const rows = await this.db.execute<{ id: string }>(
        sql`SELECT DISTINCT e.work_id id FROM creative_work_expressions e JOIN creative_work_manifestations m ON m.expression_id=e.id WHERE e.work_type='book' AND regexp_replace(COALESCE(m.external_id,''),'[-\s]','','g')=${normalized} LIMIT 20`,
      );
      ids = rows.rows.map((row) => row.id);
    } else
      ids = (
        await this.searchIndex.query({ q: query, types: ["book"], limit: 20 })
      ).results.map((result) => result.id);
    if (!ids.length) return [];
    return this.db
      .select({
        id: s.books.id,
        title: s.books.title,
        coverFileId: s.books.coverFileId,
        authors: sql<
          string[]
        >`ARRAY(SELECT name FROM book_authors WHERE book_id::text=${s.books.id}::text ORDER BY sort_order)`,
        genres: sql<
          string[]
        >`ARRAY(SELECT name FROM book_genres WHERE book_id::text=${s.books.id}::text)`,
      })
      .from(s.books)
      .where(inArray(s.books.id, ids))
      .orderBy(asc(s.books.title), asc(s.books.id))
      .limit(20);
  }
}
