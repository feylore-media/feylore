import { z } from "zod";
import { slugStatusSchema } from "./media-identity.js";
import type { PlaybackLocator } from "./playback.js";

export const AUDIOBOOK_IMPORT_FILE_LIMIT = 10;

export const audiobookImportSchema = z.object({
  fileIds: z
    .array(z.string().uuid())
    .min(1)
    .max(AUDIOBOOK_IMPORT_FILE_LIMIT),
});

export const AUDIOBOOK_SORT_FIELDS = [
  "title",
  "addedAt",
  "updatedAt",
  "author",
] as const;

export type AudiobookSortField = (typeof AUDIOBOOK_SORT_FIELDS)[number];

export const audiobookListQuerySchema = z.object({
  q: z.string().optional(),
  author: z.string().optional(),
  narrator: z.string().optional(),
  series: z.string().uuid().optional(),
  genre: z.string().optional(),
  favorite: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  view: z.enum(["all", "continue", "recent"]).optional(),
  sort: z.enum(AUDIOBOOK_SORT_FIELDS).default("title"),
  order: z.enum(["asc", "desc"]).default("asc"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type AudiobookListQuery = z.infer<typeof audiobookListQuerySchema>;

export const createAudiobookSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  authors: z.array(z.string().min(1)).optional(),
  narrators: z.array(z.string().min(1)).optional(),
  genres: z.array(z.string().min(1)).optional(),
});

export const updateAudiobookSchema = createAudiobookSchema.partial();

export const setAuthorsSchema = z.object({
  authors: z.array(z.string().min(1)),
});

export const setNarratorsSchema = z.object({
  narrators: z.array(z.string().min(1)),
});

export const setGenresSchema = z.object({
  genres: z.array(z.string().min(1)),
});

export const setSeriesSchema = z.object({
  seriesId: z.string().uuid().nullable(),
  position: z.number().int().positive().optional(),
});

export const ratingUpdateSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
});

export const favoriteUpdateSchema = z.object({
  favorite: z.boolean(),
});

export const relationshipCreateSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  relationshipType: z.string().min(1),
});

export const RELATED_EDITION_RELATIONSHIP = "related_edition" as const;

export interface AudiobookPublic {
  id: string;
  slug: string;
  slugStatus: z.infer<typeof slugStatusSchema>;
  title: string;
  subtitle: string | null;
  description: string | null;
  coverFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AudiobookAuthorPublic {
  id: string;
  name: string;
  sortOrder: number;
  peopleId: string | null;
  peopleSlug: string | null;
}

export interface AudiobookNarratorPublic {
  id: string;
  name: string;
  sortOrder: number;
  peopleId: string | null;
  peopleSlug: string | null;
}

export interface AudiobookSeriesPublic {
  id: string;
  name: string;
  position: number | null;
}

export interface AudiobookListItem extends AudiobookPublic {
  authors: string[];
  narrators: string[];
  genres: string[];
  series: AudiobookSeriesPublic | null;
  favorite: boolean;
  rating: number | null;
  progress: PlaybackLocator | null;
  addedAt: string | null;
  representationFormats: string[];
  runtimeSeconds: number | null;
}

export interface AudiobookDetail extends AudiobookPublic {
  authors: AudiobookAuthorPublic[];
  narrators: AudiobookNarratorPublic[];
  genres: string[];
  series: AudiobookSeriesPublic | null;
  expressions: Array<{ id: string; label: string | null; createdAt: string }>;
  manifestations: Array<{
    id: string;
    expressionId: string;
    label: string | null;
    externalIdType: string | null;
    externalId: string | null;
    createdAt: string;
  }>;
  representations: Array<{
    id: string;
    manifestationId: string | null;
    format: string;
    domainModule: string;
    unavailableAt: string | null;
    createdAt: string;
    updatedAt: string;
    runtimeSeconds: number | null;
    files: Array<{
      id: string;
      mediaType: string | null;
      size: number;
      role: string | null;
      sortOrder: number;
      durationSeconds: number | null;
    }>;
  }>;
  relationships: Array<{
    id: string;
    targetType: string;
    targetId: string;
    relationshipType: string;
    targetTitle?: string;
    targetSlug?: string;
    targetHref?: string;
  }>;
  userState: {
    favorite: boolean;
    rating: number | null;
    progress: PlaybackLocator | null;
    progressRepresentationId: string | null;
  };
  overrides: Record<string, unknown>;
}
