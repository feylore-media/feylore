import { z } from "zod";

export const GOAL_METRICS = [
  { id: "works", label: "Works", unit: "works", applicableDomains: ["books", "audiobooks", "movies", "tv", "podcasts", "music", "global"] },
  { id: "items", label: "Items", unit: "items", applicableDomains: ["global"] },
  { id: "pages", label: "Pages", unit: "pages", applicableDomains: ["books"] },
  { id: "listening_time", label: "Listening time", unit: "minutes", applicableDomains: ["audiobooks", "podcasts", "music"] },
  { id: "minutes", label: "Minutes", unit: "minutes", applicableDomains: ["audiobooks", "podcasts", "global"] },
  { id: "hours", label: "Hours", unit: "hours", applicableDomains: ["audiobooks", "movies", "tv", "podcasts", "music", "global"] },
  { id: "episodes", label: "Episodes", unit: "episodes", applicableDomains: ["tv", "podcasts"] },
  { id: "albums", label: "Albums", unit: "albums", applicableDomains: ["music"] },
  { id: "tracks", label: "Tracks", unit: "tracks", applicableDomains: ["music"] },
  { id: "movies", label: "Movies", unit: "movies", applicableDomains: ["movies"] },
] as const;

export type GoalMetricId = (typeof GOAL_METRICS)[number]["id"];

export type GoalMetric = (typeof GOAL_METRICS)[number];

export type GoalMetricField =
  | "pages"
  | "minutes"
  | "hours"
  | "episodes"
  | "tracks"
  | "listening_time";

export type GoalDimensionField =
  | "creator"
  | "country"
  | "creator_country"
  | "releaseYear"
  | "release_year"
  | "series";

export type GoalAggregation =
  | { kind: "count" }
  | { kind: "sum"; field: GoalMetricField }
  | { kind: "count_distinct"; field: GoalDimensionField };

export type GoalRuleExpression =
  | { type: "group"; operator: "and" | "or"; children: readonly GoalRuleExpression[] }
  | { type: "predicate"; field: string; operator: string; value?: unknown };

export const GOAL_RULE_FIELDS = [
  { id: "mediaType", label: "Media type", domains: ["global", "books", "audiobooks", "movies", "tv", "podcasts", "music"], operators: ["eq", "in"] },
  { id: "genre", label: "Genre", domains: ["global", "books", "audiobooks", "movies", "tv", "podcasts", "music"], operators: ["eq", "contains", "in"] },
  { id: "creator", label: "Creator", domains: ["global", "books", "audiobooks", "movies", "tv", "podcasts", "music"], operators: ["eq", "contains"] },
  { id: "shelf", label: "Shelf", domains: ["global", "books", "audiobooks", "movies", "tv", "podcasts", "music"], operators: ["eq", "in"] },
  { id: "runtimeMinutes", label: "Runtime", domains: ["movies", "tv"], operators: ["gt", "gte", "lt", "lte"] },
  { id: "publicationYear", label: "Publication year", domains: ["global", "books", "audiobooks", "movies", "tv", "podcasts", "music"], operators: ["eq", "gt", "gte", "lt", "lte"] },
  { id: "owned", label: "Owned", domains: ["global", "books", "audiobooks", "movies", "tv", "podcasts", "music"], operators: ["eq"] },
  { id: "finished", label: "Finished", domains: ["global", "books", "audiobooks", "movies", "tv", "podcasts"], operators: ["eq"] },
] as const;

export type GoalRuleFieldId = (typeof GOAL_RULE_FIELDS)[number]["id"];

export function getGoalMetric(metricId: string): GoalMetric | undefined {
  return GOAL_METRICS.find((metric) => metric.id === metricId);
}

export function getGoalRuleFieldsForDomains(domains: readonly string[]) {
  const set = new Set(domains);
  return GOAL_RULE_FIELDS.filter((field) =>
    field.domains.some((domain) => set.has(domain) || domain === "global"),
  );
}

