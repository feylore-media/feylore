import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import type { AuthUser } from "../authorization/service.js";
import { PERMISSIONS } from "../../../shared/permissions.js";
import {
  CHALLENGE_EVENT_TYPES,
  bingoSocialSummary,
  challengeCreateSchema,
  challengeEffectiveState,
  evaluateBingoOutcome,
  evaluateQuestOutcome,
  groupChallengeHub,
  isBingoStyleKey,
  isQuestStyleKey,
  questSocialSummary,
  simpleSocialSummary,
  type BingoBoard,
  type BingoBoardInput,
  type BingoBoardSize,
  type BingoBoardView,
  type BingoSquare,
  type BingoSquareState,
  type BingoVictory,
  type ChallengeHub,
  type ChallengeInvite,
  type ChallengeInviteState,
  type ChallengeJoinPolicy,
  type ChallengeObjective,
  type ChallengeParticipantSummary,
  type ChallengeParticipantView,
  type ChallengeRecord,
  type ChallengeSocialSummary,
  type ChallengeState,
  type QuestEdge,
  type QuestGraph,
  type QuestGraphInput,
  type QuestGraphView,
  type QuestJoin,
  type QuestNode,
  type QuestNodeKind,
  type QuestNodeState,
} from "../../../shared/challenges.js";
import {
  aggregateGoalCandidates,
  evaluateCandidate,
  type GoalCandidate,
  type GoalProgress,
} from "../../../shared/goal-evaluation.js";
import { getGoalMetric, type GoalRecord } from "../../../shared/goals.js";
import {
  getGoalMetricDefinition,
  type GoalCandidateProvider,
} from "../../../shared/goal-registry.js";
import {
  createCompletedReadingProvider,
  createCompletedPlaybackProvider,
} from "../goals/providers.js";
import type { ActivityService } from "../activity/service.js";
import type { AchievementService } from "../achievements/service.js";
import type { DomainEventBus } from "../notifications/events.js";
import type { SystemSettingsService } from "../settings/system-service.js";
import type { ClubService } from "../clubs/service.js";

type ChallengeRow = typeof schema.challenges.$inferSelect;
type ObjectiveRow = typeof schema.challengeObjectives.$inferSelect;
type ParticipantRow = typeof schema.challengeParticipants.$inferSelect;

export interface ChallengeDetail extends ChallengeRecord {
  viewerProgress: GoalProgress | null;
  viewerParticipation: ChallengeParticipantView | null;
  /** Bingo participant board (format === "bingo" only). */
  bingo?: BingoBoardView | null;
  /** Quest participant map (format === "quest" only). */
  quest?: QuestGraphView | null;
  canManage: boolean;
  canJoin: boolean;
  canLeave: boolean;
}

const COMPLETION_ACHIEVEMENT_KEY = "completed";

