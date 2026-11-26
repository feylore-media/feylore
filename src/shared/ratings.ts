import { z } from "zod";

export const RATING_SYSTEM_SETTINGS_KEY = "ratings";

export const RATING_MODES = ["advanced", "simple"] as const;
export type RatingMode = (typeof RATING_MODES)[number];

export const RATING_SCALES = [5, 10] as const;
export type RatingScale = (typeof RATING_SCALES)[number];

export const BOOK_RATING_SCOPES = ["core", "genre"] as const;
export type BookRatingScope = (typeof BOOK_RATING_SCOPES)[number];

export const BOOK_REVIEW_STATUS = ["draft", "completed"] as const;
export type BookReviewStatus = (typeof BOOK_REVIEW_STATUS)[number];

export const BOOK_RECOMMENDATION = ["yes", "no"] as const;
export type BookRecommendation = (typeof BOOK_RECOMMENDATION)[number];

export const TRAJECTORY_STOPS = [25, 50, 75, 100] as const;

export const EXTERNAL_POST_STATUS = [
  "not_configured",
  "unavailable",
  "pending",
  "posted",
  "failed",
  "previously_posted",
] as const;
export type ExternalPostStatus = (typeof EXTERNAL_POST_STATUS)[number];

export const DEFAULT_RATING_SCALE: RatingScale = 5;

export function ratingStep(
  scale: RatingScale,
  allowHalfStars: boolean,
): number {
  if (scale === 10) return 1;
  return allowHalfStars ? 0.5 : 1;
}

export function ratingScaleOptions(settings: RatingSystemSettings): number[] {
  const step = ratingStep(settings.scale, settings.allowHalfStars);
  const options: number[] = [];
  for (let v = 1; v <= settings.scale + 1e-9; v = roundRating(v, step) + step) {
    options.push(roundRating(v, step));
  }
  return options;
}

export function roundRating(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export const ratingSystemSettingsSchema = z.object({
  mode: z.enum(RATING_MODES).default("advanced"),
  scale: z.union([z.literal(5), z.literal(10)]).default(DEFAULT_RATING_SCALE),
  supportedScales: z.array(z.union([z.literal(5), z.literal(10)])).default([5]),
  allowHalfStars: z.boolean().default(true),
  calculation: z
    .object({
      useCore: z.boolean().default(true),
      useGenre: z.boolean().default(true),
      useTrajectory: z.boolean().default(false),
      coreWeight: z.number().min(0).default(1),
      genreWeight: z.number().min(0).default(1),
      trajectoryWeight: z.number().min(0).default(0),
      missingValueMode: z.enum(["ignore", "neutral"]).default("ignore"),
      rounding: z.enum(["nearest", "floor", "ceil", "none"]).default("nearest"),
    })
    .default({}),
  externalPosting: z
    .object({
      providers: z
        .array(
          z.object({
            key: z.string().min(1),
            enabled: z.boolean().default(false),
            label: z.string(),
            description: z.string().default(""),
          }),
        )
        .default([]),
    })
    .default({}),
});

export type RatingSystemSettings = z.infer<typeof ratingSystemSettingsSchema>;

export const DEFAUL_RATING_SYSTEM_SETTINGS = ratingSystemSettingsSchema.parse(
  {},
);

export const ratingDimensionSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1).max(64),
  scope: z.enum(BOOK_RATING_SCOPES),
  name: z.string().min(1).max(120),
  description: z.string().max(400).nullable(),
  enabled: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  required: z.boolean().default(false),
  contributesToRating: z.boolean().default(true),
  weight: z.number().min(0).default(1),
});

export type RatingDimension = z.infer<typeof ratingDimensionSchema>;

export const genreRatingDefinitionSchema = z.object({
  genreTermId: z.string().uuid(),
  genreName: z.string(),
  parentGenreName: z.string().nullable(),
  mediaType: z.string().default("books"),
  inheritanceMode: z.enum(["inherit", "custom"]).default("custom"),
  selectedGenreTermId: z.string().uuid().optional(),
  selectedGenreName: z.string().optional(),
  inheritedFrom: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  dimensions: z.array(ratingDimensionSchema),
});

