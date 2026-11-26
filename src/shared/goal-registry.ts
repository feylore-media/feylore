import type { GoalCandidate } from "./goal-evaluation.js";
import type { GoalAggregation } from "./goals.js";

export type MediaDomain =
  | "books"
  | "audiobooks"
  | "movies"
  | "tv"
  | "podcasts"
  | "music";
export type GoalActivityBasis = "completed" | "consumed";
export type GoalValueType = "number" | "duration";
export type GoalDimensionValueType =
  | "string"
  | "number"
  | "date"
  | "person"
  | "enum";

export interface GoalMetricDefinition {
  id: string;
  label: string;
  aggregation: GoalAggregation["kind"];
  valueType: GoalValueType;
  supportedDomains: readonly MediaDomain[];
  supportedActivities: readonly GoalActivityBasis[];
  candidateValue(candidate: GoalCandidate): number | null;
}

export interface GoalDimensionDefinition {
  id: string;
  label: string;
  supportedDomains: readonly MediaDomain[];
  valueType: GoalDimensionValueType;
  candidateValues(candidate: GoalCandidate): unknown[];
}

export type GoalPeriod = {
  startsAt: string | null;
  endsAt: string | null;
};

export interface GoalCandidateProvider {
  id: string;
  domains: readonly MediaDomain[];
  activities: readonly GoalActivityBasis[];
  getCandidates(input: {
    userId: string;
    period: GoalPeriod;
  }): Promise<GoalCandidate[]>;
}

export type GoalCapability = {
  id: string;
  label: string;
  aggregation: GoalAggregation["kind"];
  valueType: GoalValueType | GoalDimensionValueType;
  supportedDomains: readonly MediaDomain[];
  supportedActivities?: readonly GoalActivityBasis[];
};

const allDomains: readonly MediaDomain[] = [
  "books",
  "audiobooks",
  "movies",
  "tv",
  "podcasts",
  "music",
];

export const GOAL_METRIC_DEFINITIONS: readonly GoalMetricDefinition[] = [
  {
    id: "works",
    label: "Works",
    aggregation: "count",
    valueType: "number",
    supportedDomains: allDomains,
    supportedActivities: ["completed"],
    candidateValue: () => 1,
  },
  {
    id: "pages",
    label: "Pages",
    aggregation: "sum",
    valueType: "number",
    supportedDomains: ["books"],
    supportedActivities: ["completed", "consumed"],
    candidateValue: (candidate) =>
      typeof candidate.attributes.consumedPages === "number"
        ? candidate.attributes.consumedPages
        : null,
  },
  {
    id: "listening_time",
    label: "Listening time",
    aggregation: "sum",
    valueType: "duration",
    supportedDomains: ["audiobooks", "podcasts", "music"],
    supportedActivities: ["completed", "consumed"],
    candidateValue: (candidate) =>
      typeof candidate.attributes.consumedDurationMinutes === "number"
        ? candidate.attributes.consumedDurationMinutes
        : null,
  },
  {
    id: "hours",
    label: "Hours",
    aggregation: "sum",
    valueType: "duration",
    supportedDomains: ["audiobooks", "podcasts", "music", "movies", "tv"],
    supportedActivities: ["completed", "consumed"],
    candidateValue: (candidate) =>
      typeof candidate.attributes.consumedDurationMinutes === "number"
        ? candidate.attributes.consumedDurationMinutes / 60
        : null,
  },
  {
    id: "episodes",
    label: "Episodes",
    aggregation: "count",
    valueType: "number",
    supportedDomains: ["tv", "podcasts"],
    supportedActivities: ["completed"],
    candidateValue: () => 1,
  },
  {
    id: "items",
    label: "Items",
    aggregation: "count",
    valueType: "number",
    supportedDomains: allDomains,
    supportedActivities: ["completed"],
    candidateValue: () => 1,
  },
  {
    id: "minutes",
    label: "Minutes",
    aggregation: "sum",
    valueType: "duration",
    supportedDomains: ["audiobooks", "podcasts", "music", "movies", "tv"],
    supportedActivities: ["completed", "consumed"],
    candidateValue: (candidate) =>
      typeof candidate.attributes.consumedDurationMinutes === "number"
        ? candidate.attributes.consumedDurationMinutes
        : null,
  },
  {
    id: "movies",
    label: "Movies",
    aggregation: "count",
    valueType: "number",
    supportedDomains: ["movies"],
    supportedActivities: ["completed"],
    candidateValue: () => 1,
  },
  {
    id: "albums",
    label: "Albums",
    aggregation: "count",
    valueType: "number",
    supportedDomains: ["music"],
    supportedActivities: ["completed"],
    candidateValue: () => 1,
  },
  {
    id: "tracks",
    label: "Tracks",
    aggregation: "count",
    valueType: "number",
    supportedDomains: ["music"],
    supportedActivities: ["completed"],
    candidateValue: () => 1,
  },
];

export const GOAL_DIMENSION_DEFINITIONS: readonly GoalDimensionDefinition[] = [
  {
    id: "creator",
    label: "Creator",
    supportedDomains: allDomains,
    valueType: "person",
    candidateValues: (candidate) =>
      (candidate.attributes.creatorPersonIds ?? candidate.attributes.creator) as unknown[] ?? [],
  },
  {
    id: "creator_country",
    label: "Creator country",
    supportedDomains: allDomains,
    valueType: "string",
    candidateValues: (candidate) =>
      (candidate.attributes.creatorCountries ?? candidate.attributes.country) as unknown[] ?? [],
  },
  {
    id: "release_year",
    label: "Release year",
    supportedDomains: allDomains,
    valueType: "number",
    candidateValues: (candidate) =>
      candidate.attributes.releaseYear == null ? [] : [candidate.attributes.releaseYear],
  },
  {
    id: "series",
    label: "Series",
    supportedDomains: ["books", "audiobooks", "tv"],
    valueType: "string",
    candidateValues: (candidate) => candidate.attributes.seriesIds as unknown[] ?? [],
  },
];

export function getGoalMetricDefinition(id: string): GoalMetricDefinition | undefined {
  return GOAL_METRIC_DEFINITIONS.find((definition) => definition.id === id);
}

export function getGoalDimensionDefinition(id: string): GoalDimensionDefinition | undefined {
  return GOAL_DIMENSION_DEFINITIONS.find((definition) => definition.id === id);
}

export function listGoalCapabilities(): GoalCapability[] {
  return [
    ...GOAL_METRIC_DEFINITIONS.map(({ id, label, aggregation, valueType, supportedDomains, supportedActivities }) => ({
      id,
      label,
      aggregation,
      valueType,
      supportedDomains,
      supportedActivities,
    })),
    ...GOAL_DIMENSION_DEFINITIONS.map(({ id, label, valueType, supportedDomains }) => ({
      id,
      label,
      aggregation: "count_distinct" as const,
      valueType,
      supportedDomains,
    })),
  ];
}

export const GOAL_REGISTRY_FIELD_ALIASES: Record<string, string> = {
  minutes: "listening_time",
  hours: "listening_time",
  creator: "creator",
  country: "creator_country",
  releaseYear: "release_year",
};
