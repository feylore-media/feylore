import { z } from "zod";
import { slugStatusSchema } from "./media-identity.js";
import type { PlaybackLocator } from "./playback.js";

export const MOVIE_IMPORT_FILE_LIMIT = 5;

export const movieImportSchema = z.object({
  fileIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MOVIE_IMPORT_FILE_LIMIT),
});

export const MOVIE_SORT_FIELDS = [
  "title",
  "addedAt",
  "updatedAt",
  "releaseDate",
] as const;

export type MovieSortField = (typeof MOVIE_SORT_FIELDS)[number];

export const movieListQuerySchema = z.object({
  q: z.string().optional(),
  genre: z.string().optional(),
  director: z.string().optional(),
  collection: z.string().optional(),
  favorite: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  view: z.enum(["all", "continue", "recent"]).optional(),
  sort: z.enum(MOVIE_SORT_FIELDS).default("title"),
  order: z.enum(["asc", "desc"]).default("asc"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type MovieListQuery = z.infer<typeof movieListQuerySchema>;

export const createMovieSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  releaseDate: z.string().optional(),
  runtimeSeconds: z.number().int().positive().optional(),
  studio: z.string().optional(),
  contentRating: z.string().optional(),
  genres: z.array(z.string().min(1)).optional(),
});

export const updateMovieSchema = createMovieSchema.partial();

export const setMovieGenresSchema = z.object({
  genres: z.array(z.string().min(1)),
});

export const movieCreditInputSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  character: z.string().optional(),
});

export const setMovieCreditsSchema = z.object({
  credits: z.array(movieCreditInputSchema),
});

export const createMovieCollectionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

export const updateMovieCollectionSchema = createMovieCollectionSchema.partial();

export const movieCollectionMembershipSchema = z.object({
  movieId: z.string().length(6),
});

export const movieCollectionReorderSchema = z.object({
  movieIds: z.array(z.string().length(6)).min(1),
});

export const favoriteUpdateSchema = z.object({
  favorite: z.boolean(),
});

export const ratingUpdateSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
});

export interface MoviePublic {
  id: string;
  slug: string;
  slugStatus: z.infer<typeof slugStatusSchema>;
  title: string;
  subtitle: string | null;
  description: string | null;
  releaseDate: string | null;
  runtimeSeconds: number | null;
  studio: string | null;
  contentRating: string | null;
  coverFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MovieCreditPublic {
  id: string;
  personId: string;
  personSlug: string;
  name: string;
  role: string;
  character: string | null;
  sortOrder: number;
}

export interface MovieCollectionPublic {
  id: string;
  slug: string;
  slugStatus: z.infer<typeof slugStatusSchema>;
  title: string;
  description: string | null;
  coverFileId: string | null;
  movieCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MovieListItem extends MoviePublic {
  genres: string[];
  directors: string[];
  addedAt: string | null;
  representationFormats: string[];
  primaryRepresentationId: string | null;
  favorite: boolean;
  rating: number | null;
  progress: PlaybackLocator | null;
}

export interface MovieDetail extends MoviePublic {
  genres: string[];
  credits: MovieCreditPublic[];
  collections: MovieCollectionPublic[];
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
    favorite: boolean;
    rating: number | null;
    progress: PlaybackLocator | null;
    progressRepresentationId: string | null;
  };
  overrides: Record<string, unknown>;
}

export interface MoviePersonPublic {
  id: string;
  slug: string;
  slugStatus: z.infer<typeof slugStatusSchema>;
  name: string;
  sortName: string | null;
}

export interface MoviePersonDetail extends MoviePersonPublic {
  credits: Array<{
    movieId: string;
    movieSlug: string;
    movieTitle: string;
    role: string;
    character: string | null;
    sortOrder: number;
  }>;
}