export type GenreRatingDefinition = z.infer<typeof genreRatingDefinitionSchema>;

export const trajectoryPointSchema = z.object({
  progress: z.number().min(0).max(100),
  rating: z.number().min(1).max(10),
});

export type TrajectoryPoint = z.infer<typeof trajectoryPointSchema>;

export const externalPostStateSchema = z.object({
  status: z.enum(EXTERNAL_POST_STATUS),
  externalPostId: z.string().nullable(),
  postedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

export type ExternalPostState = z.infer<typeof externalPostStateSchema>;

export const bookReviewSchema = z.object({
  status: z.enum(BOOK_REVIEW_STATUS),
  recommendation: z.enum(BOOK_RECOMMENDATION).nullable(),
  suggestedRating: z.number().nullable(),
  finalRating: z.number().nullable(),
  coreValues: z.record(z.string(), z.number()),
  genreValues: z.record(z.string(), z.record(z.string(), z.number())),
  trajectory: z.array(trajectoryPointSchema),
  summary: z.string().nullable(),
  review: z.string().nullable(),
  reviewEdited: z.boolean().default(false),
  externalPosts: z.record(z.string(), externalPostStateSchema),
  completedAt: z.string().nullable(),
});

export type BookReview = z.infer<typeof bookReviewSchema>;

export const externalProviderInfoSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  label: z.string(),
  description: z.string(),
  userAuthorized: z.boolean(),
});

export type ExternalProviderInfo = z.infer<typeof externalProviderInfoSchema>;

export const ratingSystemConfigSchema = z.object({
  settings: ratingSystemSettingsSchema,
  coreDimensions: z.array(ratingDimensionSchema),
  genreDefinitions: z.array(genreRatingDefinitionSchema),
  externalProviders: z.array(externalProviderInfoSchema),
});

export type RatingSystemConfig = z.infer<typeof ratingSystemConfigSchema>;

export const ratingValueSchema = z.number().min(1).max(10);

// --- Admin config mutation payloads ---

export const updateRatingSettingsSchema = ratingSystemSettingsSchema.partial();

export const upsertCoreDimensionSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).nullable().optional(),
  enabled: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  required: z.boolean().default(false),
  contributesToRating: z.boolean().default(true),
  weight: z.number().min(0).default(1),
});

export const upsertGenreDimensionSchema = upsertCoreDimensionSchema.extend({
  genreTermId: z.string().uuid(),
});

export const deleteRatingDimensionSchema = z.object({
  id: z.string().uuid(),
});

export const setGenreDefinitionSchema = z.object({
  genreTermId: z.string().uuid(),
  enabled: z.boolean(),
  displayOrder: z.number().int().optional(),
  mediaType: z.string().trim().min(1).default("books"),
  inheritanceMode: z.enum(["inherit", "custom"]).default("custom"),
});

// --- Review flow payloads ---

export const bookReviewDraftSchema = z
  .object({
    finalRating: ratingValueSchema.nullable().optional(),
    recommendation: z.enum(BOOK_RECOMMENDATION).nullable().optional(),
    coreValues: z.record(z.string(), ratingValueSchema).optional(),
    genreValues: z
      .record(z.string(), z.record(z.string(), ratingValueSchema))
      .optional(),
    trajectory: z
      .array(trajectoryPointSchema)
      .max(TRAJECTORY_STOPS.length + 8)
      .optional(),
    summary: z.string().max(2000).nullable().optional(),
    review: z.string().max(50000).nullable().optional(),
  })
  .strict();

export type BookReviewDraftInput = z.infer<typeof bookReviewDraftSchema>;

export const bookReviewFinalizeSchema = bookReviewDraftSchema.extend({
  finalRating: z.number().min(1).max(10),
  recommendation: z.enum(BOOK_RECOMMENDATION).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  review: z.string().max(50000).nullable().optional(),
  reviewEdited: z.boolean().optional(),
  externalPosts: z.array(z.string().min(1).max(100)).optional(),
});

