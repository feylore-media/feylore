import {
  evaluateGoalRule,
  type GoalAggregation,
  type GoalRecord,
  type GoalRuleExpression,
} from "./goals.js";
import {
  getGoalDimensionDefinition,
  getGoalMetricDefinition,
} from "./goal-registry.js";

export type GoalCandidate = {
  workType: string;
  workId: string;
  occurredAt: Date | string;
  attributes: Record<string, unknown>;
  contribution?: number;
  distinctKey?: string;
};

export type GoalPredicateFailure = {
  predicate: string;
  reason: string;
};

export type GoalCandidateEvaluation = {
  eligible: boolean;
  failures: GoalPredicateFailure[];
};

export type GoalProgress = {
  current: number;
  target: number;
  unit: string;
  percentage: number;
  completed: boolean;
  qualifyingItems: number;
  contributingItems: number;
  missingContributionData: number;
  periodState?: "upcoming" | "active" | "ended";
  achievementState?: "in_progress" | "completed";
  milestones?: number[];
  evaluatedAt: string;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function candidateDomains(workType: string): string[] {
  const aliases: Record<string, string> = {
    book: "books",
    audiobook: "audiobooks",
    movie: "movies",
    show: "tv",
    episode: "tv",
    track: "music",
    album: "music",
    podcast: "podcasts",
  };
  return [workType, aliases[workType] ?? workType];
}

function formatPredicate(expression: Extract<GoalRuleExpression, { type: "predicate" }>): string {
  return `${expression.field} ${expression.operator} ${JSON.stringify(expression.value)}`;
}

function explainExpression(
  subject: Record<string, unknown>,
  expression: GoalRuleExpression,
): GoalPredicateFailure[] {
  if (expression.type === "predicate") {
    return evaluateGoalRule(subject, expression)
      ? []
      : [{
          predicate: formatPredicate(expression),
          reason: `The candidate value for ${expression.field} did not satisfy the predicate`,
        }];
  }

  const childFailures = expression.children.map((child) =>
    explainExpression(subject, child),
  );
  if (expression.operator === "and") {
    return childFailures.flat();
  }
  if (childFailures.some((failures) => failures.length === 0)) return [];
  return childFailures.flat();
}

export function evaluateCandidate(
  goal: Pick<GoalRecord, "domains" | "startsAt" | "endsAt" | "rule">,
  candidate: GoalCandidate,
): GoalCandidateEvaluation {
  const occurredAt = asDate(candidate.occurredAt);
  const failures: GoalPredicateFailure[] = [];

  if (
    goal.domains.length > 0 &&
    !goal.domains.includes("global") &&
    !candidateDomains(candidate.workType).some((domain) =>
      goal.domains.includes(domain),
    )
  ) {
    failures.push({
      predicate: "domain",
      reason: `Candidate domain ${candidate.workType} is outside the goal domains`,
    });
  }

  if (goal.startsAt && occurredAt < new Date(goal.startsAt)) {
    failures.push({
      predicate: "period.startsAt",
      reason: "Activity occurred before the goal period",
    });
  }
  if (goal.endsAt && occurredAt >= new Date(goal.endsAt)) {
    failures.push({
      predicate: "period.endsAt",
      reason: "Activity occurred at or after the goal period ended",
    });
  }

  if (goal.rule) {
    failures.push(...explainExpression(candidate.attributes, goal.rule));
  }

  return { eligible: failures.length === 0, failures };
}

function aggregationFor(goal: Pick<GoalRecord, "aggregation" | "metric">): GoalAggregation {
  return goal.aggregation ?? { kind: "count" };
}

export function aggregateGoalCandidates(
  goal: Pick<GoalRecord, "target" | "metric" | "aggregation">,
  candidates: GoalCandidate[],
): GoalProgress {
  const aggregation = aggregationFor(goal);
  const qualifying = candidates;
  const distinct = new Map<string, GoalCandidate>();

  for (const candidate of qualifying) {
    const key = candidate.distinctKey ?? `${candidate.workType}:${candidate.workId}`;
    if (!distinct.has(key)) distinct.set(key, candidate);
  }

  let current = 0;
  let contributingItems = qualifying.length;
  let missingContributionData = 0;
  if (aggregation.kind === "count") {
    current = distinct.size;
  } else if (aggregation.kind === "sum") {
    const definition = getGoalMetricDefinition(goal.metric);
    current = 0;
    contributingItems = 0;
    for (const candidate of candidates) {
      const value = definition?.candidateValue(candidate) ?? candidate.contribution ?? null;
      if (value == null || !Number.isFinite(value)) {
        missingContributionData += 1;
      } else {
        current += value;
        contributingItems += 1;
      }
    }
  } else {
    const definition = getGoalDimensionDefinition(aggregation.field);
    const values = candidates.flatMap((candidate) =>
      definition?.candidateValues(candidate) ??
      (candidate.attributes[aggregation.field] == null
        ? []
        : [candidate.attributes[aggregation.field]]),
    );
    current = new Set(values.map((value) => String(value))).size;
  }

  const percentage = goal.target <= 0
    ? 0
    : Math.min(100, Math.round((current / goal.target) * 100));
  return {
    current,
    target: goal.target,
    unit: goal.metric,
    percentage,
    completed: goal.target > 0 && current >= goal.target,
    qualifyingItems: qualifying.length,
    contributingItems,
    missingContributionData,
    evaluatedAt: new Date().toISOString(),
  };
}
