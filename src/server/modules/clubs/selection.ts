import { shelfRuleSummary } from "../../../shared/shelf-rule-summary.js";
import { randomInt } from "node:crypto";
import { mirrorReadToLegacy } from "./read-compatibility.js";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { ClubWorksService } from "./works.js";
import type { ShelfService } from "../shelves/service.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import { generateId } from "../../security/crypto.js";
import type { CandidateSnapshot } from "../../../shared/club-reads.js";
import { clubReadDefaultsSchema } from "../../../shared/clubs.js";
import {
  ballotSchema,
  clubSelectionDefaultsSchema,
  createSelectionRoundSchema,
  finalizeSelectionSchema,
  instantRunoff,
  nominateCandidateSchema,
  selectionConfigurationSchema,
  selectionPhaseSchema,
  simplePoll,
  updateSelectionRoundSchema,
  type ElectionResult,
} from "../../../shared/club-selection.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Round = typeof schema.clubSelectionRounds.$inferSelect;

export class ClubSelectionService {
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly works: ClubWorksService,
    private readonly shelves: ShelfService,
  ) {}

  private async moderate(user: AuthUser, clubId: string) {
    const club = await this.clubs.requireView(user, clubId);
    if (!(await this.clubs.canModerate(user, club))) throw new ForbiddenError();
    return club;
  }
  private async participate(user: AuthUser, clubId: string) {
    const club = await this.clubs.requireView(user, clubId);
    if (!(await this.clubs.getMembership(clubId, user.id)))
      throw new ForbiddenError();
    return club;
  }
  private async lockedRound(tx: Transaction, clubId: string, roundId: string) {
    await tx.execute(
      sql`SELECT id FROM club_selection_rounds WHERE id=${roundId} AND club_id=${clubId} FOR UPDATE`,
    );
    const round = await tx.query.clubSelectionRounds.findFirst({
      where: and(
        eq(schema.clubSelectionRounds.id, roundId),
        eq(schema.clubSelectionRounds.clubId, clubId),
      ),
    });
    if (!round) throw new NotFoundError("Selection Round not found");
    return round;
  }

  /** A bounded, repeatable sweep derives work from persisted phases and deadlines. */
  async runTransitionSweep(
    now = new Date(),
  ): Promise<{ advanced: number; stopped: number }> {
    let advanced = 0;
    let stopped = 0;
    let cursor: string | null = null;
    for (;;) {
      const rows = await this.db
        .select({
          id: schema.clubSelectionRounds.id,
          clubId: schema.clubSelectionRounds.clubId,
        })
        .from(schema.clubSelectionRounds)
        .where(
          and(
            sql`(
              (${schema.clubSelectionRounds.phase}='draft' AND ${schema.clubSelectionRounds.nominationStartsAt}<=${now}) OR
              (${schema.clubSelectionRounds.phase}='nominations_open' AND ${schema.clubSelectionRounds.nominationEndsAt}<=${now}) OR
              (${schema.clubSelectionRounds.phase}='nominations_closed' AND (
                ${schema.clubSelectionRounds.votingStartsAt}<=${now} OR
                (${schema.clubSelectionRounds.method}='random_draw' AND ${schema.clubSelectionRounds.votingStartsAt} IS NULL AND ${schema.clubSelectionRounds.votingEndsAt} IS NULL AND ${schema.clubSelectionRounds.nominationEndsAt}<=${now})
              )) OR
              (${schema.clubSelectionRounds.phase}='voting_open' AND ${schema.clubSelectionRounds.votingEndsAt}<=${now} AND COALESCE(${schema.clubSelectionRounds.result}->>'requiresTieResolution','false')<>'true')
            )`,
            cursor ? gt(schema.clubSelectionRounds.id, cursor) : undefined,
          ),
        )
        .orderBy(asc(schema.clubSelectionRounds.id))
        .limit(100);
      if (!rows.length) break;
      for (const row of rows) {
        for (let step = 0; step < 4; step++) {
          const round = await this.db.query.clubSelectionRounds.findFirst({
            where: eq(schema.clubSelectionRounds.id, row.id),
          });
          if (
            !round ||
            round.phase === "completed" ||
            round.phase === "cancelled"
          )
            break;
          const due = (date: Date | null) =>
            date !== null && date.getTime() <= now.getTime();
          try {
            if (round.phase === "draft" && due(round.nominationStartsAt))
              await this.transitionCore(row.clubId, row.id, "nominations_open");
            else if (
              round.phase === "nominations_open" &&
              due(round.nominationEndsAt)
            )
              await this.transitionCore(
                row.clubId,
                row.id,
                "nominations_closed",
              );
            else if (
              round.phase === "nominations_closed" &&
              round.method === "random_draw" &&
              !round.votingStartsAt &&
              !round.votingEndsAt &&
              due(round.nominationEndsAt)
            ) {
              const club = await this.clubs.getClub(row.clubId);
              await this.finalizeCore(row.clubId, row.id, club.ownerUserId);
            } else if (
              round.phase === "nominations_closed" &&
              due(round.votingStartsAt)
            )
              await this.transitionCore(row.clubId, row.id, "voting_open");
            else if (
              round.phase === "voting_open" &&
              due(round.votingEndsAt) &&
              !round.result?.requiresTieResolution
            ) {
              const club = await this.clubs.getClub(row.clubId);
              await this.finalizeCore(row.clubId, row.id, club.ownerUserId);
            } else break;
            advanced++;
          } catch (error) {
            // A competing moderator/worker may already have advanced the phase. A
            // genuine validation stop (for example no candidates) is retried on
            // the next sweep after a moderator resolves it.
            const current = await this.db.query.clubSelectionRounds.findFirst({
              where: eq(schema.clubSelectionRounds.id, row.id),
            });
            if (current?.phase === round.phase) {
              stopped++;
              if (!(
                error instanceof ValidationError ||
                error instanceof ConflictError
              ))
                throw error;
              break;
            }
          }
        }
      }
      cursor = rows.at(-1)!.id;
      if (rows.length < 100) break;
    }
    return { advanced, stopped };
  }
  private assertPeriod(
    round: Round,
    phase: "nominations_open" | "voting_open",
  ) {
    if (round.phase !== phase)
      throw new ConflictError("The selection phase is closed");
    const now = Date.now();
    const start =
      phase === "nominations_open"
        ? round.nominationStartsAt
        : round.votingStartsAt;
    const end =
      phase === "nominations_open"
        ? round.nominationEndsAt
        : round.votingEndsAt;
    if ((start && now < start.getTime()) || (end && now >= end.getTime()))
      throw new ConflictError("The participation deadline is closed");
  }
  async create(user: AuthUser, clubId: string, input: unknown) {
    const club = await this.moderate(user, clubId);
    const defaults = clubSelectionDefaultsSchema.parse(club.selectionDefaults);
    const now = new Date();
    const nominationEnd = new Date(
      now.getTime() + defaults.nominationDays * 86400000,
    );
    const votingEnd = new Date(
      nominationEnd.getTime() + defaults.votingDays * 86400000,
    );
    const supplied =
      typeof input === "object" && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const method = supplied.method ?? defaults.method;
    const suppliedConfiguration = supplied.configuration;
    const configuration =
      suppliedConfiguration &&
      typeof suppliedConfiguration === "object" &&
      !Array.isArray(suppliedConfiguration)
        ? { ...defaults.configuration, ...suppliedConfiguration }
        : suppliedConfiguration === undefined
          ? defaults.configuration
          : suppliedConfiguration;
    const body = createSelectionRoundSchema.parse({
      method,
      nominationLimit: defaults.nominationLimit,
      nominationStartsAt: now.toISOString(),
      nominationEndsAt: nominationEnd.toISOString(),
      votingStartsAt:
        method === "random_draw" ? null : nominationEnd.toISOString(),
      votingEndsAt: method === "random_draw" ? null : votingEnd.toISOString(),
      ...supplied,
      configuration,
    });
    const id = generateId();
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM clubs WHERE id=${clubId} FOR UPDATE`);
      const legacy = await tx.query.clubPolls.findFirst({
        where: and(
          eq(schema.clubPolls.clubId, clubId),
          sql`${schema.clubPolls.status} IN ('active','closed')`,
        ),
      });
      if (legacy)
        throw new ConflictError(
          "Finish the active legacy poll before starting a Selection Round",
        );
      await tx.insert(schema.clubSelectionRounds).values({
        ...body,
        id,
        clubId,
        createdBy: user.id,
        nominationStartsAt: body.nominationStartsAt
          ? new Date(body.nominationStartsAt)
          : null,
        nominationEndsAt: body.nominationEndsAt
          ? new Date(body.nominationEndsAt)
          : null,
        votingStartsAt: body.votingStartsAt
          ? new Date(body.votingStartsAt)
          : null,
        votingEndsAt: body.votingEndsAt ? new Date(body.votingEndsAt) : null,
        nextReadStartsAt: body.nextReadStartsAt
          ? new Date(body.nextReadStartsAt)
          : null,
      });
    });
    return id;
  }
  async list(user: AuthUser, clubId: string) {
    await this.clubs.requireView(user, clubId);
    const rows = await this.db
      .select({
        id: schema.clubSelectionRounds.id,
        title: schema.clubSelectionRounds.title,
        phase: schema.clubSelectionRounds.phase,
        method: schema.clubSelectionRounds.method,
        createdAt: schema.clubSelectionRounds.createdAt,
        winnerTitle: sql<
          string | null
        >`CASE WHEN ${schema.clubSelectionRounds.phase}='completed' THEN (SELECT snapshot->>'title' FROM club_selection_candidates WHERE id=(${schema.clubSelectionRounds.result}->>'winnerId')::uuid) ELSE NULL END`,
        clubReadId: sql<
          string | null
        >`CASE WHEN ${schema.clubSelectionRounds.phase}='completed' THEN ${schema.clubSelectionRounds.result}->>'clubReadId' ELSE NULL END`,
        votedCount: sql<number>`(SELECT count(*)::int FROM club_selection_ballots WHERE round_id=${schema.clubSelectionRounds.id})`,
      })
      .from(schema.clubSelectionRounds)
      .where(eq(schema.clubSelectionRounds.clubId, clubId))
      .orderBy(desc(schema.clubSelectionRounds.createdAt))
      .limit(50);
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }
  async configure(
    user: AuthUser,
    clubId: string,
    roundId: string,
    input: unknown,
  ) {
    await this.moderate(user, clubId);
    const patch = updateSelectionRoundSchema.parse(input);
    await this.db.transaction(async (tx) => {
      const round = await this.lockedRound(tx, clubId, roundId);
      if (round.phase === "completed" || round.phase === "cancelled")
        throw new ConflictError("Historical rounds cannot be reconfigured");
      if (
        round.phase !== "draft" &&
        (patch.method !== undefined ||
          patch.configuration !== undefined ||
          patch.nominationLimit !== undefined)
      )
        throw new ConflictError(
          "Selection rules are frozen once nominations open",
        );
      if (
        round.phase !== "draft" &&
        (patch.nominationStartsAt !== undefined ||
          patch.votingStartsAt !== undefined)
      )
        throw new ConflictError(
          "Opening dates are frozen once nominations open",
        );
      if (round.phase !== "draft") {
        for (const [value, previous] of [
          [patch.nominationEndsAt, round.nominationEndsAt],
          [patch.votingEndsAt, round.votingEndsAt],
        ] as const) {
          if (
            value &&
            previous &&
            new Date(value).getTime() < previous.getTime()
          )
            throw new ConflictError(
              "Participation deadlines may only be extended",
            );
        }
      }
      const body = createSelectionRoundSchema.parse({
        ...round,
        nominationStartsAt: round.nominationStartsAt?.toISOString() ?? null,
        nominationEndsAt: round.nominationEndsAt?.toISOString() ?? null,
        votingStartsAt: round.votingStartsAt?.toISOString() ?? null,
        votingEndsAt: round.votingEndsAt?.toISOString() ?? null,
        nextReadStartsAt: round.nextReadStartsAt?.toISOString() ?? null,
        ...patch,
        configuration: { ...round.configuration, ...patch.configuration },
      });
      await tx
        .update(schema.clubSelectionRounds)
        .set({
          ...body,
          nominationStartsAt: body.nominationStartsAt
            ? new Date(body.nominationStartsAt)
            : null,
          nominationEndsAt: body.nominationEndsAt
            ? new Date(body.nominationEndsAt)
            : null,
          votingStartsAt: body.votingStartsAt
            ? new Date(body.votingStartsAt)
            : null,
          votingEndsAt: body.votingEndsAt ? new Date(body.votingEndsAt) : null,
          nextReadStartsAt: body.nextReadStartsAt
            ? new Date(body.nextReadStartsAt)
            : null,
          configuration: { ...round.configuration, ...body.configuration },
          updatedAt: new Date(),
        })
        .where(eq(schema.clubSelectionRounds.id, roundId));
    });
  }
  async current(user: AuthUser, clubId: string) {
    await this.clubs.requireView(user, clubId);
    const row = await this.db.query.clubSelectionRounds.findFirst({
      where: eq(schema.clubSelectionRounds.clubId, clubId),
      orderBy: [
        sql`CASE WHEN ${schema.clubSelectionRounds.phase} IN ('nominations_open','nominations_closed','voting_open') THEN 0 ELSE 1 END`,
        desc(schema.clubSelectionRounds.createdAt),
      ],
    });
    return row ? this.get(user, clubId, row.id) : null;
  }
  async get(user: AuthUser, clubId: string, roundId: string) {
    await this.clubs.requireView(user, clubId);
    const round = await this.db.query.clubSelectionRounds.findFirst({
      where: and(
        eq(schema.clubSelectionRounds.clubId, clubId),
        eq(schema.clubSelectionRounds.id, roundId),
      ),
    });
    if (!round) throw new NotFoundError("Selection Round not found");
    const config = selectionConfigurationSchema.parse(round.configuration);
    const [candidates, nominations, ballots] = await Promise.all([
      this.db
        .select()
        .from(schema.clubSelectionCandidates)
        .where(eq(schema.clubSelectionCandidates.roundId, roundId))
        .orderBy(asc(schema.clubSelectionCandidates.createdAt)),
      this.db
        .select({
          candidateId: schema.clubSelectionNominations.candidateId,
          userId: schema.clubSelectionNominations.userId,
          displayName: schema.users.displayName,
          reason: schema.clubSelectionNominations.reason,
        })
        .from(schema.clubSelectionNominations)
        .innerJoin(
          schema.users,
          eq(schema.users.id, schema.clubSelectionNominations.userId),
        )
        .where(eq(schema.clubSelectionNominations.roundId, roundId)),
      this.db
        .select()
        .from(schema.clubSelectionBallots)
        .where(eq(schema.clubSelectionBallots.roundId, roundId)),
    ]);
    const own = nominations.filter((item) => item.userId === user.id);
    const visibleResult =
      round.phase === "completed" ||
      config.resultVisibility === "during_voting";
    return {
      ...round,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        nominations: nominations.filter(
          (item) => item.candidateId === candidate.id,
        ),
      })),
      nominationCount: nominations.length,
      nominatorCount: new Set(nominations.map((item) => item.userId)).size,
      remainingNominations: Math.max(0, round.nominationLimit - own.length),
      votedCount: ballots.length,
      viewerBallot:
        ballots.find((ballot) => ballot.userId === user.id)?.ranking ?? [],
      result: visibleResult ? round.result : null,
      counts:
        visibleResult && round.method !== "random_draw"
          ? simplePoll(
              candidates
                .filter((candidate) => candidate.eligible)
                .map((candidate) => candidate.id),
              ballots.map((ballot) => ballot.ranking),
            ).rounds[0]?.counts
          : undefined,
    };
  }
  private async snapshot(
    type: "book" | "movie" | "show" | "ttrpg",
    id: string,
  ): Promise<CandidateSnapshot> {
    await this.works.assertWorkExists(type, id);
    const summary = await this.works.resolveWorkSummary(type, id);
    const authors =
      type === "book"
        ? await this.db
            .select()
            .from(schema.bookAuthors)
            .where(eq(schema.bookAuthors.bookId, id))
            .orderBy(asc(schema.bookAuthors.sortOrder))
        : [];
    const book =
      type === "book"
        ? await this.db.query.books.findFirst({
            where: eq(schema.books.id, id),
          })
        : null;
    const genres = book
      ? await this.db
          .select({ name: schema.bookGenres.name })
          .from(schema.bookGenres)
          .where(eq(schema.bookGenres.bookId, id))
      : [];
    const series = book
      ? await this.db
          .select({
            name: schema.bookSeries.name,
            position: schema.bookSeriesMembers.position,
          })
          .from(schema.bookSeriesMembers)
          .innerJoin(
            schema.bookSeries,
            eq(schema.bookSeries.id, schema.bookSeriesMembers.seriesId),
          )
          .where(eq(schema.bookSeriesMembers.bookId, id))
          .limit(1)
      : [];
    return {
      subtitle: book?.subtitle ?? undefined,
      description: book?.description ?? undefined,
      series: series[0]?.name,
      seriesPosition: series[0]?.position ?? undefined,
      title: summary.title,
      authors: authors.map((author) => author.name),
      coverFileId: summary.coverFileId,
      genres: genres.map((g) => g.name),
      contentWarnings: [],
      providerIdentifiers: {},
      provenance: [{ source: "work", sourceId: id }],
    };
  }
  async nominate(
    user: AuthUser,
    clubId: string,
    roundId: string,
    input: unknown,
  ) {
    const club = await this.participate(user, clubId);
    const body = nominateCandidateSchema.parse(input);
    this.works.assertWorkTypeForContext(club.context, body.workSubjectType);
    // Canonical candidates are snapshotted by the server, never from client metadata.
    const snapshot = body.workSubjectId
      ? await this.snapshot(body.workSubjectType, body.workSubjectId)
      : {
          ...body.snapshot!,
          provenance: [{ source: "user" as const, sourceId: user.id }],
          contentWarnings: body.snapshot!.contentWarnings.map((warning) => ({
            ...warning,
            provenance: { source: "user" as const, sourceId: user.id },
          })),
        };
    return this.db.transaction(async (tx) => {
      const round = await this.lockedRound(tx, clubId, roundId);
      this.assertPeriod(round, "nominations_open");
      const nominations = await tx
        .select()
        .from(schema.clubSelectionNominations)
        .where(
          and(
            eq(schema.clubSelectionNominations.roundId, roundId),
            eq(schema.clubSelectionNominations.userId, user.id),
          ),
        );
      if (nominations.length >= round.nominationLimit)
        throw new ConflictError("Nomination allowance exhausted");
      const config = selectionConfigurationSchema.parse(round.configuration);
      if (config.excludePreviouslyRead && body.workSubjectId) {
        const prior = await tx.query.clubReads.findFirst({
          where: and(
            eq(schema.clubReads.clubId, clubId),
            eq(schema.clubReads.workSubjectType, body.workSubjectType),
            eq(schema.clubReads.workSubjectId, body.workSubjectId),
            eq(schema.clubReads.status, "completed"),
          ),
        });
        if (prior)
          throw new ValidationError(
            "This Work was previously read by the club",
          );
      }
      const candidates = await tx
        .select()
        .from(schema.clubSelectionCandidates)
        .where(eq(schema.clubSelectionCandidates.roundId, roundId));
      const existing = candidates.find((candidate) =>
        body.workSubjectId
          ? candidate.workSubjectType === body.workSubjectType &&
            candidate.workSubjectId === body.workSubjectId
          : snapshot.isbn13
            ? candidate.snapshot.isbn13 === snapshot.isbn13
            : snapshot.isbn10
              ? candidate.snapshot.isbn10 === snapshot.isbn10
              : candidate.snapshot.title.toLowerCase() ===
                  snapshot.title.toLowerCase() &&
                candidate.snapshot.authors.join().toLowerCase() ===
                  snapshot.authors.join().toLowerCase(),
      );
      if (
        existing &&
        nominations.some((nomination) => nomination.candidateId === existing.id)
      )
        throw new ConflictError("You already nominated this candidate");
      const candidateId = existing?.id ?? generateId();
      if (!existing)
        await tx.insert(schema.clubSelectionCandidates).values({
          id: candidateId,
          roundId,
          workSubjectType: body.workSubjectType,
          workSubjectId: body.workSubjectId ?? null,
          snapshot,
        });
      await tx.insert(schema.clubSelectionNominations).values({
        id: generateId(),
        roundId,
        candidateId,
        userId: user.id,
        reason: body.reason ?? null,
      });
      return candidateId;
    });
  }
  async ballot(
    user: AuthUser,
    clubId: string,
    roundId: string,
    input: unknown,
  ) {
    await this.participate(user, clubId);
    const { ranking } = ballotSchema.parse(input);
    await this.db.transaction(async (tx) => {
      const round = await this.lockedRound(tx, clubId, roundId);
      this.assertPeriod(round, "voting_open");
      if (round.method === "random_draw")
        throw new ValidationError("Random draws do not accept ballots");
      if (round.method === "simple_poll" && ranking.length !== 1)
        throw new ValidationError("Simple polls accept one candidate");
      const eligible = await tx
        .select()
        .from(schema.clubSelectionCandidates)
        .where(
          and(
            eq(schema.clubSelectionCandidates.roundId, roundId),
            eq(schema.clubSelectionCandidates.eligible, true),
          ),
        );
      if (
        ranking.some((id) => !eligible.some((candidate) => candidate.id === id))
      )
        throw new ValidationError("Ballot contains an ineligible candidate");
      await tx
        .insert(schema.clubSelectionBallots)
        .values({ roundId, userId: user.id, ranking })
        .onConflictDoUpdate({
          target: [
            schema.clubSelectionBallots.roundId,
            schema.clubSelectionBallots.userId,
          ],
          set: { ranking, updatedAt: new Date() },
        });
    });
  }
  async transition(
    user: AuthUser,
    clubId: string,
    roundId: string,
    phaseInput: unknown,
  ) {
    await this.moderate(user, clubId);
    const phase = selectionPhaseSchema.parse(phaseInput);
    await this.transitionCore(clubId, roundId, phase);
  }

  private async transitionCore(
    clubId: string,
    roundId: string,
    phase: Round["phase"],
  ) {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM clubs WHERE id=${clubId} FOR UPDATE`);
      const round = await this.lockedRound(tx, clubId, roundId);
      const allowed: Record<Round["phase"], string[]> = {
        draft: ["nominations_open", "cancelled"],
        nominations_open: ["nominations_closed", "cancelled"],
        nominations_closed: ["nominations_open", "voting_open", "cancelled"],
        voting_open: ["cancelled"],
        completed: [],
        cancelled: [],
      };
      if (!allowed[round.phase].includes(phase))
        throw new ValidationError("Invalid Selection Round transition");
      if (phase === "nominations_open" || phase === "voting_open") {
        const other = await tx.query.clubSelectionRounds.findFirst({
          where: and(
            eq(schema.clubSelectionRounds.clubId, clubId),
            sql`${schema.clubSelectionRounds.phase} IN ('nominations_open','nominations_closed','voting_open')`,
            sql`${schema.clubSelectionRounds.id} <> ${roundId}`,
          ),
        });
        if (other)
          throw new ConflictError("Another Selection Round is already open");
      }
      if (phase === "voting_open") {
        const candidates = await tx
          .select()
          .from(schema.clubSelectionCandidates)
          .where(
            and(
              eq(schema.clubSelectionCandidates.roundId, roundId),
              eq(schema.clubSelectionCandidates.eligible, true),
            ),
          );
        if (!candidates.length)
          throw new ValidationError("No eligible candidates");
      }
      await tx
        .update(schema.clubSelectionRounds)
        .set({
          phase,
          ...(phase === "nominations_open" &&
          round.nominationStartsAt &&
          round.nominationStartsAt > new Date()
            ? { nominationStartsAt: new Date() }
            : {}),
          ...(phase === "nominations_closed" &&
          round.nominationEndsAt &&
          round.nominationEndsAt > new Date()
            ? { nominationEndsAt: new Date() }
            : {}),
          ...(phase === "voting_open" &&
          round.votingStartsAt &&
          round.votingStartsAt > new Date()
            ? { votingStartsAt: new Date() }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.clubSelectionRounds.id, roundId));
    });
  }
  async closeVoting(user: AuthUser, clubId: string, roundId: string) {
    await this.moderate(user, clubId);
    await this.db.transaction(async (tx) => {
      const round = await this.lockedRound(tx, clubId, roundId);
      if (
        round.phase !== "voting_open" ||
        (round.votingStartsAt && round.votingStartsAt.getTime() > Date.now())
      )
        throw new ConflictError("Voting is not open");
      await tx
        .update(schema.clubSelectionRounds)
        .set({ votingEndsAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.clubSelectionRounds.id, roundId));
    });
  }
  async importShelf(
    user: AuthUser,
    clubId: string,
    roundId: string,
    shelfId: string,
  ) {
    const club = await this.moderate(user, clubId);
    // Shelf expressions, rules and access are evaluated by the existing Shelf service.
    const shelf = await this.shelves.requireView(user, shelfId);
    const source = {
      name: shelf.name,
      ruleSummary: shelfRuleSummary(shelf.membershipExpression),
    };
    const pool = await this.shelves.listItems(user, shelfId);
    if (pool.length > 500)
      throw new ValidationError(
        "Candidate pool exceeds 500 Works; narrow the Shelf rules",
      );
    const snapshots: {
      type: "book" | "movie" | "show";
      id: string;
      snapshot: CandidateSnapshot;
    }[] = [];
    for (const item of pool) {
      if (!["book", "movie", "show"].includes(item.subjectType)) continue;
      const type = item.subjectType as "book" | "movie" | "show";
      this.works.assertWorkTypeForContext(club.context, type);
      snapshots.push({
        type,
        id: item.subjectId,
        snapshot: await this.snapshot(type, item.subjectId),
      });
    }
    await this.db.transaction(async (tx) => {
      const round = await this.lockedRound(tx, clubId, roundId);
      if (!["draft", "nominations_open"].includes(round.phase))
        throw new ConflictError("Candidate pool is frozen");
      const config = selectionConfigurationSchema.parse(round.configuration);
      const existing = await tx
        .select()
        .from(schema.clubSelectionCandidates)
        .where(eq(schema.clubSelectionCandidates.roundId, roundId));
      for (const item of snapshots) {
        if (
          existing.some(
            (candidate) =>
              candidate.workSubjectType === item.type &&
              candidate.workSubjectId === item.id,
          )
        )
          continue;
        if (config.excludePreviouslyRead) {
          const prior = await tx.query.clubReads.findFirst({
            where: and(
              eq(schema.clubReads.clubId, clubId),
              eq(schema.clubReads.status, "completed"),
              eq(schema.clubReads.workSubjectType, item.type),
              eq(schema.clubReads.workSubjectId, item.id),
            ),
          });
          if (prior) continue;
        }
        await tx.insert(schema.clubSelectionCandidates).values({
          id: generateId(),
          roundId,
          workSubjectType: item.type,
          workSubjectId: item.id,
          snapshot: item.snapshot,
        });
      }
      await tx
        .update(schema.clubSelectionRounds)
        .set({
          configuration: {
            ...round.configuration,
            shelfId,
            shelfSnapshot: source,
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.clubSelectionRounds.id, roundId));
    });
  }
  async finalize(
    user: AuthUser,
    clubId: string,
    roundId: string,
    input: unknown = {},
  ) {
    await this.moderate(user, clubId);
    const body = finalizeSelectionSchema.parse(input);
    return this.finalizeCore(clubId, roundId, user.id, body.candidateId);
  }

  private async finalizeCore(
    clubId: string,
    roundId: string,
    actorId: string,
    candidateId?: string,
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM clubs WHERE id=${clubId} FOR UPDATE`);
      const round = await this.lockedRound(tx, clubId, roundId);
      if (round.phase === "completed") return round.result;
      if (
        round.method === "random_draw"
          ? !["nominations_closed", "voting_open"].includes(round.phase)
          : round.phase !== "voting_open"
      )
        throw new ConflictError("Round is not ready for selection");
      const config = selectionConfigurationSchema.parse(round.configuration);
      let candidates = await tx
        .select()
        .from(schema.clubSelectionCandidates)
        .where(
          and(
            eq(schema.clubSelectionCandidates.roundId, roundId),
            eq(schema.clubSelectionCandidates.eligible, true),
          ),
        );
      if (config.excludePreviouslyRead) {
        const prior = await tx
          .select()
          .from(schema.clubReads)
          .where(
            and(
              eq(schema.clubReads.clubId, clubId),
              eq(schema.clubReads.status, "completed"),
            ),
          );
        candidates = candidates.filter(
          (candidate) =>
            !candidate.workSubjectId ||
            !prior.some(
              (read) =>
                read.workSubjectType === candidate.workSubjectType &&
                read.workSubjectId === candidate.workSubjectId,
            ),
        );
      }
      const ids = candidates.map((candidate) => candidate.id).sort();
      if (!ids.length) throw new ValidationError("No eligible candidates");
      const ballots = await tx
        .select()
        .from(schema.clubSelectionBallots)
        .where(eq(schema.clubSelectionBallots.roundId, roundId));
      if (round.method !== "random_draw" && !ballots.length)
        throw new ValidationError("No ballots were submitted");
      let result: ElectionResult;
      if (round.method === "random_draw")
        result = {
          method: "random_draw",
          winnerId: ids[randomInt(ids.length)]!,
          tiedIds: [],
          rounds: [],
          eligibleIds: ids,
          tieBreaks: [],
        };
      else
        result =
          round.method === "ranked_choice"
            ? instantRunoff(
                ids,
                ballots.map((ballot) => ballot.ranking),
              )
            : simplePoll(
                ids,
                ballots.map((ballot) => ballot.ranking),
              );
      if (!result.winnerId && result.tiedIds.length) {
        if (config.tieBehavior === "runoff") {
          const runoffRoundId = generateId();
          await tx.insert(schema.clubSelectionRounds).values({
            id: runoffRoundId,
            clubId,
            title: `${round.title} — Runoff`,
            phase: "voting_open",
            method: "simple_poll",
            nextReadStartsAt: round.nextReadStartsAt,
            createdBy: actorId,
            configuration: { ...round.configuration, parentRoundId: roundId },
          });
          const candidateMap: Record<string, string> = {};
          for (const id of result.tiedIds) {
            const candidate = candidates.find((item) => item.id === id)!;
            const newId = generateId();
            candidateMap[id] = newId;
            await tx.insert(schema.clubSelectionCandidates).values({
              id: newId,
              roundId: runoffRoundId,
              workSubjectType: candidate.workSubjectType,
              workSubjectId: candidate.workSubjectId,
              snapshot: candidate.snapshot,
            });
          }
          const pending = {
            ...result,
            configuration: round.configuration,
            decidedAt: new Date().toISOString(),
            runoffRoundId,
            candidateMap,
            tieResolution: "runoff",
          };
          await tx
            .update(schema.clubSelectionRounds)
            .set({ phase: "completed", result: pending, updatedAt: new Date() })
            .where(eq(schema.clubSelectionRounds.id, roundId));
          return pending;
        }
        if (config.tieBehavior === "random")
          result.winnerId = result.tiedIds[randomInt(result.tiedIds.length)]!;
        else if (
          config.tieBehavior === "moderator" &&
          candidateId &&
          result.tiedIds.includes(candidateId)
        )
          result.winnerId = candidateId;
        else {
          const pending = {
            ...result,
            configuration: round.configuration,
            decidedAt: new Date().toISOString(),
            requiresTieResolution: true,
          };
          await tx
            .update(schema.clubSelectionRounds)
            .set({ result: pending, updatedAt: new Date() })
            .where(eq(schema.clubSelectionRounds.id, roundId));
          return pending;
        }
      }
      if (!result.winnerId)
        throw new ValidationError("Selection has no winner");
      const upcoming = await tx.query.clubReads.findFirst({
        where: and(
          eq(schema.clubReads.clubId, clubId),
          eq(schema.clubReads.status, "scheduled"),
        ),
      });
      if (upcoming)
        throw new ConflictError("The club already has an upcoming read");
      const winner = candidates.find(
        (candidate) => candidate.id === result.winnerId,
      )!;
      const club = await tx.query.clubs.findFirst({
        where: eq(schema.clubs.id, clubId),
      });
      const durationDays = clubReadDefaultsSchema.parse(
        club?.readDefaults,
      ).durationDays;
      const readId = generateId();
      const persisted = {
        ...result,
        configuration: round.configuration,
        decidedAt: new Date().toISOString(),
        clubReadId: readId,
        tieResolution: result.tiedIds.length ? config.tieBehavior : null,
      };
      const [created] = await tx
        .insert(schema.clubReads)
        .values({
          id: readId,
          clubId,
          workSubjectType: winner.workSubjectType,
          workSubjectId: winner.workSubjectId,
          candidateSnapshot: winner.snapshot,
          status: "scheduled",
          startDate: round.nextReadStartsAt,
          targetEndDate:
            round.nextReadStartsAt && durationDays
              ? new Date(
                  round.nextReadStartsAt.getTime() + durationDays * 86400000,
                )
              : null,
          selectionRoundId: roundId,
          createdBy: actorId,
        })
        .returning();
      await mirrorReadToLegacy(tx, created!, actorId);
      await tx
        .update(schema.clubSelectionRounds)
        .set({ phase: "completed", result: persisted, updatedAt: new Date() })
        .where(eq(schema.clubSelectionRounds.id, roundId));
      return persisted;
    });
  }
}
