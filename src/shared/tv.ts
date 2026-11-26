import { z } from "zod";
import { slugStatusSchema } from "./media-identity.js";
import type { PlaybackLocator } from "./playback.js";

export const TV_IMPORT_FILE_LIMIT = 5;

export const tvImportSchema = z.object({
  fileIds: z
    .array(z.string().uuid())
    .min(1)
    .max(TV_IMPORT_FILE_LIMIT),
});

export const TV_SHOW_SORT_FIELDS = [
  "title",
  "addedAt",
  "updatedAt",
  "premiereDate",
] as const;

export type TvShowSortField = (typeof TV_SHOW_SORT_FIELDS)[number];

export const tvShowListQuerySchema = z.object({
  q: z.string().optional(),
  genre: z.string().optional(),
  favorite: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  view: z.enum(["all", "continue", "recent"]).optional(),
  sort: z.enum(TV_SHOW_SORT_FIELDS).default("title"),
  order: z.enum(["asc", "desc"]).default("asc"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type TvShowListQuery = z.infer<typeof tvShowListQuerySchema>;

export const tvEpisodeListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type TvEpisodeListQuery = z.infer<typeof tvEpisodeListQuerySchema>;

export const createTvShowSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  premiereDate: z.string().optional(),
  studio: z.string().optional(),
  contentRating: z.string().optional(),
  genres: z.array(z.string().min(1)).optional(),
});

export const updateTvShowSchema = createTvShowSchema.partial();

export const setTvGenresSchema = z.object({
  genres: z.array(z.string().min(1)),
});

export const tvCreditInputSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  character: z.string().optional(),
});

export const setTvCreditsSchema = z.object({
  credits: z.array(tvCreditInputSchema),
});

export const createTvSeasonSchema = z.object({
  seasonNumber: z.number().int().min(0),
  title: z.string().optional(),
  description: z.string().optional(),
});

export const updateTvSeasonSchema = createTvSeasonSchema
  .omit({ seasonNumber: true })
  .partial();

export const createTvEpisodeSchema = z.object({
  episodeNumber: z.number().int().positive(),
  sortOrder: z.number().int().min(0).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  airDate: z.string().optional(),
  runtimeSeconds: z.number().int().positive().optional(),
});

export const updateTvEpisodeSchema = createTvEpisodeSchema.partial();

export const favoriteUpdateSchema = z.object({
  favorite: z.boolean(),
});

export const ratingUpdateSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
});

export const LIVE_TV_SOURCE_KINDS = ["m3u", "manual"] as const;

export type LiveTvSourceKind = (typeof LIVE_TV_SOURCE_KINDS)[number];

export const createLiveTvPlaylistSchema = z.object({
  name: z.string().min(1),
  sourceKind: z.enum(LIVE_TV_SOURCE_KINDS),
  sourceUrl: z.string().url().optional(),
  epgUrl: z.string().url().optional(),
  sourceConfig: z.record(z.unknown()).optional(),
});

export const updateLiveTvPlaylistSchema = createLiveTvPlaylistSchema.partial();

export const createLiveTvChannelSchema = z.object({
  name: z.string().min(1),
  groupTitle: z.string().optional(),
  logoUrl: z.string().url().optional(),
  streamUrl: z.string().url(),
  tvgId: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export const updateLiveTvChannelSchema = createLiveTvChannelSchema.partial();

export interface TvShowPublic {
  id: string;
  slug: string;
  slugStatus: z.infer<typeof slugStatusSchema>;
  title: string;
  subtitle: string | null;
  description: string | null;
  premiereDate: string | null;
  studio: string | null;
  contentRating: string | null;
  coverFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TvSeasonPublic {
  id: string;
  showId: string;
  seasonNumber: number;
  title: string | null;
  description: string | null;
  coverFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TvEpisodePublic {
  id: string;
  showId: string;
  seasonId: string;
  episodeNumber: number;
  sortOrder: number;
  title: string;
  description: string | null;
  airDate: string | null;
  runtimeSeconds: number | null;
  coverFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TvCreditPublic {
  id: string;
  personId: string;
  personSlug: string;
  name: string;
  role: string;
  character: string | null;
  sortOrder: number;
}

export interface TvShowListItem extends TvShowPublic {
  genres: string[];
  addedAt: string | null;
  episodeCount: number;
  favorite: boolean;
  rating: number | null;
  continueEpisode: TvContinueEpisode | null;
}

export interface TvContinueEpisode {
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  progress: PlaybackLocator | null;
}

export interface TvSeasonProgress {
  seasonNumber: number;
  watchedCount: number;
  totalEpisodes: number;
  nextEpisode: TvContinueEpisode | null;
}

export interface TvShowDetail extends TvShowPublic {
  genres: string[];
  credits: TvCreditPublic[];
  seasons: TvSeasonPublic[];
  seasonProgress: TvSeasonProgress[];
  continueEpisode: TvContinueEpisode | null;
  userState: {
    favorite: boolean;
    rating: number | null;
  };
  overrides: Record<string, unknown>;
}

export interface TvSeasonDetail extends TvSeasonPublic {
  showSlug: string;
  showTitle: string;
  episodes: TvEpisodeListItem[];
  progress: TvSeasonProgress;
}

export interface TvEpisodeListItem extends TvEpisodePublic {
  seasonNumber: number;
  progress: PlaybackLocator | null;
  completed: boolean;
  representationFormats: string[];
  primaryRepresentationId: string | null;
}

export interface TvEpisodeDetail extends TvEpisodePublic {
  showSlug: string;
  showTitle: string;
  seasonNumber: number;
  representations: Array<{
    id: string;
    format: string;
    domainModule: string;
    manifestationId: string | null;
    runtimeSeconds: number | null;
    files: Array<{
      id: string;
      relativePath: string;
      mediaType: string | null;
      size: number;
      role: string;
      sortOrder: number;
      durationSeconds: number | null;
    }>;
  }>;
  userState: {
    progress: PlaybackLocator | null;
    progressRepresentationId: string | null;
    completed: boolean;
  };
  nextEpisode: TvContinueEpisode | null;
  overrides: Record<string, unknown>;
}

export interface TvPersonPublic {
  id: string;
  slug: string;
  slugStatus: z.infer<typeof slugStatusSchema>;
  name: string;
  sortName: string | null;
}

export interface TvPersonDetail extends TvPersonPublic {
  credits: Array<{
    showId: string;
    showSlug: string;
    showTitle: string;
    role: string;
    character: string | null;
    sortOrder: number;
  }>;
}

export interface LiveTvPlaylistPublic {
  id: string;
  name: string;
  sourceKind: LiveTvSourceKind;
  epgUrl: string | null;
  syncInProgress: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  channelCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LiveTvChannelPublic {
  id: string;
  playlistId: string;
  name: string;
  groupTitle: string | null;
  logoUrl: string | null;
  tvgId: string | null;
  sortOrder: number;
  enabled: boolean;
  currentProgram?: LiveTvProgramPublic | null;
}

export interface LiveTvProgramPublic {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
}
