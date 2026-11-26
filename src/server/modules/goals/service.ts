import { and, eq } from "drizzle-orm";
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
  goalCreateSchema,
  goalUpdateSchema,
  type GoalRecord,
  type GoalRuleExpression,
  getGoalMetric,
} from "../../../shared/goals.js";
import {
  aggregateGoalCandidates,
  evaluateCandidate,
  type GoalCandidate,
  type GoalCandidateEvaluation,
  type GoalProgress,
} from "../../../shared/goal-evaluation.js";
import { formatGoalPresentation } from "../../../shared/goal-presentation.js";
import {
  getGoalMetricDefinition,
  type GoalCandidateProvider,
} from "../../../shared/goal-registry.js";
import {
  createCompletedPlaybackProvider,
  createCompletedReadingProvider,
} from "./providers.js";
import type { ActivityService } from "../activity/service.js";
import type { AchievementService } from "../achievements/service.js";

type GoalRow = typeof schema.goals.$inferSelect;

type GoalPublicWithProgress = GoalRecord & { progress: GoalProgress };

export class GoalService {
  private readonly providers: readonly GoalCandidateProvider[];
  private activity?: ActivityService;
  private achievements?: AchievementService;

  constructor(private readonly db: Database) {
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

  /**
   * Owning-feature bridge for Achievements 1.0: a Goal owns a single
   * `completed` achievement definition, issued when the goal completes.
   * Definitions are created through this service — never through a global
   * admin panel.
   */
  setAchievementService(achievements: AchievementService) {
    this.achievements = achievements;
  }

  private async achievementsEnabled(): Promise<boolean> {
    if (!this.achievements) return false;
    return this.achievements.isEnabled();
  }

  private async defineCompletionAchievement(user: AuthUser, goal: GoalRecord) {
    if (!(await this.achievementsEnabled()) || !this.achievements) return;
    await this.achievements.defineAchievement(user, {
      key: "completed",
      name: goal.title,
      description: goal.description ?? null,
      icon: goal.icon ?? null,
      source: { type: "goal", id: goal.id },
    });
  }

  private async grantCompletionAchievement(goal: GoalRecord) {
    if (!(await this.achievementsEnabled()) || !this.achievements) return;
    try {
      await this.achievements.grantAchievement({
        source: { type: "goal", id: goal.id },
        definitionKey: "completed",
        recipientId: goal.userId,
        reason: { type: "goal.completed", id: goal.id, label: goal.title },
        actorUserId: goal.userId,
      });
    } catch (error) {
      // No active completion definition for this goal: nothing to grant.
      // Legacy goals predate achievements; archived goals stop granting.
      if (error instanceof NotFoundError) return;
      throw error;
    }
  }

  toPublic(row: GoalRow): GoalRecord {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      description: row.description ?? null,
      icon: row.icon ?? null,
      visibility: row.visibility as GoalRecord["visibility"],
      metric: row.metric as GoalRecord["metric"],
      aggregation: (row.aggregation as GoalRecord["aggregation"] | null) ?? {
        kind: "count",
      },
      target: row.target,
      activity: row.activity as GoalRecord["activity"],
      basis: row.basis as GoalRecord["basis"],
      startsAt: row.startsAt ? row.startsAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      domains: row.domains ?? [],
      rule: (row.rule as GoalRuleExpression | null) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listAccessible(user: AuthUser): Promise<GoalRecord[]> {
    const owned = await this.db
      .select()
      .from(schema.goals)
      .where(eq(schema.goals.userId, user.id));

    const publicGoals = user.permissions.has(PERMISSIONS.GOALS_READ)
      ? await this.db
          .select()
          .from(schema.goals)
          .where(eq(schema.goals.visibility, "public"))
      : [];

    const map = new Map<string, GoalRow>();
    for (const row of [...owned, ...publicGoals]) {
      map.set(row.id, row);
    }

    return [...map.values()].map((row) => this.toPublic(row));
  }

  async listForProfile(userId: string, isOwner: boolean) {
    const rows = await this.db
      .select()
      .from(schema.goals)
      .where(eq(schema.goals.visibility, "public"));
    const visible = isOwner
      ? [
          ...(await this.db
            .select()
            .from(schema.goals)
            .where(eq(schema.goals.userId, userId))),
        ]
      : rows;
    return Promise.all(
      visible.map(async (row) => {
        const goal = this.toPublic(row);
        const progress = await this.evaluateProgress(goal);
        return {
          id: goal.id,
          title: goal.title,
          description: goal.description,
          visibility: goal.visibility,
          target: progress.target,
          current: progress.current,
          percentage: progress.percentage,
          completed: progress.completed,
          startsAt: goal.startsAt,
          endsAt: goal.endsAt,
          presentation: formatGoalPresentation(goal),
        };
      }),
    );
  }

  async listAccessibleWithProgress(
    user: AuthUser,
  ): Promise<GoalPublicWithProgress[]> {
    const goals = await this.listAccessible(user);
    return Promise.all(
      goals.map(async (goal) => ({
        ...goal,
        progress: await this.evaluateProgress(goal),
      })),
    );
  }

  async getGoal(goalId: string) {
    const row = await this.db.query.goals.findFirst({
      where: eq(schema.goals.id, goalId),
    });
    if (!row) throw new NotFoundError("Goal not found");
    return row;
  }

  async canView(user: AuthUser, goal: GoalRow): Promise<boolean> {
    if (goal.userId === user.id) return true;
    return (
      goal.visibility === "public" &&
      user.permissions.has(PERMISSIONS.GOALS_READ)
    );
  }

  async canEdit(user: AuthUser, goal: GoalRow): Promise<boolean> {
    return goal.userId === user.id;
  }

  async requireView(user: AuthUser, goalId: string) {
    const goal = await this.getGoal(goalId);
    if (!(await this.canView(user, goal))) throw new ForbiddenError();
    return goal;
  }

  async evaluateCandidate(
    user: AuthUser,
    goalId: string,
    candidate: GoalCandidate,
  ): Promise<GoalCandidateEvaluation> {
    const goal = await this.requireView(user, goalId);
    return evaluateCandidate(this.toPublic(goal), candidate);
  }

  async listEvaluatedCandidates(user: AuthUser, goalId: string) {
    const goal = await this.requireView(user, goalId);
    const publicGoal = this.toPublic(goal);
    const candidates = await this.listCandidates(publicGoal);
    return candidates.map((candidate) => ({
      workType: candidate.workType,
      workId: candidate.workId,
      title: String(candidate.attributes.title ?? "Untitled work"),
      occurredAt: new Date(candidate.occurredAt).toISOString(),
      evaluation: evaluateCandidate(publicGoal, candidate),
    }));
  }

  async evaluateProgress(goal: GoalRecord): Promise<GoalProgress> {
    const candidates = await this.listCandidates(goal);
    const eligible = candidates.filter(
      (candidate) => evaluateCandidate(goal, candidate).eligible,
    );
    const progress = aggregateGoalCandidates(goal, eligible);
    const now = Date.now();
    const periodState =
      goal.startsAt && new Date(goal.startsAt).getTime() > now
        ? "upcoming"
        : goal.endsAt && new Date(goal.endsAt).getTime() <= now
          ? "ended"
          : "active";
    const result: GoalProgress = {
      ...progress,
      periodState,
      achievementState: progress.completed ? "completed" : "in_progress",
      milestones: [25, 50, 75, 100],
    };
    await this.recordCrossedMilestones(goal, result);
    // Grant the owning achievement exactly once when the goal completes.
    // Idempotent: re-evaluation never duplicates the grant. Draft previews
    // have no definitions, so nothing is granted there.
    if (progress.completed && goal.id !== "draft") {
      await this.grantCompletionAchievement(goal);
    }
    return result;
  }

  private async recordCrossedMilestones(
    goal: GoalRecord,
    progress: GoalProgress,
  ) {
    if (!this.activity || progress.current <= 0) return;
    const rows = await this.db
      .select({ payload: schema.activityEvents.payload })
      .from(schema.activityEvents)
      .where(
        and(
          eq(schema.activityEvents.actorUserId, goal.userId),
          eq(schema.activityEvents.type, "goal_milestone"),
        ),
      );
    const reached = new Set(
      rows
        .map((row) => row.payload)
        .filter((payload): payload is Record<string, unknown> =>
          Boolean(payload),
        )
        .filter((payload) => payload.goalId === goal.id)
        .map((payload) => Number(payload.milestone)),
    );
    for (const milestone of [25, 50, 75, 100]) {
      if (progress.percentage < milestone || reached.has(milestone)) continue;
      await this.activity.record(goal.userId, "goal_milestone", {
        subjectType: "goal",
        subjectId: goal.id,
        payload: { goalId: goal.id, milestone, title: goal.title },
      });
    }
  }

  async preview(user: AuthUser, input: unknown): Promise<GoalProgress> {
    const parsed = goalCreateSchema.parse(input);
    this.validateConfiguration({
      metric: parsed.metric as GoalRecord["metric"],
      aggregation: parsed.aggregation,
      domains: parsed.domains,
      activity: parsed.activity,
      basis: parsed.basis,
    });
    const now = new Date().toISOString();
    return this.evaluateProgress({
      id: "draft",
      userId: user.id,
      title: parsed.title,
      description: parsed.description ?? null,
      icon: parsed.icon ?? null,
      visibility: parsed.visibility,
      metric: parsed.metric as GoalRecord["metric"],
      aggregation: parsed.aggregation,
      target: parsed.target,
      activity: parsed.activity,
      basis: parsed.basis,
      startsAt: parsed.startsAt ?? null,
      endsAt: parsed.endsAt ?? null,
      domains: parsed.domains,
      rule: parsed.rule ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async listCandidates(goal: GoalRecord): Promise<GoalCandidate[]> {
    const activity = goal.basis;
    const period = { startsAt: goal.startsAt, endsAt: goal.endsAt };
    const metric = getGoalMetricDefinition(goal.metric);
    if (!metric || !metric.supportedActivities.includes(activity)) return [];

    const providers = this.providers.filter(
      (provider) =>
        provider.activities.includes(activity) &&
        (goal.domains.length === 0 ||
          goal.domains.includes("global") ||
          provider.domains.some((domain) => goal.domains.includes(domain))),
    );
    const batches = await Promise.all(
      providers.map((provider) =>
        provider.getCandidates({ userId: goal.userId, period }),
      ),
    );
    return batches.flat();
  }

  private validateConfiguration(input: {
    metric: string;
    aggregation: GoalRecord["aggregation"];
    domains: string[];
    activity: GoalRecord["activity"];
    basis: GoalRecord["basis"];
  }) {
    const definition = getGoalMetricDefinition(input.metric);
    if (!definition) throw new ValidationError("Goal metric is not registered");
    if (definition.aggregation !== input.aggregation.kind) {
      throw new ValidationError("Goal aggregation is incompatible with metric");
    }
    if (!definition.supportedActivities.includes(input.basis)) {
      throw new ValidationError("Goal activity is incompatible with metric");
    }
    if (
      input.domains.length > 0 &&
      !input.domains.includes("global") &&
      !input.domains.some((domain) =>
        (definition.supportedDomains as readonly string[]).includes(domain),
      )
    ) {
      throw new ValidationError("Goal domain is incompatible with metric");
    }
  }

  async create(user: AuthUser, input: unknown) {
    const parsed = goalCreateSchema.parse(input);
    const metric = getGoalMetric(parsed.metric);
    if (!metric) throw new ValidationError("Unknown goal metric");
    this.validateConfiguration({
      metric: parsed.metric,
      aggregation: parsed.aggregation,
      domains: parsed.domains,
      activity: parsed.activity,
      basis: parsed.basis,
    });

    if (parsed.domains.length > 0) {
      const allowed = new Set(metric.applicableDomains as readonly string[]);
      const invalid = parsed.domains.filter(
        (domain) => !allowed.has(domain) && domain !== "global",
      );
      if (invalid.length > 0) {
        throw new ValidationError(
          "Goal domain is incompatible with selected metric",
        );
      }
    }

    const id = generateId();
    await this.db.insert(schema.goals).values({
      id,
      userId: user.id,
      title: parsed.title,
      description: parsed.description ?? null,
      icon: parsed.icon ?? null,
      visibility: parsed.visibility,
      metric: parsed.metric,
      aggregation: parsed.aggregation,
      target: parsed.target,
      activity: parsed.activity,
      startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
      endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
      domains: parsed.domains,
      rule: parsed.rule ?? null,
    });

    const created = this.toPublic((await this.getGoal(id)) as GoalRow);
    await this.defineCompletionAchievement(user, created);
    return created;
  }

  async update(user: AuthUser, goalId: string, input: unknown) {
    const goal = await this.getGoal(goalId);
    if (!(await this.canEdit(user, goal))) throw new ForbiddenError();

    const parsed = goalUpdateSchema.parse(input);
    const next = {
      ...goal,
      ...parsed,
      description: parsed.description ?? goal.description ?? null,
      icon: parsed.icon ?? goal.icon ?? null,
      startsAt: parsed.startsAt ? new Date(parsed.startsAt) : goal.startsAt,
      endsAt: parsed.endsAt ? new Date(parsed.endsAt) : goal.endsAt,
      domains: parsed.domains ?? goal.domains ?? [],
      rule: parsed.rule ?? goal.rule ?? null,
      updatedAt: new Date(),
    };

    if (parsed.metric !== undefined) {
      const metric = getGoalMetric(parsed.metric);
      if (!metric) throw new ValidationError("Unknown goal metric");
      const domains = next.domains ?? goal.domains ?? [];
      const allowed = new Set(metric.applicableDomains as readonly string[]);
      const invalid = domains.filter(
        (domain) => !allowed.has(domain) && domain !== "global",
      );
      if (invalid.length > 0) {
        throw new ValidationError(
          "Goal domain is incompatible with selected metric",
        );
      }
    }

    this.validateConfiguration({
      metric: next.metric,
      aggregation: next.aggregation as GoalRecord["aggregation"],
      domains: next.domains,
      activity: next.activity as GoalRecord["activity"],
      basis: next.basis as GoalRecord["basis"],
    });

    await this.db
      .update(schema.goals)
      .set({
        title: next.title,
        description: next.description,
        icon: next.icon,
        visibility: next.visibility,
        metric: next.metric,
        aggregation: next.aggregation,
        target: next.target,
        activity: next.activity,
        basis: next.basis,
        startsAt: next.startsAt,
        endsAt: next.endsAt,
        domains: next.domains,
        rule: next.rule,
        updatedAt: new Date(),
      })
      .where(eq(schema.goals.id, goalId));

    const updated = this.toPublic((await this.getGoal(goalId)) as GoalRow);
    // Keep the owned achievement's source label in sync with the goal title.
    if (
      this.achievements &&
      parsed.title !== undefined &&
      parsed.title !== goal.title &&
      (await this.achievementsEnabled())
    ) {
      await this.achievements.setSourceLabel("goal", goalId, updated.title);
    }
    return updated;
  }

  async delete(user: AuthUser, goalId: string) {
    const goal = await this.getGoal(goalId);
    if (!(await this.canEdit(user, goal))) throw new ForbiddenError();
    // Archive (never delete) owned achievements so existing grants survive.
    if (this.achievements && (await this.achievementsEnabled())) {
      await this.achievements.archiveDefinitionsForSource("goal", goalId);
    }
    await this.db.delete(schema.goals).where(eq(schema.goals.id, goalId));
    return true;
  }
}