export function evaluateGoalRule(
  subject: Record<string, unknown>,
  expression: GoalRuleExpression,
): boolean {
  if (expression.type === "group") {
    const results = expression.children.map((child) => evaluateGoalRule(subject, child));
    return expression.operator === "and"
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  const actual = subject[expression.field];
  switch (expression.operator) {
    case "eq":
      return Array.isArray(actual)
        ? actual.some((value) => value === expression.value)
        : actual === expression.value;
    case "neq":
      return actual !== expression.value;
    case "contains": {
      if (typeof expression.value !== "string") return false;
      const needle = expression.value;
      if (Array.isArray(actual)) {
        return actual.some(
          (value) =>
            typeof value === "string" &&
            value.toLowerCase().includes(needle.toLowerCase()),
        );
      }
      if (typeof actual !== "string") return false;
      return actual.toLowerCase().includes(needle.toLowerCase());
    }
    case "in": {
      if (Array.isArray(expression.value)) {
        const expected = expression.value;
        if (Array.isArray(actual)) {
          return actual.some((value) => expected.includes(value));
        }
        return expected.includes(actual as string | number | boolean | null);
      }
      return actual === expression.value;
    }
    case "gt":
      return Number(actual ?? 0) > Number(expression.value ?? 0);
    case "gte":
      return Number(actual ?? 0) >= Number(expression.value ?? 0);
    case "lt":
      return Number(actual ?? 0) < Number(expression.value ?? 0);
    case "lte":
      return Number(actual ?? 0) <= Number(expression.value ?? 0);
    default:
      return false;
  }
}

export const GOAL_TEMPLATES = [
  {
    id: "annual-goal",
    title: "Annual Goal",
    description: "Finish 25 books this year.",
    defaultMetric: "works",
    defaultTarget: 25,
    domains: ["books"],
  },
  {
    id: "tbr-goal",
    title: "TBR Goal",
    description: "Finish 20 things already on my shelves.",
    defaultMetric: "works",
    defaultTarget: 20,
    domains: ["global"],
  },
  {
    id: "genre-goal",
    title: "Genre Goal",
    description: "Read 12 fantasy books.",
    defaultMetric: "works",
    defaultTarget: 12,
    domains: ["books"],
  },
  {
    id: "screen-goal",
    title: "Screen Goal",
    description: "Watch 50 movies.",
    defaultMetric: "movies",
    defaultTarget: 50,
    domains: ["movies"],
  },
  {
    id: "listening-goal",
    title: "Listening Goal",
    description: "Listen for 200 hours.",
    defaultMetric: "hours",
    defaultTarget: 200,
    domains: ["audiobooks", "podcasts"],
  },
  {
    id: "custom",
    title: "Custom Goal",
    description: "Build your own goal.",
    defaultMetric: "works",
    defaultTarget: 1,
    domains: ["global"],
  },
] as const;

export type GoalTemplateId = (typeof GOAL_TEMPLATES)[number]["id"];

export const GOAL_VISIBILITY_VALUES = ["private", "public"] as const;
export type GoalVisibility = (typeof GOAL_VISIBILITY_VALUES)[number];
export type GoalActivity = "finish" | "consume" | "progress";
export type GoalActivityBasis = "completed" | "consumed";

const goalGroupExpressionSchema: z.ZodType<Extract<GoalRuleExpression, { type: "group" }>> = z.object({
  type: z.literal("group"),
  operator: z.enum(["and", "or"]),
  children: z.array(z.lazy(() => goalRuleExpressionSchema)),
});

const goalPredicateExpressionSchema: z.ZodType<Extract<GoalRuleExpression, { type: "predicate" }>> = z.object({
  type: z.literal("predicate"),
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.unknown().optional(),
});

export const goalRuleExpressionSchema: z.ZodType<GoalRuleExpression> = z.union([
  goalGroupExpressionSchema,
  goalPredicateExpressionSchema,
]) as z.ZodType<GoalRuleExpression>;

export const goalMetricSchema = z.enum(GOAL_METRICS.map((metric) => metric.id) as [string, ...string[]]);
export const goalActivitySchema = z.enum(["finish", "consume", "progress"]);
export const goalActivityBasisSchema = z.enum(["completed", "consumed"]);
export const goalVisibilitySchema = z.enum(GOAL_VISIBILITY_VALUES);
export const goalAggregationSchema: z.ZodType<GoalAggregation> = z.union([
  z.object({ kind: z.literal("count") }),
  z.object({
    kind: z.literal("sum"),
    field: z.enum(["pages", "minutes", "hours", "episodes", "tracks"]),
  }),
  z.object({
    kind: z.literal("count_distinct"),
    field: z.enum(["creator", "country", "creator_country", "releaseYear", "release_year", "series"]),
  }),
]);

export const goalCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(80).optional(),
  visibility: goalVisibilitySchema.default("private"),
  metric: goalMetricSchema,
  aggregation: goalAggregationSchema.default({ kind: "count" }),
  target: z.number().int().positive(),
  activity: goalActivitySchema.default("finish"),
  basis: goalActivityBasisSchema.default("completed"),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  domains: z.array(z.string()).default([]),
  rule: goalRuleExpressionSchema.optional(),
});

export const goalUpdateSchema = goalCreateSchema.partial();

export type GoalRecord = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  icon: string | null;
  visibility: GoalVisibility;
  metric: GoalMetricId;
  aggregation: GoalAggregation;
  target: number;
  activity: GoalActivity;
  basis: GoalActivityBasis;
  startsAt: string | null;
  endsAt: string | null;
  domains: string[];
  rule: GoalRuleExpression | null;
  createdAt: string;
  updatedAt: string;
};