function toObjective(row: ObjectiveRow): ChallengeObjective {
  return {
    id: row.id,
    challengeId: row.challengeId,
    metric: row.metric,
    aggregation: (row.aggregation as ChallengeObjective["aggregation"]) ?? {
      kind: "count",
    },
    target: row.target,
    activity: (row.activity as ChallengeObjective["activity"]) ?? "finish",
    basis: (row.basis as ChallengeObjective["basis"]) ?? "completed",
    domains: row.domains ?? [],
    rule: (row.rule as ChallengeObjective["rule"]) ?? undefined,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Challenges 1.0 engine.
 *
 * Core challenge/objective APIs are format-agnostic (many objectives,
 * no assumed linear progression). The Simple format's one-objective rule
 * lives in `requireSimple` / create/update validation only.
 */
export class ChallengeService {
  private readonly providers: readonly GoalCandidateProvider[];
  private activity?: ActivityService;
  private achievements?: AchievementService;
  private events?: DomainEventBus;
  private clubs?: ClubService;

  constructor(
    private readonly db: Database,
    private readonly systemSettings: SystemSettingsService,
  ) {
    this.providers = [
      createCompletedReadingProvider(db),
      createCompletedPlaybackProvider(db, {
        id: "movies",
        domains: ["movies"],
        subjectType: "movie",
        title: "Movies",
      }),
      createCompletedPlaybackProvider(db, {
        id: "tv-episodes",
        domains: ["tv"],
        subjectType: "tv_episode",
        title: "TV episodes",
      }),
      createCompletedPlaybackProvider(db, {
        id: "podcast-episodes",
        domains: ["podcasts"],
        subjectType: "podcast_episode",
        title: "Podcast episodes",
      }),
      createCompletedPlaybackProvider(db, {
        id: "albums",
        domains: ["music"],
        subjectType: "album",
        title: "Albums",
      }),
    ];
  }

  setActivityService(activity: ActivityService) {
    this.activity = activity;
  }

  setAchievementService(achievements: AchievementService) {
    this.achievements = achievements;
  }

  setDomainEvents(events: DomainEventBus) {
    this.events = events;
  }

  setClubService(clubs: ClubService) {
    this.clubs = clubs;
  }

  async isEnabled(): Promise<boolean> {
    return (await this.systemSettings.getEnabledFeatureModules()).includes(
      "challenges",
    );
  }

  private async requireEnabled() {
    if (!(await this.isEnabled()))
      throw new NotFoundError("Challenges are disabled");
  }

  // ------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------

  async getChallenge(id: string): Promise<ChallengeRow> {
    const row = await this.db.query.challenges.findFirst({
      where: eq(schema.challenges.id, id),
    });
    if (!row) throw new NotFoundError("Challenge not found");
    return row;
  }

  async listObjectives(challengeId: string): Promise<ChallengeObjective[]> {
    const rows = await this.db
      .select()
      .from(schema.challengeObjectives)
      .where(eq(schema.challengeObjectives.challengeId, challengeId));
    return rows.sort((a, b) => a.sortOrder - b.sortOrder).map(toObjective);
  }

  // ------------------------------------------------------------------
  // Bingo board layer (references objectives; never a new objective kind)
  // ------------------------------------------------------------------

  /**
   * Board config for a Bingo challenge: shared by every participant.
   * Returns null for non-Bingo challenges.
   */
  async getBoardConfig(challengeId: string): Promise<BingoBoard | null> {
    const boardRow = await this.db.query.bingoBoards.findFirst({
      where: eq(schema.bingoBoards.challengeId, challengeId),
    });
    if (!boardRow) return null;
    const squareRows = await this.db
      .select()
      .from(schema.bingoSquares)
      .where(eq(schema.bingoSquares.boardId, boardRow.id));
    const objectives = await this.listObjectives(challengeId);
    const byId = new Map(
      objectives.map((objective) => [objective.id, objective]),
    );
    const squares: BingoSquare[] = squareRows
      .sort((a, b) => a.position - b.position)
      .map((row) => ({
        id: row.id,
        boardId: row.boardId,
        position: row.position,
        objectiveId: row.objectiveId,
        freeSpace: row.freeSpace,
        label: row.label,
        objective: row.objectiveId ? (byId.get(row.objectiveId) ?? null) : null,
      }));
    return {
      id: boardRow.id,
      challengeId: boardRow.challengeId,
      size: boardRow.size as BingoBoardSize,
      victory: boardRow.victory as BingoVictory,
      victoryLines: boardRow.victoryLines,
      styleKey: boardRow.styleKey,
      presentation:
        (boardRow.presentation as Record<string, unknown> | null) ?? null,
      squares,
    };
  }

  private async attachBoard(
    row: ChallengeRow,
    record: ChallengeRecord,
  ): Promise<void> {
    if (row.format !== "bingo") return;
    record.bingoBoard = await this.getBoardConfig(row.id);
  }

  // ------------------------------------------------------------------
  // Quest graph layer (references objectives; reachability wins quests)
  // ------------------------------------------------------------------

  /**
   * Graph config for a Quest challenge: shared by every participant.
   * Returns null for non-Quest challenges.
   */
  async getQuestConfig(challengeId: string): Promise<QuestGraph | null> {
    const graphRow = await this.db.query.questGraphs.findFirst({
      where: eq(schema.questGraphs.challengeId, challengeId),
    });
    if (!graphRow) return null;
    const nodeRows = await this.db
      .select()
      .from(schema.questNodes)
      .where(eq(schema.questNodes.graphId, graphRow.id));
    const edgeRows = await this.db
      .select()
      .from(schema.questEdges)
      .where(eq(schema.questEdges.graphId, graphRow.id));
    const objectives = await this.listObjectives(challengeId);
    const byId = new Map(
      objectives.map((objective) => [objective.id, objective]),
    );
    const idToKey = new Map(nodeRows.map((row) => [row.id, row.key]));
    const nodes: QuestNode[] = nodeRows
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map((row) => ({
        id: row.id,
        graphId: row.graphId,
        key: row.key,
        kind: row.kind as QuestNodeKind,
        label: row.label,
        optional: row.optional,
        join: row.join as QuestJoin,
        x: row.posX,
        y: row.posY,
        objectiveId: row.objectiveId,
        objective: row.objectiveId ? (byId.get(row.objectiveId) ?? null) : null,
      }));
    const edges: QuestEdge[] = edgeRows.map((row) => ({
      id: row.id,
      graphId: row.graphId,
      fromNodeId: row.fromNodeId,
      toNodeId: row.toNodeId,
      fromKey: idToKey.get(row.fromNodeId) ?? row.fromNodeId,
      toKey: idToKey.get(row.toNodeId) ?? row.toNodeId,
    }));
    return {
      id: graphRow.id,
      challengeId: graphRow.challengeId,
      styleKey: graphRow.styleKey,
      presentation:
        (graphRow.presentation as Record<string, unknown> | null) ?? null,
      nodes,
      edges,
    };
  }

  private async attachQuest(
    row: ChallengeRow,
    record: ChallengeRecord,
  ): Promise<void> {
    if (row.format !== "quest") return;
    record.questGraph = await this.getQuestConfig(row.id);
  }

  private effective(row: ChallengeRow): ChallengeState {
    return challengeEffectiveState({
      state: row.state as ChallengeState,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    });
  }

  async isClubModerator(
    user: AuthUser,
    clubId: string | null,
  ): Promise<boolean> {
    if (!clubId || !this.clubs) return false;
    const club = await this.clubs.getClub(clubId);
    return this.clubs.canModerate(user, club);
  }

  /**
   * Club challenge creation follows club permissions: membership plus
   * moderator status (or the global club-write permission). Shared by
   * create() and the club tab's creation affordance so both agree.
   */
  async requireClubCreateAccess(
    user: AuthUser,
    clubId: string,
  ): Promise<void> {
    if (!this.clubs) throw new ValidationError("Unknown club");
    const club = await this.clubs.getClub(clubId);
    if (!(await this.clubs.canView(user, club))) {
      throw new ForbiddenError();
    }
    const membership = await this.clubs.getMembership(clubId, user.id);
    const moderator = await this.clubs.canModerate(user, club);
    if (!membership) throw new ForbiddenError("Club membership required");
    if (!moderator && !user.permissions.has(PERMISSIONS.CLUBS_WRITE)) {
      throw new ForbiddenError("Club moderator access required");
    }
  }

  async canCreateInClub(user: AuthUser, clubId: string): Promise<boolean> {
    try {
      await this.requireClubCreateAccess(user, clubId);
      return true;
    } catch {
      return false;
    }
  }

  /** Any invite row (pending or accepted) — invitees can view to respond. */
  async getInvite(
    challengeId: string,
    inviteeUserId: string,
  ): Promise<typeof schema.challengeInvites.$inferSelect | undefined> {
    return this.db.query.challengeInvites.findFirst({
      where: and(
        eq(schema.challengeInvites.challengeId, challengeId),
        eq(schema.challengeInvites.inviteeUserId, inviteeUserId),
      ),
    });
  }

  async canView(user: AuthUser, challenge: ChallengeRow): Promise<boolean> {
    if (challenge.creatorUserId === user.id) return true;
    if (user.permissions.has(PERMISSIONS.SYSTEM_SETTINGS_WRITE)) return true;
    const participant = await this.db.query.challengeParticipants.findFirst({
      where: and(
        eq(schema.challengeParticipants.challengeId, challenge.id),
        eq(schema.challengeParticipants.userId, user.id),
      ),
    });
    if (participant && participant.state !== "left") return true;
    // Invitees can view an invite-only challenge to accept or decline.
    if (await this.getInvite(challenge.id, user.id)) return true;
    if (challenge.clubId) {
      if (!this.clubs) return false;
      const membership = await this.clubs.getMembership(
        challenge.clubId,
        user.id,
      );
      return Boolean(membership);
    }
    if (challenge.visibility === "public") {
      return user.permissions.has(PERMISSIONS.GOALS_READ);
    }
    return false;
  }

  async requireView(user: AuthUser, id: string): Promise<ChallengeRow> {
    await this.requireEnabled();
    const challenge = await this.getChallenge(id);
    if (!(await this.canView(user, challenge))) throw new ForbiddenError();
    return challenge;
  }

  async canManage(user: AuthUser, challenge: ChallengeRow): Promise<boolean> {
    if (challenge.creatorUserId === user.id) return true;
    if (user.permissions.has(PERMISSIONS.SYSTEM_SETTINGS_WRITE)) return true;
    if (challenge.clubId) {
      return this.isClubModerator(user, challenge.clubId);
    }
    return false;
  }

  async canJoin(user: AuthUser, challenge: ChallengeRow): Promise<boolean> {
    const effective = this.effective(challenge);
    if (effective !== "upcoming" && effective !== "active") return false;
    if (!(await this.canView(user, challenge))) {
      // Open public challenges are viewable; anything else gates joining.
      if (
        !challenge.clubId &&
        challenge.visibility === "public" &&
        challenge.joinPolicy === "open"
      ) {
        if (!user.permissions.has(PERMISSIONS.GOALS_READ)) return false;
      } else {
        return false;
      }
    }
    const policy = challenge.joinPolicy as ChallengeJoinPolicy;
    if (policy === "open") return true;
    if (policy === "club_members") {
      if (!challenge.clubId || !this.clubs) return false;
      return Boolean(await this.clubs.getMembership(challenge.clubId, user.id));
    }
    // invite_only: creator + club moderators can always join; invited
    // users join through the accept flow (which calls join directly).
    if (challenge.creatorUserId === user.id) return true;
    if (await this.getInvite(challenge.id, user.id)) return true;
    if (challenge.clubId) {
      return this.isClubModerator(user, challenge.clubId);
    }
    return false;
  }

  toPublic(
    row: ChallengeRow,
    objectives: ChallengeObjective[],
    participantCount = 0,
  ): ChallengeRecord {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      format: row.format as ChallengeRecord["format"],
      creatorUserId: row.creatorUserId,
      clubId: row.clubId ?? null,
      visibility: row.visibility as ChallengeRecord["visibility"],
      joinPolicy: row.joinPolicy as ChallengeRecord["joinPolicy"],
      state: row.state as ChallengeState,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      objectives,
      effectiveState: this.effective(row),
      participantCount,
    };
  }

  async listAccessible(
    user: AuthUser,
    options: { clubId?: string; state?: ChallengeState } = {},
  ): Promise<ChallengeRecord[]> {
    await this.requireEnabled();
    const rows = await this.db.select().from(schema.challenges);
    const filtered = options.clubId
      ? rows.filter((row) => row.clubId === options.clubId)
      : rows;
    const visible: ChallengeRecord[] = [];
    for (const row of filtered) {
      if (!(await this.canView(user, row))) continue;
      const record = this.toPublic(row, await this.listObjectives(row.id));
      if (options.state && record.effectiveState !== options.state) continue;
      record.participantCount = await this.countParticipants(row.id);
      const participation = await this.getParticipation(row.id, user.id);
      record.viewerParticipation = participation;
      record.hasCompletionAchievement = await this.hasCompletionAchievement(
        row.id,
      );
      await this.attachBoard(row, record);
      await this.attachQuest(row, record);
      visible.push(record);
    }
    return visible.sort(
      (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
    );
  }

  private async countParticipants(challengeId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(schema.challengeParticipants)
      .where(eq(schema.challengeParticipants.challengeId, challengeId));
    return rows.filter((row) => row.state !== "left").length;
  }

  async getParticipation(
    challengeId: string,
    userId: string,
  ): Promise<ChallengeParticipantView | null> {
    const row = await this.db.query.challengeParticipants.findFirst({
      where: and(
        eq(schema.challengeParticipants.challengeId, challengeId),
        eq(schema.challengeParticipants.userId, userId),
      ),
    });
    if (!row || row.state === "left") return null;
    return {
      userId: row.userId,
      state: row.state as ChallengeParticipantView["state"],
      joinedAt: row.joinedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      progress: null,
    };
  }

  private async hasCompletionAchievement(
    challengeId: string,
  ): Promise<boolean> {
    if (!this.achievements) return false;
    try {
      const defs = await this.achievements.getSourceAchievements(
        "challenge",
        challengeId,
        { includeArchived: false },
      );
      return defs.some((def) => def.key === COMPLETION_ACHIEVEMENT_KEY);
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Validation (Simple lives here, not in the tables)
  // ------------------------------------------------------------------

  private requireSimple(objectives: readonly unknown[]) {
    if (objectives.length !== 1) {
      throw new ValidationError(
        "Simple challenges require exactly one objective",
      );
    }
  }

  private validateObjective(input: {
    metric: string;
    aggregation: ChallengeObjective["aggregation"];
    domains: string[];
    activity: ChallengeObjective["activity"];
    basis: ChallengeObjective["basis"];
  }) {
    const definition = getGoalMetricDefinition(input.metric);
    if (!definition)
      throw new ValidationError("Challenge metric is not registered");
    if (definition.aggregation !== input.aggregation.kind) {
      throw new ValidationError(
        "Challenge aggregation is incompatible with metric",
      );
    }
    if (!definition.supportedActivities.includes(input.basis)) {
      throw new ValidationError(
        "Challenge activity is incompatible with metric",
      );
    }
    if (
      input.domains.length > 0 &&
      !input.domains.includes("global") &&
      !input.domains.some((domain) =>
        (definition.supportedDomains as readonly string[]).includes(domain),
      )
    ) {
      throw new ValidationError("Challenge domain is incompatible with metric");
    }
    const metric = getGoalMetric(input.metric);
    if (metric && input.domains.length > 0) {
      const allowed = new Set(metric.applicableDomains as readonly string[]);
      const invalid = input.domains.filter(
        (domain) => !allowed.has(domain) && domain !== "global",
      );
      if (invalid.length > 0) {
        throw new ValidationError(
          "Challenge domain is incompatible with selected metric",
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // Writes
  // ------------------------------------------------------------------

  async create(user: AuthUser, input: unknown): Promise<ChallengeRecord> {
    await this.requireEnabled();
    if (!user.permissions.has(PERMISSIONS.GOALS_WRITE)) {
      throw new ForbiddenError();
    }
    const parsed = challengeCreateSchema.parse(input);
    if (
      parsed.format !== "simple" &&
      parsed.format !== "bingo" &&
      parsed.format !== "quest"
    ) {
      throw new ValidationError("Unknown challenge format");
    }
    if (parsed.format === "simple") {
      this.requireSimple(parsed.objectives);
    }
    const startsAt = new Date(parsed.startsAt);
    const endsAt = new Date(parsed.endsAt);
    if (!Number.isFinite(+startsAt) || !Number.isFinite(+endsAt)) {
      throw new ValidationError("Challenge dates are invalid");
    }
    if (endsAt <= startsAt) {
      throw new ValidationError("Challenge end must be after its start");
    }
    for (const objective of parsed.objectives) {
      this.validateObjective(objective);
    }
    if (parsed.format === "bingo") {
      this.validateBingoBoardInput(parsed.board!);
    }
    if (parsed.format === "quest") {
      this.validateQuestGraphInput(parsed.quest!);
    }

    const clubId: string | null = parsed.clubId ?? null;
    // Club challenges always constrain participation to the club.
    const joinPolicy = clubId ? ("club_members" as const) : parsed.joinPolicy;
    if (clubId) {
      await this.requireClubCreateAccess(user, clubId);
    } else if (joinPolicy === "club_members") {
      throw new ValidationError(
        "club_members join policy requires a club challenge",
      );
    }

    const id = generateId();
    await this.db.insert(schema.challenges).values({
      id,
      title: parsed.title,
      description: parsed.description ?? null,
      format: parsed.format,
      creatorUserId: user.id,
      clubId,
      visibility: clubId ? parsed.visibility : parsed.visibility,
      joinPolicy,
      state: "draft",
      startsAt,
      endsAt,
    });
    if (parsed.format === "bingo") {
      await this.insertBingoBoard(id, parsed.board!);
    } else if (parsed.format === "quest") {
      await this.insertQuestGraph(id, parsed.quest!);
    } else {
      let sortOrder = 0;
      for (const objective of parsed.objectives) {
        await this.db.insert(schema.challengeObjectives).values({
          id: generateId(),
          challengeId: id,
          metric: objective.metric,
          aggregation: objective.aggregation as Record<string, unknown>,
          target: objective.target,
          activity: objective.activity,
          basis: objective.basis,
          domains: objective.domains,
          rule: (objective.rule ?? null) as Record<string, unknown> | null,
          sortOrder: sortOrder++,
        });
      }
    }

    if (parsed.achievement && this.achievements) {
      try {
        await this.achievements.defineAchievement(user, {
          key: COMPLETION_ACHIEVEMENT_KEY,
          name: parsed.achievement.name,
          description: parsed.achievement.description ?? null,
          icon: parsed.achievement.icon ?? null,
          source: { type: "challenge", id },
        });
      } catch (error) {
        if (error instanceof ForbiddenError) throw error;
        // Guard misconfiguration should not fail challenge creation; the
        // challenge remains meaningful without an achievement.
      }
    }

    const created = await this.getChallenge(id);
    if (this.activity) {
      await this.activity.record(user.id, CHALLENGE_EVENT_TYPES.CREATED, {
        subjectType: "challenge",
        subjectId: id,
        payload: { challengeId: id, title: parsed.title, clubId },
      });
    }
    if (this.events) {
      await this.events.publish(
        CHALLENGE_EVENT_TYPES.CREATED,
        { challengeId: id, title: parsed.title, clubId },
        { actorUserId: user.id },
      );
    }
    const record = this.toPublic(created, await this.listObjectives(id), 0);
    record.hasCompletionAchievement = await this.hasCompletionAchievement(id);
    await this.attachBoard(created, record);
    await this.attachQuest(created, record);
    return record;
  }

  // ------------------------------------------------------------------
  // Bingo board writes (service-layer validation for the Bingo format)
  // ------------------------------------------------------------------

  private validateBingoBoardInput(board: BingoBoardInput) {
    if (!isBingoStyleKey(board.styleKey)) {
      throw new ValidationError(
        `Unknown bingo board style "${board.styleKey}"`,
      );
    }
    for (const square of board.squares) {
      if (!square.freeSpace && square.objective) {
        this.validateObjective(square.objective);
      }
    }
  }

  /**
   * Persist a Bingo board: one challenge_objectives row per normal square
   * (sortOrder mirrors position), one board row, and one square row per
   * cell referencing its objective. Free spaces reference nothing.
   */
  private async insertBingoBoard(challengeId: string, board: BingoBoardInput) {
    const boardId = generateId();
    await this.db.insert(schema.bingoBoards).values({
      id: boardId,
      challengeId,
      size: board.size,
      victory: board.victory,
      victoryLines: board.victoryLines ?? null,
      styleKey: board.styleKey,
      presentation: (board.presentation ?? null) as Record<
        string,
        unknown
      > | null,
    });
    for (const square of board.squares) {
      let objectiveId: string | null = null;
      if (!square.freeSpace && square.objective) {
        objectiveId = generateId();
        await this.db.insert(schema.challengeObjectives).values({
          id: objectiveId,
          challengeId,
          metric: square.objective.metric,
          aggregation: square.objective.aggregation as Record<string, unknown>,
          target: square.objective.target,
          activity: square.objective.activity,
          basis: square.objective.basis,
          domains: square.objective.domains,
          rule: (square.objective.rule ?? null) as Record<
            string,
            unknown
          > | null,
          sortOrder: square.position,
        });
      }
      await this.db.insert(schema.bingoSquares).values({
        id: generateId(),
        boardId,
        position: square.position,
        objectiveId,
        freeSpace: square.freeSpace,
        label: square.label,
      });
    }
  }

  private async replaceBingoBoard(challengeId: string, board: BingoBoardInput) {
    const existing = await this.db.query.bingoBoards.findFirst({
      where: eq(schema.bingoBoards.challengeId, challengeId),
    });
    if (existing) {
      await this.db
        .delete(schema.bingoSquares)
        .where(eq(schema.bingoSquares.boardId, existing.id));
      await this.db
        .delete(schema.bingoBoards)
        .where(eq(schema.bingoBoards.id, existing.id));
    }
    await this.db
      .delete(schema.challengeObjectives)
      .where(eq(schema.challengeObjectives.challengeId, challengeId));
    await this.insertBingoBoard(challengeId, board);
  }

  // ------------------------------------------------------------------
  // Quest graph writes (service-layer validation for the Quest format)
  // ------------------------------------------------------------------

  private validateQuestGraphInput(graph: QuestGraphInput) {
    if (!isQuestStyleKey(graph.styleKey)) {
      throw new ValidationError(
        `Unknown quest map style "${graph.styleKey}"`,
      );
    }
    for (const node of graph.nodes) {
      if (node.kind === "objective" && node.objective) {
        this.validateObjective(node.objective);
      }
    }
  }

  /**
   * Persist a Quest graph: one challenge_objectives row per objective
   * node, one graph row, one node row per node referencing its
   * objective, and one edge row per prerequisite relationship.
   * Position is stored verbatim — it never affects progression.
   */
  private async insertQuestGraph(challengeId: string, graph: QuestGraphInput) {
    const graphId = generateId();
    await this.db.insert(schema.questGraphs).values({
      id: graphId,
      challengeId,
      styleKey: graph.styleKey,
      presentation: (graph.presentation ?? null) as Record<
        string,
        unknown
      > | null,
    });
    const objectiveIds = new Map<string, string | null>();
    let sortOrder = 0;
    for (const node of graph.nodes) {
      let objectiveId: string | null = null;
      if (node.kind === "objective" && node.objective) {
        objectiveId = generateId();
        await this.db.insert(schema.challengeObjectives).values({
          id: objectiveId,
          challengeId,
          metric: node.objective.metric,
          aggregation: node.objective.aggregation as Record<string, unknown>,
          target: node.objective.target,
          activity: node.objective.activity,
          basis: node.objective.basis,
          domains: node.objective.domains,
          rule: (node.objective.rule ?? null) as Record<
            string,
            unknown
          > | null,
          sortOrder: sortOrder++,
        });
      }
      objectiveIds.set(node.key, objectiveId);
    }
    const nodeIds = new Map<string, string>();
    for (const node of graph.nodes) {
      const nodeId = generateId();
      nodeIds.set(node.key, nodeId);
      await this.db.insert(schema.questNodes).values({
        id: nodeId,
        graphId,
        key: node.key,
        kind: node.kind,
        label: node.label,
        optional: node.optional,
        join: node.join,
        posX: node.position.x,
        posY: node.position.y,
        objectiveId: objectiveIds.get(node.key) ?? null,
      });
    }
    for (const edge of graph.edges) {
      const fromNodeId = nodeIds.get(edge.from);
      const toNodeId = nodeIds.get(edge.to);
      if (!fromNodeId || !toNodeId) {
        throw new ValidationError(
          "Quest edges must reference nodes in this graph",
        );
      }
      await this.db.insert(schema.questEdges).values({
        id: generateId(),
        graphId,
        fromNodeId,
        toNodeId,
      });
    }
  }

  private async replaceQuestGraph(challengeId: string, graph: QuestGraphInput) {
    const existing = await this.db.query.questGraphs.findFirst({
      where: eq(schema.questGraphs.challengeId, challengeId),
    });
    if (existing) {
      // Deleting the graph cascades its nodes and edges.
      await this.db
        .delete(schema.questGraphs)
        .where(eq(schema.questGraphs.id, existing.id));
    }
    await this.db
      .delete(schema.challengeObjectives)
      .where(eq(schema.challengeObjectives.challengeId, challengeId));
    await this.insertQuestGraph(challengeId, graph);
  }

  async update(
    user: AuthUser,
    id: string,
    input: unknown,
  ): Promise<ChallengeRecord> {
    await this.requireEnabled();
    const { challengeUpdateSchema } =
      await import("../../../shared/challenges.js");
    const parsed = challengeUpdateSchema.parse(input);
    const challenge = await this.getChallenge(id);
    if (!(await this.canManage(user, challenge))) throw new ForbiddenError();
    const effective = this.effective(challenge);
    const locked =
      effective === "active" ||
      effective === "completed" ||
      effective === "ended" ||
      effective === "cancelled";

    if (
      locked &&
      (parsed.objectives !== undefined ||
        parsed.board !== undefined ||
        parsed.quest !== undefined ||
        parsed.startsAt !== undefined)
    ) {
      throw new ForbiddenError(
        "Objectives, board, quest graph, and start date are locked once a challenge is active",
      );
    }
    const isBingo = challenge.format === "bingo";
    const isQuest = challenge.format === "quest";
    if (isBingo && parsed.objectives !== undefined) {
      throw new ValidationError("Bingo squares are edited via board");
    }
    if (isQuest && parsed.objectives !== undefined) {
      throw new ValidationError("Quest nodes are edited via quest");
    }
    if (!isBingo && parsed.board !== undefined) {
      throw new ValidationError("Only Bingo challenges have a board");
    }
    if (!isQuest && parsed.quest !== undefined) {
      throw new ValidationError("Only Quest challenges have a quest");
    }
    if (parsed.objectives !== undefined) {
      this.requireSimple(parsed.objectives);
      for (const objective of parsed.objectives) {
        this.validateObjective(objective);
      }
    }
    if (parsed.board !== undefined) {
      if (!isBingo || !parsed.board) {
        throw new ValidationError("Only Bingo challenges have a board");
      }
      this.validateBingoBoardInput(parsed.board);
    }
    if (parsed.quest !== undefined) {
      if (!isQuest || !parsed.quest) {
        throw new ValidationError("Only Quest challenges have a quest");
      }
      this.validateQuestGraphInput(parsed.quest);
    }

    let nextEndsAt = challenge.endsAt;
    if (parsed.endsAt !== undefined) {
      const endsAt = new Date(parsed.endsAt);
      if (!Number.isFinite(+endsAt)) {
        throw new ValidationError("Challenge end date is invalid");
      }
      if (locked && endsAt < challenge.endsAt) {
        throw new ValidationError(
          "Active challenges cannot shorten their evaluation period",
        );
      }
      if (
        endsAt <= new Date(parsed.startsAt ?? challenge.startsAt.toISOString())
      ) {
        throw new ValidationError("Challenge end must be after its start");
      }
      nextEndsAt = endsAt;
    }
    let nextStartsAt = challenge.startsAt;
    if (parsed.startsAt !== undefined) {
      const startsAt = new Date(parsed.startsAt);
      if (!Number.isFinite(+startsAt)) {
        throw new ValidationError("Challenge start date is invalid");
      }
      if (startsAt >= nextEndsAt) {
        throw new ValidationError("Challenge end must be after its start");
      }
      nextStartsAt = startsAt;
    }

    if (parsed.state !== undefined) {
      this.assertTransition(challenge.state as ChallengeState, parsed.state);
    }

    await this.db
      .update(schema.challenges)
      .set({
        title: parsed.title ?? challenge.title,
        description:
          parsed.description === undefined
            ? challenge.description
            : parsed.description,
        visibility: (parsed.visibility ??
          challenge.visibility) as ChallengeRecord["visibility"],
        joinPolicy: (parsed.joinPolicy ??
          challenge.joinPolicy) as ChallengeRecord["joinPolicy"],
        state: (parsed.state ?? challenge.state) as ChallengeState,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.challenges.id, id));

    if (parsed.board !== undefined && isBingo && parsed.board) {
      await this.replaceBingoBoard(id, parsed.board);
    }

    if (parsed.quest !== undefined && isQuest && parsed.quest) {
      await this.replaceQuestGraph(id, parsed.quest);
    }

    if (parsed.objectives !== undefined) {
      await this.db
        .delete(schema.challengeObjectives)
        .where(eq(schema.challengeObjectives.challengeId, id));
      let sortOrder = 0;
      for (const objective of parsed.objectives) {
        await this.db.insert(schema.challengeObjectives).values({
          id: generateId(),
          challengeId: id,
          metric: objective.metric,
          aggregation: objective.aggregation as Record<string, unknown>,
          target: objective.target,
          activity: objective.activity,
          basis: objective.basis,
          domains: objective.domains,
          rule: (objective.rule ?? null) as Record<string, unknown> | null,
          sortOrder: sortOrder++,
        });
      }
    }

    const updated = await this.getChallenge(id);
    if (this.achievements && parsed.title !== undefined) {
      try {
        await this.achievements.setSourceLabel("challenge", id, updated.title);
      } catch {
        // Label sync is best-effort; grants keep their own snapshot.
      }
    }
    if (parsed.state === "cancelled" && this.activity) {
      await this.activity.record(user.id, CHALLENGE_EVENT_TYPES.CANCELLED, {
        subjectType: "challenge",
        subjectId: id,
        payload: { challengeId: id, title: updated.title },
      });
      if (this.events) {
        await this.events.publish(
          CHALLENGE_EVENT_TYPES.CANCELLED,
          { challengeId: id, title: updated.title },
          { actorUserId: user.id },
        );
      }
    }
    if (parsed.state === "completed" || parsed.state === "ended") {
      const type =
        parsed.state === "completed"
          ? CHALLENGE_EVENT_TYPES.ENDED
          : CHALLENGE_EVENT_TYPES.ENDED;
      if (this.activity) {
        await this.activity.record(user.id, type, {
          subjectType: "challenge",
          subjectId: id,
          payload: { challengeId: id, title: updated.title },
        });
      }
      if (this.events) {
        await this.events.publish(
          type,
          { challengeId: id, title: updated.title },
          { actorUserId: user.id },
        );
      }
    }
    const record = this.toPublic(
      updated,
      await this.listObjectives(id),
      await this.countParticipants(id),
    );
    record.hasCompletionAchievement = await this.hasCompletionAchievement(id);
    await this.attachBoard(updated, record);
    await this.attachQuest(updated, record);
    return record;
  }

  private assertTransition(from: ChallengeState, to: ChallengeState) {
    if (from === to) return;
    const allowed: Record<ChallengeState, ChallengeState[]> = {
      draft: ["upcoming", "active", "cancelled"],
      upcoming: ["active", "cancelled", "draft"],
      active: ["completed", "ended", "cancelled"],
      completed: [],
      ended: [],
      cancelled: [],
    };
    if (!allowed[from].includes(to)) {
      throw new ValidationError(`Cannot move challenge from ${from} to ${to}`);
    }
  }

  async remove(user: AuthUser, id: string): Promise<boolean> {
    await this.requireEnabled();
    const challenge = await this.getChallenge(id);
    if (!(await this.canManage(user, challenge))) throw new ForbiddenError();
    if (challenge.state !== "draft") {
      throw new ValidationError(
        "Only draft challenges can be deleted; cancel instead",
      );
    }
    if (this.achievements) {
      try {
        await this.achievements.archiveDefinitionsForSource("challenge", id);
      } catch {
        // Best-effort; deletion still proceeds.
      }
    }
    await this.db.delete(schema.challenges).where(eq(schema.challenges.id, id));
    return true;
  }

  // ------------------------------------------------------------------
  // Participation
  // ------------------------------------------------------------------

  async join(user: AuthUser, id: string): Promise<ChallengeParticipantView> {
    await this.requireEnabled();
    const challenge = await this.getChallenge(id);
    if (!(await this.canJoin(user, challenge))) throw new ForbiddenError();
    const existing = await this.db.query.challengeParticipants.findFirst({
      where: and(
        eq(schema.challengeParticipants.challengeId, id),
        eq(schema.challengeParticipants.userId, user.id),
      ),
    });
    if (existing && existing.state !== "left") {
      return {
        userId: user.id,
        state: existing.state as ChallengeParticipantView["state"],
        joinedAt: existing.joinedAt.toISOString(),
        completedAt: existing.completedAt
          ? existing.completedAt.toISOString()
          : null,
        progress: null,
      };
    }
    if (existing) {
      // Rejoining reactivates the row but preserves the original joinedAt:
      // participation history stays authoritative and rejoining never
      // manufactures a fresh challenge period (the evaluation window is
      // always the challenge's own [startsAt, endsAt)).
      await this.db
        .update(schema.challengeParticipants)
        .set({ state: "joined", leftAt: null })
        .where(
          and(
            eq(schema.challengeParticipants.challengeId, id),
            eq(schema.challengeParticipants.userId, user.id),
          ),
        );
    } else {
      await this.db.insert(schema.challengeParticipants).values({
        challengeId: id,
        userId: user.id,
        state: "joined",
      });
    }
    // Joining never moves the challenge's evaluation period.
    if (this.activity) {
      await this.activity.record(user.id, CHALLENGE_EVENT_TYPES.JOINED, {
        subjectType: "challenge",
        subjectId: id,
        payload: { challengeId: id, title: challenge.title },
      });
    }
    if (this.events) {
      await this.events.publish(
        CHALLENGE_EVENT_TYPES.JOINED,
        { challengeId: id, userId: user.id, title: challenge.title },
        { actorUserId: user.id },
      );
    }
    const row = await this.db.query.challengeParticipants.findFirst({
      where: and(
        eq(schema.challengeParticipants.challengeId, id),
        eq(schema.challengeParticipants.userId, user.id),
      ),
    });
    return {
      userId: user.id,
      state: "joined",
      joinedAt: (row?.joinedAt ?? new Date()).toISOString(),
      completedAt: null,
      progress: null,
    };
  }

  async leave(user: AuthUser, id: string): Promise<boolean> {
    await this.requireEnabled();
    const challenge = await this.getChallenge(id);
    await this.requireView(user, challenge.id);
    void challenge;
    const existing = await this.db.query.challengeParticipants.findFirst({
      where: and(
        eq(schema.challengeParticipants.challengeId, id),
        eq(schema.challengeParticipants.userId, user.id),
      ),
    });
    if (!existing || existing.state === "left") return true;
    if (existing.state === "completed") {
      throw new ValidationError("Completed participation cannot be left");
    }
    await this.db
      .update(schema.challengeParticipants)
      .set({ state: "left", leftAt: new Date() })
      .where(
        and(
          eq(schema.challengeParticipants.challengeId, id),
          eq(schema.challengeParticipants.userId, user.id),
        ),
      );
    if (this.activity) {
      await this.activity.record(user.id, CHALLENGE_EVENT_TYPES.LEFT, {
        subjectType: "challenge",
        subjectId: id,
        payload: { challengeId: id },
      });
    }
    if (this.events) {
      await this.events.publish(
        CHALLENGE_EVENT_TYPES.LEFT,
        { challengeId: id, userId: user.id },
        { actorUserId: user.id },
      );
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Invites (1.3): creators invite users; invite-only gains accept/decline
  // ------------------------------------------------------------------

  private toInvite(
    row: typeof schema.challengeInvites.$inferSelect,
    challenge?: ChallengeRecord | null,
    inviter?: { username: string | null; displayName: string | null } | null,
    invitee?: { username: string | null; displayName: string | null } | null,
  ): ChallengeInvite {
    return {
      id: row.id,
      challengeId: row.challengeId,
      inviterUserId: row.inviterUserId,
      inviterUsername: inviter?.username ?? null,
      inviterDisplayName: inviter?.displayName ?? null,
      inviteeUserId: row.inviteeUserId,
      inviteeUsername: invitee?.username ?? null,
      inviteeDisplayName: invitee?.displayName ?? null,
      state: row.state as ChallengeInviteState,
      createdAt: row.createdAt.toISOString(),
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      challenge: challenge ?? null,
    };
  }

  /**
   * Invite a user to a challenge. Managers only. Any challenge can carry
   * invites; invite-only challenges additionally require one to join.
   * Re-inviting a declined invite returns it to pending.
   */
  async invite(
    manager: AuthUser,
    id: string,
    inviteeUserId: string,
  ): Promise<ChallengeInvite> {
    await this.requireEnabled();
    const challenge = await this.getChallenge(id);
    if (!(await this.canManage(manager, challenge))) {
      throw new ForbiddenError();
    }
    if (inviteeUserId === manager.id) {
      throw new ValidationError("You cannot invite yourself");
    }
    const invitee = await this.db.query.users.findFirst({
      where: eq(schema.users.id, inviteeUserId),
    });
    if (!invitee) throw new NotFoundError("User not found");
    const existing = await this.getInvite(id, inviteeUserId);
    let row: typeof schema.challengeInvites.$inferSelect;
    if (existing) {
      if (existing.state === "pending") {
        row = existing;
      } else {
        await this.db
          .update(schema.challengeInvites)
          .set({ state: "pending", respondedAt: null })
          .where(eq(schema.challengeInvites.id, existing.id));
        row = { ...existing, state: "pending", respondedAt: null };
      }
    } else {
      const created = {
        id: generateId(),
        challengeId: id,
        inviterUserId: manager.id,
        inviteeUserId,
        state: "pending",
      };
      await this.db.insert(schema.challengeInvites).values(created);
      row = await this.db.query.challengeInvites.findFirst({
        where: eq(schema.challengeInvites.id, created.id),
      }).then((found) => {
        if (!found) throw new NotFoundError("Invite not found");
        return found;
      });
    }
    if (this.events) {
      await this.events.publish(
        CHALLENGE_EVENT_TYPES.INVITED,
        {
          inviteId: row.id,
          challengeId: id,
          title: challenge.title,
          clubId: challenge.clubId,
          inviterUserId: manager.id,
          inviteeUserId,
        },
        { actorUserId: manager.id },
      );
    }
    return this.toInvite(row);
  }

  /** Invites for one challenge. Managers only (invitee identities stay private). */
  async listChallengeInvites(
    viewer: AuthUser,
    id: string,
  ): Promise<ChallengeInvite[]> {
    const challenge = await this.getChallenge(id);
    if (!(await this.canManage(viewer, challenge))) {
      throw new ForbiddenError();
    }
    const rows = await this.db
      .select({
        invite: schema.challengeInvites,
        username: schema.users.username,
        displayName: schema.users.displayName,
      })
      .from(schema.challengeInvites)
      .innerJoin(
        schema.users,
        eq(schema.challengeInvites.inviteeUserId, schema.users.id),
      )
      .where(eq(schema.challengeInvites.challengeId, id));
    return rows.map((row) =>
      this.toInvite(row.invite, null, null, {
        username: row.username,
        displayName: row.displayName,
      }),
    );
  }

  /** Pending invites for the viewer, each with its challenge record. */
  async listMyInvites(viewer: AuthUser): Promise<ChallengeInvite[]> {
    await this.requireEnabled();
    const rows = await this.db
      .select()
      .from(schema.challengeInvites)
      .where(
        and(
          eq(schema.challengeInvites.inviteeUserId, viewer.id),
          eq(schema.challengeInvites.state, "pending"),
        ),
      );
    const invites: ChallengeInvite[] = [];
    for (const row of rows) {
      const challenge = await this.db.query.challenges.findFirst({
        where: eq(schema.challenges.id, row.challengeId),
      });
      if (!challenge) continue;
      const record = this.toPublic(
        challenge,
        await this.listObjectives(challenge.id),
      );
      await this.attachBoard(challenge, record);
      await this.attachQuest(challenge, record);
      const inviter = await this.db.query.users.findFirst({
        where: eq(schema.users.id, row.inviterUserId),
      });
      invites.push(
        this.toInvite(
          row,
          record,
          inviter
            ? {
                username: inviter.username,
                displayName: inviter.displayName,
              }
            : null,
        ),
      );
    }
    return invites.sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  }

  /** Pending invite challenge ids for hub bucketing. */
  async listMyPendingInviteChallengeIds(viewer: AuthUser): Promise<string[]> {
    await this.requireEnabled();
    const rows = await this.db
      .select({ challengeId: schema.challengeInvites.challengeId })
      .from(schema.challengeInvites)
      .where(
        and(
          eq(schema.challengeInvites.inviteeUserId, viewer.id),
          eq(schema.challengeInvites.state, "pending"),
        ),
      );
    return rows.map((row) => row.challengeId);
  }

  /**
   * Accept or decline a pending invite. Accepting marks the invite and
   * joins the challenge through the normal join path (eligibility
   * included); declining only records the response.
   */
  async respondToInvite(
    viewer: AuthUser,
    inviteId: string,
    accept: boolean,
  ): Promise<ChallengeInvite> {
    await this.requireEnabled();
    const row = await this.db.query.challengeInvites.findFirst({
      where: eq(schema.challengeInvites.id, inviteId),
    });
    if (!row || row.inviteeUserId !== viewer.id) {
      throw new NotFoundError("Invite not found");
    }
    if (row.state !== "pending") {
      return this.toInvite(row);
    }
    const state = accept ? "accepted" : "declined";
    await this.db
      .update(schema.challengeInvites)
      .set({ state, respondedAt: new Date() })
      .where(eq(schema.challengeInvites.id, inviteId));
    if (accept) {
      // Joining through the invite keeps eligibility rules authoritative.
      await this.join(viewer, row.challengeId);
    }
    const updated = await this.db.query.challengeInvites.findFirst({
      where: eq(schema.challengeInvites.id, inviteId),
    });
    if (!updated) throw new NotFoundError("Invite not found");
    return this.toInvite(updated);
  }

  async listParticipants(
    viewer: AuthUser,
    id: string,
  ): Promise<ChallengeParticipantView[]> {
    const challenge = await this.requireView(viewer, id);
    const rows = await this.db
      .select({
        participant: schema.challengeParticipants,
        username: schema.users.username,
        displayName: schema.users.displayName,
      })
      .from(schema.challengeParticipants)
      .innerJoin(
        schema.users,
        eq(schema.challengeParticipants.userId, schema.users.id),
      )
      .where(eq(schema.challengeParticipants.challengeId, id));
    const manager = await this.canManage(viewer, challenge);
    const views: ChallengeParticipantView[] = [];
    for (const row of rows) {
      const p: ParticipantRow = row.participant;
      if (p.state === "left" && !manager && p.userId !== viewer.id) continue;
      views.push({
        userId: p.userId,
        username: row.username,
        displayName: row.displayName,
        state: p.state as ChallengeParticipantView["state"],
        joinedAt: p.joinedAt.toISOString(),
        completedAt: p.completedAt ? p.completedAt.toISOString() : null,
        progress: null,
      });
    }
    return views;
  }

  /**
   * Social participant summaries: per-format progress (7/12, lines,
   * nodes) plus completion state — never the counted library items.
   * Evaluating one view per participant is O(participants × objectives);
   * fine for challenge scale, and candidates stay gated to
   * self-or-manager.
   */
  async summarizeParticipant(
    challenge: ChallengeRow,
    userId: string,
  ): Promise<ChallengeSocialSummary | null> {
    const participation = await this.getParticipation(
      challenge.id,
      userId,
    );
    if (!participation) return null;
    if (challenge.format === "bingo") {
      const view = await this.evaluateBingoView(challenge, userId);
      return bingoSocialSummary(view);
    }
    if (challenge.format === "quest") {
      const view = await this.evaluateQuestView(challenge, userId);
      return questSocialSummary(view);
    }
    const objectives = await this.listObjectives(challenge.id);
    if (objectives.length !== 1) return null;
    const progress = await this.evaluateSimpleProgress(
      challenge,
      objectives,
      userId,
    );
    return simpleSocialSummary(progress);
  }

  async listParticipantSummaries(
    viewer: AuthUser,
    id: string,
  ): Promise<ChallengeParticipantSummary[]> {
    const challenge = await this.requireView(viewer, id);
    const participants = await this.listParticipants(viewer, id);
    const summaries: ChallengeParticipantSummary[] = [];
    for (const participant of participants) {
      summaries.push({
        ...participant,
        summary: await this.summarizeParticipant(
          challenge,
          participant.userId,
        ),
      });
    }
    return summaries;
  }

  // ------------------------------------------------------------------
  // Evaluation — Goals registry, challenge time boundary
  // ------------------------------------------------------------------

  private goalLikeForObjective(
    objective: ChallengeObjective,
  ): Pick<
    GoalRecord,
    | "domains"
    | "startsAt"
    | "endsAt"
    | "rule"
    | "target"
    | "metric"
    | "aggregation"
  > {
    return {
      domains: objective.domains,
      startsAt: null,
      endsAt: null,
      rule: (objective.rule ?? null) as GoalRecord["rule"],
      target: objective.target,
      metric: objective.metric as GoalRecord["metric"],
      aggregation: objective.aggregation as GoalRecord["aggregation"],
    };
  }

  private async listCandidatesForObjective(
    userId: string,
    objective: ChallengeObjective,
    period: { startsAt: string; endsAt: string },
  ): Promise<GoalCandidate[]> {
    const metric = getGoalMetricDefinition(objective.metric);
    if (!metric || !metric.supportedActivities.includes(objective.basis)) {
      return [];
    }
    const providers = this.providers.filter(
      (provider) =>
        provider.activities.includes(objective.basis) &&
        (objective.domains.length === 0 ||
          objective.domains.includes("global") ||
          provider.domains.some((domain) =>
            objective.domains.includes(domain),
          )),
    );
    const batches = await Promise.all(
      providers.map((provider) => provider.getCandidates({ userId, period })),
    );
    return batches.flat();
  }

  /**
   * Format-agnostic core: progress per objective within the challenge's
   * own effective period. Historical Goal progress never leaks in because
   * every candidate is filtered to [startsAt, endsAt).
   */
  async evaluateObjectives(
    challenge: ChallengeRow,
    objectives: ChallengeObjective[],
    userId: string,
  ): Promise<Array<{ objectiveId: string; progress: GoalProgress }>> {
    const period = {
      startsAt: challenge.startsAt.toISOString(),
      endsAt: challenge.endsAt.toISOString(),
    };
    const results: Array<{ objectiveId: string; progress: GoalProgress }> = [];
    for (const objective of objectives) {
      const candidates = await this.listCandidatesForObjective(
        userId,
        objective,
        period,
      );
      const goalLike = this.goalLikeForObjective(objective);
      const eligible = candidates.filter(
        (candidate) =>
          evaluateCandidate(
            {
              domains: goalLike.domains,
              startsAt: period.startsAt,
              endsAt: period.endsAt,
              rule: goalLike.rule,
            },
            candidate,
          ).eligible,
      );
      const progress = aggregateGoalCandidates(
        {
          target: goalLike.target,
          metric: goalLike.metric,
          aggregation: goalLike.aggregation,
        },
        eligible,
      );
      results.push({ objectiveId: objective.id, progress });
    }
    return results;
  }

  /** Simple-format progress: the single objective's progress. */
  async evaluateSimpleProgress(
    challenge: ChallengeRow,
    objectives: ChallengeObjective[],
    userId: string,
  ): Promise<GoalProgress> {
    this.requireSimple(objectives);
    const [result] = await this.evaluateObjectives(
      challenge,
      objectives,
      userId,
    );
    if (!result) throw new NotFoundError("Challenge objective not found");
    return result.progress;
  }

  async listEvaluatedCandidates(
    viewer: AuthUser,
    id: string,
    userId?: string,
    objectiveId?: string,
  ) {
    const challenge = await this.requireView(viewer, id);
    const targetUserId = userId ?? viewer.id;
    if (
      targetUserId !== viewer.id &&
      !(await this.canManage(viewer, challenge))
    ) {
      throw new ForbiddenError();
    }
    const period = {
      startsAt: challenge.startsAt.toISOString(),
      endsAt: challenge.endsAt.toISOString(),
    };
    let objective: ChallengeObjective;
    if (challenge.format === "bingo") {
      // Square drill-down: which item(s) counted toward this square.
      if (!objectiveId) {
        throw new ValidationError(
          "Bingo square detail requires an objectiveId",
        );
      }
      const board = await this.getBoardConfig(id);
      const square = board?.squares.find(
        (entry) => entry.objectiveId === objectiveId,
      );
      if (!square || !square.objective) {
        throw new NotFoundError("Bingo square not found");
      }
      objective = square.objective;
    } else if (challenge.format === "quest") {
      // Node drill-down: which item(s) counted toward this node.
      if (!objectiveId) {
        throw new ValidationError(
          "Quest node detail requires an objectiveId",
        );
      }
      const graph = await this.getQuestConfig(id);
      const node = graph?.nodes.find(
        (entry) => entry.objectiveId === objectiveId,
      );
      if (!node || !node.objective) {
        throw new NotFoundError("Quest node not found");
      }
      objective = node.objective;
    } else {
      const objectives = await this.listObjectives(id);
      this.requireSimple(objectives);
      objective = objectives[0]!;
      if (objectiveId && objectiveId !== objective.id) {
        throw new NotFoundError("Challenge objective not found");
      }
    }
    const candidates = await this.listCandidatesForObjective(
      targetUserId,
      objective,
      period,
    );
    return candidates.map((candidate) => ({
      workType: candidate.workType,
      workId: candidate.workId,
      title: String(candidate.attributes.title ?? "Untitled work"),
      occurredAt: new Date(candidate.occurredAt).toISOString(),
      evaluation: evaluateCandidate(
        {
          domains: objective.domains,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          rule: (objective.rule ?? null) as GoalRecord["rule"],
        },
        candidate,
      ),
    }));
  }

  // ------------------------------------------------------------------
  // Bingo evaluation: objective → square → board → victory → completion
  // ------------------------------------------------------------------

  /**
   * Evaluate every square of the shared board for one participant within
   * the challenge's own period. Square completion is automatic from
   * library activity — participants never check squares off manually.
   */
  async evaluateBingoView(
    challenge: ChallengeRow,
    userId: string,
  ): Promise<BingoBoardView> {
    const board = await this.getBoardConfig(challenge.id);
    if (!board) throw new NotFoundError("Bingo board not found");
    const objectives = await this.listObjectives(challenge.id);
    const evaluations = await this.evaluateObjectives(
      challenge,
      objectives,
      userId,
    );
    const progressByObjective = new Map(
      evaluations.map((entry) => [entry.objectiveId, entry.progress]),
    );
    const completed: boolean[] = new Array(board.size * board.size).fill(false);
    const squares = board.squares.map((square) => {
      if (square.freeSpace) {
        completed[square.position] = true;
        return { ...square, progress: null, state: "free" as BingoSquareState };
      }
      const progress = square.objectiveId
        ? (progressByObjective.get(square.objectiveId) ?? null)
        : null;
      const done = progress?.completed === true;
      completed[square.position] = done;
      const state: BingoSquareState = done
        ? "completed"
        : (progress?.current ?? 0) > 0
          ? "progressing"
          : "locked";
      return { ...square, progress, state };
    });
    const outcome = evaluateBingoOutcome({
      size: board.size,
      victory: board.victory,
      victoryLines: board.victoryLines,
      completed,
    });
    const squaresCompleted = squares.filter(
      (square) => square.state === "completed" || square.state === "free",
    ).length;
    return {
      ...board,
      squares,
      completedLines: outcome.completedLines,
      linesCompleted: outcome.linesCompleted,
      squaresCompleted,
      squaresTotal: board.size * board.size,
      won: outcome.won,
    };
  }

  // ------------------------------------------------------------------
  // Quest evaluation: objective → node → graph reachability → completion
  // ------------------------------------------------------------------

  /**
   * Evaluate every node of the shared graph for one participant within
   * the challenge's own period. Node completion is automatic from
   * library activity — participants never check nodes off manually.
   * Optional side nodes unlock and complete like normal nodes but never
   * gate Finish (enforced at creation: they only point at other
   * optional nodes).
   */
  async evaluateQuestView(
    challenge: ChallengeRow,
    userId: string,
  ): Promise<QuestGraphView> {
    const graph = await this.getQuestConfig(challenge.id);
    if (!graph) throw new NotFoundError("Quest graph not found");
    const objectives = await this.listObjectives(challenge.id);
    const evaluations = await this.evaluateObjectives(
      challenge,
      objectives,
      userId,
    );
    const progressByObjective = new Map(
      evaluations.map((entry) => [entry.objectiveId, entry.progress]),
    );
    const progressByKey = new Map<string, GoalProgress | null>();
    const objectiveCompleted: Record<string, boolean> = {};
    const objectiveStarted: Record<string, boolean> = {};
    for (const node of graph.nodes) {
      if (node.kind !== "objective" || !node.objectiveId) continue;
      const progress = progressByObjective.get(node.objectiveId) ?? null;
      progressByKey.set(node.key, progress);
      objectiveCompleted[node.key] = progress?.completed === true;
      objectiveStarted[node.key] = (progress?.current ?? 0) > 0;
    }
    const outcome = evaluateQuestOutcome({
      nodes: graph.nodes.map((node) => ({
        key: node.key,
        kind: node.kind,
        join: node.join,
      })),
      edges: graph.edges.map((edge) => ({
        from: edge.fromKey,
        to: edge.toKey,
      })),
      objectiveCompleted,
      objectiveStarted,
    });
    const outcomeByKey = new Map(
      outcome.nodes.map((entry) => [entry.key, entry]),
    );
    const nodes = graph.nodes.map((node) => {
      const result = outcomeByKey.get(node.key);
      const progress =
        node.kind === "objective" ? (progressByKey.get(node.key) ?? null) : null;
      let state: QuestNodeState = result?.state ?? "locked";
      if (node.kind === "objective" && progress && !result?.completed) {
        // Keep the Bingo-established progressing distinction for nodes
        // whose gate is open and partial credit exists.
        if (result?.prerequisitesMet && (progress.current ?? 0) > 0) {
          state = "progressing";
        } else if (result?.prerequisitesMet) {
          state = "available";
        } else {
          state = "locked";
        }
      }
      return {
        ...node,
        progress,
        state,
        prerequisitesMet: result?.prerequisitesMet ?? false,
      };
    });
    const required = nodes.filter(
      (node) => node.kind === "objective" && !node.optional,
    );
    const optional = nodes.filter(
      (node) => node.kind === "objective" && node.optional,
    );
    const requiredCompleted = required.filter(
      (node) => node.state === "completed",
    ).length;
    const optionalCompleted = optional.filter(
      (node) => node.state === "completed",
    ).length;
    return {
      ...graph,
      nodes,
      requiredCompleted,
      requiredTotal: required.length,
      optionalCompleted,
      optionalTotal: optional.length,
      won: outcome.won,
    };
  }

  /** Required-nodes progress summary so milestones/completion reuse one path. */
  private questProgress(view: QuestGraphView): GoalProgress {
    const percentage =
      view.requiredTotal <= 0
        ? view.won
          ? 100
          : 0
        : Math.min(
            100,
            Math.round((view.requiredCompleted / view.requiredTotal) * 100),
          );
    return {
      current: view.requiredCompleted,
      target: Math.max(1, view.requiredTotal),
      unit: "nodes",
      percentage,
      completed: view.won,
      qualifyingItems: view.requiredCompleted,
      contributingItems: view.requiredCompleted,
      missingContributionData: 0,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /** Squares-based progress summary so milestones/completion reuse one path. */
  private bingoProgress(view: BingoBoardView): GoalProgress {
    const percentage =
      view.squaresTotal <= 0
        ? 0
        : Math.min(
            100,
            Math.round((view.squaresCompleted / view.squaresTotal) * 100),
          );
    return {
      current: view.squaresCompleted,
      target: view.squaresTotal,
      unit: "squares",
      percentage,
      completed: view.won,
      qualifyingItems: view.squaresCompleted,
      contributingItems: view.squaresCompleted,
      missingContributionData: 0,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluate the viewer's progress and, when the format's victory condition
   * is satisfied, complete the participation and grant the optional
   * achievement exactly once:
   * Simple: objective satisfied → participant completed.
   * Bingo: squares → board → victory → participant completed.
   * Quest: objectives → nodes → graph reachability → participant completed.
   */
  async evaluateViewerProgress(
    viewer: AuthUser,
    id: string,
  ): Promise<{
    progress: GoalProgress;
    participation: ChallengeParticipantView | null;
    bingo?: BingoBoardView | null;
    quest?: QuestGraphView | null;
  }> {
    const challenge = await this.requireView(viewer, id);
    let progress: GoalProgress;
    let bingo: BingoBoardView | null = null;
    let quest: QuestGraphView | null = null;
    if (challenge.format === "bingo") {
      bingo = await this.evaluateBingoView(challenge, viewer.id);
      progress = this.bingoProgress(bingo);
    } else if (challenge.format === "quest") {
      quest = await this.evaluateQuestView(challenge, viewer.id);
      progress = this.questProgress(quest);
    } else {
      const objectives = await this.listObjectives(id);
      progress = await this.evaluateSimpleProgress(
        challenge,
        objectives,
        viewer.id,
      );
    }
    let participation = await this.getParticipation(id, viewer.id);
    if (participation) participation = { ...participation, progress };
    if (progress.completed && participation?.state === "joined") {
      participation = await this.completeParticipation(viewer, challenge);
      participation = { ...participation, progress };
    } else if (progress.completed && participation) {
      participation = { ...participation, progress };
    }
    if (this.activity && progress.current > 0 && participation) {
      await this.recordMilestone(viewer, challenge, progress);
    }
    return { progress, participation, bingo, quest };
  }

  private async recordMilestone(
    viewer: AuthUser,
    challenge: ChallengeRow,
    progress: GoalProgress,
  ) {
    if (!this.activity) return;
    const rows = await this.db
      .select({ payload: schema.activityEvents.payload })
      .from(schema.activityEvents)
      .where(
        and(
          eq(schema.activityEvents.actorUserId, viewer.id),
          eq(schema.activityEvents.type, CHALLENGE_EVENT_TYPES.MILESTONE),
        ),
      );
    const reached = new Set(
      rows
        .map((row) => row.payload)
        .filter((payload): payload is Record<string, unknown> =>
          Boolean(payload),
        )
        .filter((payload) => payload.challengeId === challenge.id)
        .map((payload) => Number(payload.milestone)),
    );
    for (const milestone of [50, 100]) {
      if (progress.percentage < milestone || reached.has(milestone)) continue;
      await this.activity.record(viewer.id, CHALLENGE_EVENT_TYPES.MILESTONE, {
        subjectType: "challenge",
        subjectId: challenge.id,
        payload: {
          challengeId: challenge.id,
          milestone,
          title: challenge.title,
        },
      });
      if (this.events) {
        await this.events.publish(
          CHALLENGE_EVENT_TYPES.MILESTONE,
          { challengeId: challenge.id, userId: viewer.id, milestone },
          { actorUserId: viewer.id },
        );
      }
    }
  }

  private async completeParticipation(
    user: AuthUser,
    challenge: ChallengeRow,
  ): Promise<ChallengeParticipantView> {
    await this.db
      .update(schema.challengeParticipants)
      .set({ state: "completed", completedAt: new Date() })
      .where(
        and(
          eq(schema.challengeParticipants.challengeId, challenge.id),
          eq(schema.challengeParticipants.userId, user.id),
        ),
      );
    if (this.activity) {
      await this.activity.record(user.id, CHALLENGE_EVENT_TYPES.COMPLETED, {
        subjectType: "challenge",
        subjectId: challenge.id,
        payload: { challengeId: challenge.id, title: challenge.title },
      });
    }
    if (this.events) {
      await this.events.publish(
        CHALLENGE_EVENT_TYPES.COMPLETED,
        { challengeId: challenge.id, userId: user.id, title: challenge.title },
        { actorUserId: user.id },
      );
    }
    if (this.achievements) {
      try {
        await this.achievements.grantAchievement({
          source: { type: "challenge", id: challenge.id },
          definitionKey: COMPLETION_ACHIEVEMENT_KEY,
          recipientId: user.id,
          reason: {
            type: "challenge.completed",
            id: challenge.id,
            label: challenge.title,
          },
          actorUserId: user.id,
        });
        if (this.events) {
          await this.events.publish(
            CHALLENGE_EVENT_TYPES.ACHIEVEMENT_EARNED,
            { challengeId: challenge.id, userId: user.id },
            { actorUserId: user.id },
          );
        }
      } catch (error) {
        // Optional achievement: no definition (or disabled module) means
        // completion still stands without a grant.
        if (!(error instanceof NotFoundError)) throw error;
      }
    }
    const row = await this.db.query.challengeParticipants.findFirst({
      where: and(
        eq(schema.challengeParticipants.challengeId, challenge.id),
        eq(schema.challengeParticipants.userId, user.id),
      ),
    });
    return {
      userId: user.id,
      state: "completed",
      joinedAt: (row?.joinedAt ?? new Date()).toISOString(),
      completedAt: (row?.completedAt ?? new Date()).toISOString(),
      progress: null,
    };
  }

  async getDetail(viewer: AuthUser, id: string): Promise<ChallengeDetail> {
    const challenge = await this.requireView(viewer, id);
    const objectives = await this.listObjectives(id);
    const { progress, participation, bingo, quest } =
      await this.evaluateViewerProgress(viewer, id);
    const canManage = await this.canManage(viewer, challenge);
    const existing = await this.db.query.challengeParticipants.findFirst({
      where: and(
        eq(schema.challengeParticipants.challengeId, id),
        eq(schema.challengeParticipants.userId, viewer.id),
      ),
    });
    const record = this.toPublic(
      challenge,
      objectives,
      await this.countParticipants(id),
    );
    record.viewerParticipation = participation;
    record.hasCompletionAchievement = await this.hasCompletionAchievement(id);
    await this.attachBoard(challenge, record);
    await this.attachQuest(challenge, record);
    return {
      ...record,
      viewerProgress: progress,
      viewerParticipation: participation,
      bingo: bingo ?? undefined,
      quest: quest ?? undefined,
      canManage,
      canJoin:
        !existing || existing.state === "left"
          ? await this.canJoin(viewer, challenge)
          : false,
      canLeave: existing?.state === "joined",
    };
  }

  /** Participant board view for the dedicated board endpoint. */
  async getBoardView(viewer: AuthUser, id: string): Promise<BingoBoardView> {
    const challenge = await this.requireView(viewer, id);
    if (challenge.format !== "bingo") {
      throw new NotFoundError("Not a Bingo challenge");
    }
    const { bingo } = await this.evaluateViewerProgress(viewer, id);
    if (!bingo) throw new NotFoundError("Bingo board not found");
    return bingo;
  }

  /** Participant map view for the dedicated quest endpoint. */
  async getQuestView(viewer: AuthUser, id: string): Promise<QuestGraphView> {
    const challenge = await this.requireView(viewer, id);
    if (challenge.format !== "quest") {
      throw new NotFoundError("Not a Quest challenge");
    }
    const { quest } = await this.evaluateViewerProgress(viewer, id);
    if (!quest) throw new NotFoundError("Quest graph not found");
    return quest;
  }

  // ------------------------------------------------------------------
  // Personal hub (1.3): yours · invited · discoverable · completed
  // ------------------------------------------------------------------

  async getHub(
    viewer: AuthUser,
  ): Promise<{ hub: ChallengeHub; invites: ChallengeInvite[] }> {
    await this.requireEnabled();
    const records = await this.listAccessible(viewer);
    const invites = await this.listMyInvites(viewer);
    const pendingIds = invites.map((invite) => invite.challengeId);
    // Invited challenges are visible through the invite itself even when
    // the challenge record is otherwise outside the viewer's reach.
    const knownIds = new Set(records.map((record) => record.id));
    const merged = [...records];
    for (const invite of invites) {
      if (
        invite.challenge &&
        !knownIds.has(invite.challenge.id) &&
        invite.state === "pending"
      ) {
        merged.push(invite.challenge);
        knownIds.add(invite.challenge.id);
      }
    }
    // Showcase summaries for participating records so hub cards render
    // the same per-format visuals as profiles (counts/states only).
    for (const record of merged) {
      const participation = record.viewerParticipation;
      if (
        participation &&
        (participation.state === "joined" ||
          participation.state === "completed")
      ) {
        const challenge = await this.db.query.challenges.findFirst({
          where: eq(schema.challenges.id, record.id),
        });
        if (challenge) {
          participation.summary = await this.summarizeParticipant(
            challenge,
            viewer.id,
          );
        }
      }
    }
    return {
      hub: groupChallengeHub(merged, viewer.id, pendingIds),
      invites,
    };
  }

  // ------------------------------------------------------------------
  // Club tab (1.3): active · upcoming · past + creation affordance
  // ------------------------------------------------------------------

  async listForClub(
    viewer: AuthUser,
    clubId: string,
  ): Promise<{
    active: ChallengeRecord[];
    upcoming: ChallengeRecord[];
    past: ChallengeRecord[];
    canCreate: boolean;
  }> {
    await this.requireEnabled();
    if (!this.clubs) throw new NotFoundError("Club not found");
    await this.clubs.requireView(viewer, clubId);
    const records = await this.listAccessible(viewer, { clubId });
    const active: ChallengeRecord[] = [];
    const upcoming: ChallengeRecord[] = [];
    const past: ChallengeRecord[] = [];
    for (const record of records) {
      if (record.effectiveState === "active") active.push(record);
      else if (
        record.effectiveState === "upcoming" ||
        record.effectiveState === "draft"
      ) {
        upcoming.push(record);
      } else {
        past.push(record);
      }
    }
    return {
      active,
      upcoming,
      past,
      canCreate: await this.canCreateInClub(viewer, clubId),
    };
  }

  /**
   * Recent challenge activity for a club's Challenges tab. Consumes the
   * events 1.0 already emits (joined, started, milestone, completed,
   * achievement, ended) — never raw objective progress, so a busy
   * challenge cannot flood the feed. Private-visibility events stay out.
   */
  async listClubChallengeActivity(
    viewer: AuthUser,
    clubId: string,
    limit = 20,
  ): Promise<
    Array<{
      id: string;
      type: string;
      actorUserId: string;
      username: string | null;
      displayName: string | null;
      challengeId: string;
      title: string | null;
      milestone: number | null;
      createdAt: string;
    }>
  > {
    await this.requireEnabled();
    if (!this.clubs) throw new NotFoundError("Club not found");
    await this.clubs.requireView(viewer, clubId);
    const challengeRows = await this.db
      .select({ id: schema.challenges.id })
      .from(schema.challenges)
      .where(eq(schema.challenges.clubId, clubId));
    const challengeIds = challengeRows.map((row) => row.id);
    if (challengeIds.length === 0) return [];
    const titles = new Map<string, string>();
    for (const id of challengeIds) {
      const challenge = await this.db.query.challenges.findFirst({
        where: eq(schema.challenges.id, id),
      });
      if (challenge) titles.set(id, challenge.title);
    }
    const rows = await this.db
      .select({
        event: schema.activityEvents,
        username: schema.users.username,
        displayName: schema.users.displayName,
      })
      .from(schema.activityEvents)
      .innerJoin(
        schema.users,
        eq(schema.activityEvents.actorUserId, schema.users.id),
      )
      .where(
        and(
          eq(schema.activityEvents.subjectType, "challenge"),
          inArray(schema.activityEvents.subjectId, challengeIds),
          inArray(schema.activityEvents.type, [
            CHALLENGE_EVENT_TYPES.JOINED,
            CHALLENGE_EVENT_TYPES.STARTED,
            CHALLENGE_EVENT_TYPES.MILESTONE,
            CHALLENGE_EVENT_TYPES.COMPLETED,
            CHALLENGE_EVENT_TYPES.ACHIEVEMENT_EARNED,
            CHALLENGE_EVENT_TYPES.ENDED,
          ]),
          ne(schema.activityEvents.visibility, "private"),
        ),
      )
      .orderBy(desc(schema.activityEvents.createdAt))
      .limit(Math.min(Math.max(limit, 1), 50));
    return rows.map((row) => {
      const payload =
        (row.event.payload as Record<string, unknown> | null) ?? {};
      const rawChallengeId =
        typeof payload.challengeId === "string"
          ? payload.challengeId
          : (row.event.subjectId ?? "");
      return {
        id: row.event.id,
        type: row.event.type,
        actorUserId: row.event.actorUserId,
        username: row.username,
        displayName: row.displayName,
        challengeId: rawChallengeId,
        title:
          typeof payload.title === "string"
            ? payload.title
            : (titles.get(rawChallengeId) ?? null),
        milestone:
          typeof payload.milestone === "number" ? payload.milestone : null,
        createdAt: row.event.createdAt.toISOString(),
      };
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle sweep (1.3): started + ending-soon, idempotent
  // ------------------------------------------------------------------

  private async lifecycleMarkers(): Promise<Set<string>> {
    const rows = await this.db
      .select({
        type: schema.activityEvents.type,
        payload: schema.activityEvents.payload,
      })
      .from(schema.activityEvents)
      .where(
        inArray(schema.activityEvents.type, [
          CHALLENGE_EVENT_TYPES.STARTED,
          CHALLENGE_EVENT_TYPES.ENDING_SOON,
        ]),
      );
    const markers = new Set<string>();
    for (const row of rows) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.challengeId === "string") {
        markers.add(`${row.type}:${payload.challengeId}`);
      }
    }
    return markers;
  }

  /**
   * Hourly worker sweep: publish `challenge.started` once when a
   * challenge's window opens and `challenge.ending_soon` once inside the
   * final window. Idempotent via marker activity rows; dates remain the
   * effective-state source of truth (no stored-state mutation here).
   */
  async runLifecycleSweep(now = new Date()): Promise<{
    started: string[];
    endingSoon: string[];
  }> {
    const ENDING_SOON_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
    const markers = await this.lifecycleMarkers();
    const rows = await this.db.select().from(schema.challenges);
    const started: string[] = [];
    const endingSoon: string[] = [];
    for (const challenge of rows) {
      if (
        challenge.state === "draft" ||
        challenge.state === "cancelled" ||
        challenge.state === "completed"
      ) {
        continue;
      }
      const start = +challenge.startsAt;
      const end = +challenge.endsAt;
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const payload = {
        challengeId: challenge.id,
        title: challenge.title,
        clubId: challenge.clubId,
      };
      if (
        +now >= start &&
        !markers.has(`${CHALLENGE_EVENT_TYPES.STARTED}:${challenge.id}`)
      ) {
        if (this.activity) {
          await this.activity.record(
            challenge.creatorUserId,
            CHALLENGE_EVENT_TYPES.STARTED,
            {
              subjectType: "challenge",
              subjectId: challenge.id,
              payload,
            },
          );
        }
        if (this.events) {
          await this.events.publish(
            CHALLENGE_EVENT_TYPES.STARTED,
            payload,
            { actorUserId: challenge.creatorUserId },
          );
        }
        markers.add(`${CHALLENGE_EVENT_TYPES.STARTED}:${challenge.id}`);
        started.push(challenge.id);
      }
      if (
        +now >= end - ENDING_SOON_WINDOW_MS &&
        +now < end &&
        !markers.has(`${CHALLENGE_EVENT_TYPES.ENDING_SOON}:${challenge.id}`)
      ) {
        if (this.activity) {
          await this.activity.record(
            challenge.creatorUserId,
            CHALLENGE_EVENT_TYPES.ENDING_SOON,
            {
              subjectType: "challenge",
              subjectId: challenge.id,
              payload,
            },
          );
        }
        if (this.events) {
          await this.events.publish(
            CHALLENGE_EVENT_TYPES.ENDING_SOON,
            payload,
            { actorUserId: challenge.creatorUserId },
          );
        }
        markers.add(`${CHALLENGE_EVENT_TYPES.ENDING_SOON}:${challenge.id}`);
        endingSoon.push(challenge.id);
      }
    }
    return { started, endingSoon };
  }

  // ------------------------------------------------------------------
  // Profile surface (small 1.0 surface on existing profile architecture)
  // ------------------------------------------------------------------

  async listForProfile(
    viewer: AuthUser,
    ownerId: string,
    isOwner: boolean,
  ): Promise<{
    active: ChallengeRecord[];
    completed: ChallengeRecord[];
  }> {
    await this.requireEnabled();
    const rows = await this.db
      .select()
      .from(schema.challengeParticipants)
      .where(eq(schema.challengeParticipants.userId, ownerId));
    const active: ChallengeRecord[] = [];
    const completed: ChallengeRecord[] = [];
    for (const participation of rows) {
      if (participation.state === "left") continue;
      const challenge = await this.db.query.challenges.findFirst({
        where: eq(schema.challenges.id, participation.challengeId),
      });
      if (!challenge) continue;
      // Respect challenge visibility for non-owners.
      if (!isOwner && !(await this.canView(viewer, challenge))) continue;
      const objectives = await this.listObjectives(challenge.id);
      const record = this.toPublic(challenge, objectives, 0);
      await this.attachBoard(challenge, record);
      await this.attachQuest(challenge, record);
      record.viewerParticipation = {
        userId: ownerId,
        state: participation.state as ChallengeParticipantView["state"],
        joinedAt: participation.joinedAt.toISOString(),
        completedAt: participation.completedAt
          ? participation.completedAt.toISOString()
          : null,
        progress: null,
        // Showcase summary: social counts/states for recognizable cards.
        summary: await this.summarizeParticipant(challenge, ownerId),
      };
      if (participation.state === "completed") completed.push(record);
      else active.push(record);
    }
    return { active, completed };
  }
}
