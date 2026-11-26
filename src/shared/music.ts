import { z } from "zod";
import { slugStatusSchema } from "./media-identity.js";
import type { PlaybackLocator } from "./playback.js";

export const MUSIC_IMPORT_FILE_LIMIT = 50;

export const musicImportSchema = z.object({
  fileIds: z
    .array(z.string().uuid())
    .min(1)
    .max(MUSIC_IMPORT_FILE_LIMIT),
});

export const ALBUM_SORT_FIELDS = [
  "title",
  "addedAt",
  "updatedAt",
  "artist",
  "releaseDate",
] as const;

export type AlbumSortField = (typeof ALBUM_SORT_FIELDS)[number];

export const albumListQuerySchema = z.object({
  q: z.string().optional(),
  artist: z.string().optional(),
  genre: z.string().optional(),
  favorite: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  view: z.enum(["all", "recent"]).optional(),
  sort: z.enum(ALBUM_SORT_FIELDS).default("title"),
  order: z.enum(["asc", "desc"]).default("asc"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type AlbumListQuery = z.infer<typeof albumListQuerySchema>;

export const createAlbumSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  releaseDate: z.string().optional(),
  artistIds: z.array(z.string().length(6)).optional(),
  artistNames: z.array(z.string().min(1)).optional(),
  genres: z.array(z.string().min(1)).optional(),
});

export const updateAlbumSchema = createAlbumSchema.partial();

export const setAlbumArtistsSchema = z.object({
  artistIds: z.array(z.string().length(6)),
});

export const setAlbumGenresSchema = z.object({
  genres: z.array(z.string().min(1)),
});

export const favoriteUpdateSchema = z.object({
  favorite: z.boolean(),
});

export const createPlaylistSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const updatePlaylistSchema = createPlaylistSchema.partial();

export const playlistTrackMutationSchema = z.object({
  trackId: z.string().uuid(),
});

export const playlistReorderSchema = z.object({
  trackIds: z.array(z.string().uuid()).min(1),
});

export interface AlbumPublic {
  id: string;
  slug: string;
  slugStatus: z.infer<typeof slugStatusSchema>;
  title: string;
  subtitle: string | null;
  description: string | null;
  releaseDate: string | null;
  coverFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtistPublic {
  id: string;
  slug: string;
  slugStatus: z.infer<typeof slugStatusSchema>;
  name: string;
  sortName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackPublic {
  id: string;
  albumId: string;
  slug: string;
  title: string;
  discNumber: number | null;
  trackNumber: number | null;
  durationSeconds: number | null;
  representationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumListItem extends AlbumPublic {
  artists: string[];
  genres: string[];
  favorite: boolean;
  addedAt: string | null;
  trackCount: number;
}

export interface TrackListItem extends TrackPublic {
  albumTitle: string;
  albumSlug: string;
  artists: string[];
  artworkUrl?: string;
}

export interface AlbumDetail extends AlbumPublic {
  artists: ArtistPublic[];
  genres: string[];
  tracks: TrackListItem[];
  userState: {
    favorite: boolean;
  };
}

export interface ArtistDetail extends ArtistPublic {
  albums: AlbumListItem[];
}

export interface PlaylistPublic {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistDetail extends PlaylistPublic {
  tracks: TrackListItem[];
}

export interface TrackDetail extends TrackListItem {
  userState: {
    favorite: boolean;
    progress: PlaybackLocator | null;
    progressRepresentationId: string | null;
  };
}
