import { z } from "zod";

/**
 * Achievement source types — the Feylore feature that owns a definition.
 * Sources are intentionally generic: Challenges, Clubs, Goals and system
 * achievements all resolve back to a `{ sourceType, sourceId }` pair.
 */
export const ACHIEVEMENT_SOURCE_TYPES = [
  "challenge",
  "club",
  "goal",
  "system",
] as const;

export type AchievementSourceType = (typeof ACHIEVEMENT_SOURCE_TYPES)[number];

export function isAchievementSourceType(
  value: string,
): value is AchievementSourceType {
  return (ACHIEVEMENT_SOURCE_TYPES as readonly string[]).includes(value);
}

export const ACHIEVEMENT_DEFINITION_STATES = ["active", "archived"] as const;

export type AchievementDefinitionState =
  (typeof ACHIEVEMENT_DEFINITION_STATES)[number];

export function isAchievementDefinitionState(
  value: string,
): value is AchievementDefinitionState {
  return (ACHIEVEMENT_DEFINITION_STATES as readonly string[]).includes(value);
}

/** Maximum lengths keep definition identity display-safe and indexable. */
export const ACHIEVEMENT_KEY_MAX = 120;
/** Aligned with goal titles (200) so owning features never truncate. */
export const ACHIEVEMENT_NAME_MAX = 200;
export const ACHIEVEMENT_DESCRIPTION_MAX = 2000;
export const ACHIEVEMENT_ICON_MAX = 120;
export const ACHIEVEMENT_SOURCE_ID_MAX = 120;
export const ACHIEVEMENT_LABEL_MAX = 240;
export const ACHIEVEMENT_REASON_TYPE_MAX = 120;
export const ACHIEVEMENT_REASON_ID_MAX = 120;

export const achievementSourceSchema = z.object({
  /** Registered owning feature (challenge | club | goal | system). */
  type: z.enum(ACHIEVEMENT_SOURCE_TYPES),
  /** Opaque identifier of the source within its feature. */
  id: z.string().min(1).max(ACHIEVEMENT_SOURCE_ID_MAX),
});

/** Programmatic definition contract — consumed by owning features, not UI. */
export const achievementDefineSchema = z.object({
  /** Stable key unique within the owning source (e.g. "spooky-season"). */
  key: z
    .string()
    .min(1)
    .max(ACHIEVEMENT_KEY_MAX)
    .regex(
      /^[a-z0-9][a-z0-9-_]*$/,
      "Key must be lowercase alphanumeric with dashes/underscores",
    ),
  name: z.string().min(1).max(ACHIEVEMENT_NAME_MAX),
  description: z.string().max(ACHIEVEMENT_DESCRIPTION_MAX).nullish(),
  /** Optional Solar icon identifier, rendered by the presentation layer. */
  icon: z.string().max(ACHIEVEMENT_ICON_MAX).nullish(),
  /** Optional presentation metadata owned by the definition (colors, badges). */
  presentation: z.record(z.unknown()).nullish(),
  source: achievementSourceSchema,
});

export const achievementDefinitionUpdateSchema = z.object({
  name: z.string().min(1).max(ACHIEVEMENT_NAME_MAX).optional(),
  description: z
    .string()
    .max(ACHIEVEMENT_DESCRIPTION_MAX)
    .nullable()
    .optional(),
  icon: z.string().max(ACHIEVEMENT_ICON_MAX).nullable().optional(),
  presentation: z.record(z.unknown()).nullable().optional(),
});

export const achievementReasonSchema = z.object({
  /** Stable completion reason (e.g. "goal.completed", "challenge.read_added"). */
  type: z.string().min(1).max(ACHIEVEMENT_REASON_TYPE_MAX),
  /** Identifier that produced the grant (e.g. the goal id). Opaque per reason. */
  id: z.string().min(1).max(ACHIEVEMENT_REASON_ID_MAX).nullish(),
  /** Human-readable provenance line captured at grant time. */
  label: z.string().max(ACHIEVEMENT_LABEL_MAX).nullish(),
});

/** Compact immutable grant snapshot — definition + source presentation. */
export const achievementGrantSnapshotSchema = z.object({
  achievement: z.object({
    id: z.string().uuid(),
    key: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    presentation: z.record(z.unknown()).nullable().optional(),
  }),
  source: z.object({
    type: z.string(),
    id: z.string(),
    /** Source label at grant time (e.g. "October Horror Challenge"). */
    label: z.string().nullable().optional(),
  }),
});

export type AchievementSourceRef = z.infer<typeof achievementSourceSchema>;
export type AchievementDefineInput = z.infer<typeof achievementDefineSchema>;
export type AchievementDefinitionUpdateInput = z.infer<
  typeof achievementDefinitionUpdateSchema
>;
export type AchievementReasonInput = z.infer<typeof achievementReasonSchema>;
export type AchievementGrantSnapshot = z.infer<
  typeof achievementGrantSnapshotSchema
>;

export interface AchievementDefinitionPublic {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  presentation: Record<string, unknown> | null;
  sourceType: AchievementSourceType;
  sourceId: string;
  sourceLabel: string | null;
  state: AchievementDefinitionState;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Viewer-facing earned achievement. `sourceLabel` and the snapshot survive
 * source renames and deletions so a grant stays understandable.
 */
export interface UserAchievementPublic {
  /** Grant id (opaque, stable per earn). */
  id: string;
  userId: string;
  definitionId: string;
  definitionKey: string;
  name: string;
  description: string | null;
  icon: string | null;
  presentation: Record<string, unknown> | null;
  sourceType: string;
  sourceId: string;
  sourceLabel: string | null;
  reasonType: string | null;
  reasonId: string | null;
  reasonLabel: string | null;
  /** Compact immutable provenance snapshot captured at grant time. */
  snapshot: AchievementGrantSnapshot | null;
  metadata: Record<string, unknown> | null;
  earnedAt: string;
}

/** Profile-consumable recent-achievement row. */
export interface ProfileAchievementView {
  /** Grant id. */
  id: string;
  definitionId: string;
  definitionKey: string;
  name: string;
  description: string | null;
  icon: string | null;
  sourceType: string;
  sourceLabel: string | null;
  earnedAt: string;
}

export const ACHIEVEMENT_LIST_LIMIT_MAX = 100;

export const achievementListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ACHIEVEMENT_LIST_LIMIT_MAX)
    .default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export type AchievementListQuery = z.infer<typeof achievementListQuerySchema>;
