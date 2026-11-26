import type { ActivityEventPublic } from "./activity.js";
import type { AudiobookListItem } from "./audiobooks.js";
import type { MovieListItem } from "./movies.js";
import type { BookListItem } from "./books.js";
import type { AlbumListItem, TrackListItem } from "./music.js";
import type { PlaybackLocator } from "./playback.js";
import type { ShelfPublic } from "./shelves.js";

/** Server-enforced section limits for GET /api/v1/home */
export const HOME_LIMITS = {
  continue: 12,
  recentlyAdded: 12,
  recentlyFinished: 12,
  favorites: 12,
  activity: 8,
  shelves: 6,
} as const;

export type HomeLibraryItem =
  | { domain: "book"; item: BookListItem }
  | { domain: "audiobook"; item: AudiobookListItem };

export interface HomeShelfPreview {
  shelf: ShelfPublic;
  coverFileIds: (string | null)[];
  itemCount: number;
}

export interface HomeShortcut {
  key: string;
  href: string;
}

export interface HomeTvContinueItem {
  showSlug: string;
  showTitle: string;
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string;
  coverFileId: string | null;
  progress: PlaybackLocator | null;
  href: string;
}

export type HomeContinueWatchingItem =
  | { kind: "movie"; item: MovieListItem }
  | { kind: "tv_episode"; item: HomeTvContinueItem };

/** Stub — populated when RecommendationProvider exists */
export interface HomeRecommendation {
  id: string;
}

export interface HomeSections {
  continueReading: BookListItem[];
  continueListening: AudiobookListItem[];
  continueWatching: HomeContinueWatchingItem[];
  recentlyPlayedMusic: TrackListItem[];
  recentlyAddedAlbums: AlbumListItem[];
  recentlyAdded: HomeLibraryItem[];
  recentlyFinished: HomeLibraryItem[];
  favorites: HomeLibraryItem[];
  recentActivity: ActivityEventPublic[];
  shelves: HomeShelfPreview[];
  shortcuts: HomeShortcut[];
  recommendations: HomeRecommendation[];
}

export interface HomeResponse {
  sections: HomeSections;
  /** True when no meaningful library/activity state exists */
  isEmpty: boolean;
}