export type BookReviewFinalizeInput = z.infer<typeof bookReviewFinalizeSchema>;

export const bookReviewExternalPostSchema = z.object({
  providerKey: z.string().min(1).max(100),
});

export const externalPostCredentialSchema = z.object({
  providerKey: z.string().min(1).max(100),
  token: z.string().trim().min(1).max(500),
});

export function normalizeTrajectory(
  points: TrajectoryPoint[],
): TrajectoryPoint[] {
  const byProgress = new Map<number, number>();
  for (const point of points) {
    const progress = Math.max(0, Math.min(100, Math.round(point.progress)));
    const rating = Math.max(1, Math.min(10, point.rating));
    byProgress.set(progress, rating);
  }
  return [...byProgress.entries()]
    .map(([progress, rating]) => ({ progress, rating }))
    .sort((a, b) => a.progress - b.progress);
}

export function filterDimensionValues<T extends Record<string, number>>(
  values: T,
  dimensionKeys: string[],
): T {
  const allowed = new Set(dimensionKeys);
  const result: Record<string, number> = {};
  for (const key of Object.keys(values)) {
    if (allowed.has(key)) result[key] = values[key]!;
  }
  return result as T;
}

// --- Suggested rating calculator (pure, shared between server and client) ---

type CalculationInput = {
  core: { value: number; weight: number }[];
  genreGroups: { value: number; weight: number }[][];
  trajectory: { value: number; weight: number }[];
  settings: RatingSystemSettings;
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function calculateSuggestedRating(
  input: CalculationInput,
): number | null {
  const { settings } = input;
  const scale = settings.scale;

  const coreGroups: number[] = [];
  if (settings.calculation.useCore) {
    const values = input.core;
    const presentMs = values.filter((v) => v.value > 0);
    let entries = presentMs;
    if (
      settings.calculation.missingValueMode === "neutral" &&
      presentMs.length < values.length
    ) {
      const missing = values.filter((v) => v.value <= 0);
      const neutral = scale / 2;
      entries = [
        ...presentMs,
        ...missing.map((v) => ({ value: neutral, weight: v.weight })),
      ];
    }
    const coreScore = weightedAverage(entries);
    if (coreScore !== null) coreGroups.push(coreScore);
  }

  const genreScoreGroups: number[] = [];
  if (settings.calculation.useGenre) {
    for (const group of input.genreGroups) {
      const score = weightedAverage(group);
      if (score !== null) genreScoreGroups.push(score);
    }
  }

  const trajectoryGroups: number[] = [];
  if (settings.calculation.useTrajectory) {
    const trajectoryScore = weightedAverage(input.trajectory);
    if (trajectoryScore !== null) trajectoryGroups.push(trajectoryScore);
  }

  const combined: { value: number; weight: number }[] = [];
  for (const [group, weightKey] of [
    [coreGroups, "coreWeight"],
    [genreScoreGroups, "genreWeight"],
    [trajectoryGroups, "trajectoryWeight"],
  ] as const) {
    const value = mean(group);
    const weight = settings.calculation[weightKey];
    if (value !== null && weight > 0) {
      combined.push({ value, weight });
    }
  }

  if (combined.length === 0) return null;

  const raw = weightedAverage(combined);
  if (raw === null) return null;

  const step = ratingStep(settings.scale, settings.allowHalfStars);
  const rounded =
    settings.calculation.rounding === "floor"
      ? Math.floor(raw)
      : settings.calculation.rounding === "ceil"
        ? Math.ceil(raw)
        : settings.calculation.rounding === "none"
          ? raw
          : roundRating(raw, step);
  return Math.max(1, Math.min(scale, roundRating(rounded, step)));
}

function weightedAverage(
  entries: { value: number; weight: number }[],
): number | null {
  if (entries.length === 0) return null;
  let weightSum = 0;
  let valueSum = 0;
  for (const entry of entries) {
    const weight = entry.weight > 0 ? entry.weight : 1;
    weightSum += weight;
    valueSum += entry.value * weight;
  }
  return valueSum / weightSum;
}
