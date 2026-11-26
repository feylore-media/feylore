import { eq, and, desc, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { BooksService } from "../books/service.js";
import type { AudiobooksService } from "../audiobooks/service.js";
import type { MusicService } from "../music/service.js";
import type { MoviesService } from "../movies/service.js";
import type { TvService } from "../tv/service.js";
import type { ActivityService } from "../activity/service.js";
import type { ShelfService } from "../shelves/service.js";
import type { LibraryMembershipService } from "../library-membership/service.js";
import type { AuthUser } from "../authorization/service.js";
import { PERMISSIONS } from "../../../shared/permissions.js";
import { ACTIVITY_TYPES } from "../../../shared/activity.js";
import {
  HOME_LIMITS,
  type HomeContinueWatchingItem,
  type HomeLibraryItem,
  type HomeResponse,
  type HomeSections,
  type HomeShelfPreview,
  type HomeShortcut,
} from "../../../shared/home.js";
import type { BookListItem } from "../../../shared/books.js";
import type { AudiobookListItem } from "../../../shared/audiobooks.js";
import type { AlbumListItem, TrackListItem } from "../../../shared/music.js";
import type { MovieListItem } from "../../../shared/movies.js";
import type { BookListQuery } from "../../../shared/books.js";
import type { AudiobookListQuery } from "../../../shared/audiobooks.js";
import type { AlbumListQuery } from "../../../shared/music.js";
import type { MovieListQuery } from "../../../shared/movies.js";

const FINISHED_ACTIVITY_TYPES = [
  ACTIVITY_TYPES.BOOK_READING_FINISHED,
  ACTIVITY_TYPES.LISTENING_FINISHED,
] as const;

const LOW_VALUE_ACTIVITY_TYPES = new Set<string>([
  ACTIVITY_TYPES.BOOK_PROGRESS_UPDATED,
  ACTIVITY_TYPES.LISTENING_PROGRESS_UPDATED,
]);

type OrderedSubjectRef = {
  domain: "book" | "audiobook";
  id: string;
};

export class HomeService {
  constructor(
    private readonly db: Database,
    private readonly books: BooksService,
    private readonly audiobooks: AudiobooksService,
    private readonly music: MusicService,
    private readonly movies: MoviesService,
    private readonly activity: ActivityService,
    private readonly shelves: ShelfService,
    private readonly libraryMembership: LibraryMembershipService,
    private readonly tv?: TvService,
  ) {}

  async getHome(user: AuthUser): Promise<HomeResponse> {
    const [
      continueReading,
      continueListening,
      continueWatching,
      recentlyPlayedMusic,
      recentlyAddedAlbums,
      recentlyAdded,
      recentlyFinished,
      favorites,
      recentActivity,
      shelves,
      shortcuts,
    ] = await Promise.all([
      this.loadContinueReading(user.id),
      this.loadContinueListening(user.id),
      this.loadContinueWatching(user.id),
      this.loadRecentlyPlayedMusic(user.id),
      this.loadRecentlyAddedAlbums(user.id),
      this.loadRecentlyAdded(user.id),
      this.loadRecentlyFinished(user.id),
      this.loadFavorites(user.id),
      this.loadRecentActivity(user.id),
      this.loadShelfPreviews(user),
      this.loadShortcuts(user.id),
    ]);

    const sections: HomeSections = {
      continueReading,
      continueListening,
      continueWatching,
      recentlyPlayedMusic,
      recentlyAddedAlbums,
      recentlyAdded,
      recentlyFinished,
      favorites,
      recentActivity,
      shelves,
      shortcuts,
      recommendations: [],
    };

    const isEmpty =
      continueReading.length === 0 &&
      continueListening.length === 0 &&
      continueWatching.length === 0 &&
      recentlyPlayedMusic.length === 0 &&
      recentlyAddedAlbums.length === 0 &&
      recentlyAdded.length === 0 &&
      recentlyFinished.length === 0 &&
      favorites.length === 0 &&
      recentActivity.length === 0 &&
      shelves.filter((s) => s.shelf.ownerUserId === user.id).length === 0;

    return { sections, isEmpty };
  }

  private async loadContinueReading(userId: string): Promise<BookListItem[]> {
    const { items } = await this.books.listBooksForUser(userId, {
      view: "continue",
      limit: HOME_LIMITS.continue,
    } as BookListQuery);
    return items;
  }

  private async loadContinueListening(
    userId: string,
  ): Promise<AudiobookListItem[]> {
    const { items } = await this.audiobooks.listAudiobooksForUser(userId, {
      view: "continue",
      limit: HOME_LIMITS.continue,
    } as AudiobookListQuery);
    return items;
  }

  private async loadContinueWatching(
    userId: string,
  ): Promise<HomeContinueWatchingItem[]> {
    const limit = HOME_LIMITS.continue;
    const fetchLimit = 500;

    const [movieResult, tvItems] = await Promise.all([
      this.movies.listMoviesForUser(userId, {
        view: "continue",
        limit: fetchLimit,
      } as MovieListQuery),
      this.tv?.listContinueEpisodesForUser(userId, fetchLimit) ?? [],
    ]);

    const movieIds = movieResult.items.map((movie) => movie.id);
    const movieProgressMap = new Map<string, Date>();

    if (movieIds.length > 0) {
      const progressRows = await this.db
        .select({
          subjectId: schema.userProgress.subjectId,
          updatedAt: schema.userProgress.updatedAt,
        })
        .from(schema.userProgress)
        .where(
          and(
            eq(schema.userProgress.userId, userId),
            eq(schema.userProgress.subjectType, "movie"),
            inArray(schema.userProgress.subjectId, movieIds),
          ),
        );

      for (const row of progressRows) {
        movieProgressMap.set(row.subjectId, row.updatedAt);
      }
    }

    type MergeEntry = {
      updatedAt: Date;
      item:
        | { kind: "movie"; movie: MovieListItem }
        | {
            kind: "tv_episode";
            showSlug: string;
            showTitle: string;
            showId: string;
            episode: (typeof tvItems)[number]["continueEpisode"];
          };
    };

    const merged: MergeEntry[] = [];

    for (const movie of movieResult.items) {
      merged.push({
        updatedAt: movieProgressMap.get(movie.id) ?? new Date(0),
        item: { kind: "movie", movie },
      });
    }

    for (const tv of tvItems) {
      merged.push({
        updatedAt: tv.updatedAt,
        item: {
          kind: "tv_episode",
          showSlug: tv.showSlug,
          showTitle: tv.showTitle,
          showId: tv.showId,
          episode: tv.continueEpisode,
        },
      });
    }

    merged.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const result: HomeContinueWatchingItem[] = [];

    for (const entry of merged.slice(0, limit)) {
      if (entry.item.kind === "movie") {
        result.push({ kind: "movie", item: entry.item.movie });
        continue;
      }

      const { showSlug, showTitle, showId, episode } = entry.item;
      const coverFileId = this.tv
        ? await this.resolveTvEpisodeCoverFileId(episode.episodeId, showId)
        : null;

      result.push({
        kind: "tv_episode",
        item: {
          showSlug,
          showTitle,
          episodeId: episode.episodeId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          episodeTitle: episode.title,
          coverFileId,
          progress: episode.progress,
          href: `/tv/shows/${showSlug}/s/${episode.seasonNumber}/e/${episode.episodeNumber}`,
        },
      });
    }

    return result;
  }

  private async resolveTvEpisodeCoverFileId(
    episodeId: string,
    showId: string,
  ): Promise<string | null> {
    if (!this.tv) return null;

    const episode = await this.tv.getEpisodeById(episodeId);
    const show = await this.tv.getShow(showId);
    const season = await this.db.query.tvSeasons.findFirst({
      where: eq(schema.tvSeasons.id, episode.seasonId),
    });
    if (!season) return show.coverFileId;

    return this.tv.resolveCoverFileId(episode, season, show);
  }

  private async loadRecentlyPlayedMusic(
    userId: string,
  ): Promise<TrackListItem[]> {
    return this.music.listRecentlyPlayedTracksForUser(
      userId,
      HOME_LIMITS.continue,
    );
  }

  private async loadRecentlyAddedAlbums(
    userId: string,
  ): Promise<AlbumListItem[]> {
    const { items } = await this.music.listAlbumsForUser(userId, {
      view: "recent",
      limit: HOME_LIMITS.recentlyAdded,
    } as AlbumListQuery);
    return items;
  }

  private async loadRecentlyAdded(userId: string): Promise<HomeLibraryItem[]> {
    const memberships = await this.libraryMembership.listForUser(userId);
    const relevant = memberships
      .filter(
        (m) => m.targetType === "book" || m.targetType === "audiobook",
      )
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
      .slice(0, HOME_LIMITS.recentlyAdded);

    if (relevant.length === 0) return [];

    const orderedRefs: OrderedSubjectRef[] = relevant.map((m) => ({
      domain: m.targetType as "book" | "audiobook",
      id: m.targetId,
    }));

    const bookIds = orderedRefs
      .filter((r) => r.domain === "book")
      .map((r) => r.id);
    const audiobookIds = orderedRefs
      .filter((r) => r.domain === "audiobook")
      .map((r) => r.id);

    const [books, audiobooks] = await Promise.all([
      this.books.listBooksByIdsForUser(userId, bookIds),
      this.audiobooks.listAudiobooksByIdsForUser(userId, audiobookIds),
    ]);

    return this.orderLibraryItems(orderedRefs, books, audiobooks);
  }

  private async loadRecentlyFinished(
    userId: string,
  ): Promise<HomeLibraryItem[]> {
    const { events } = await this.activity.listForUser(userId, {
      types: [...FINISHED_ACTIVITY_TYPES],
      limit: HOME_LIMITS.recentlyFinished * 4,
    });

    const seen = new Set<string>();
    const orderedRefs: OrderedSubjectRef[] = [];

    for (const event of events) {
      if (!event.subjectId || !event.subjectType) continue;
      if (event.subjectType !== "book" && event.subjectType !== "audiobook") {
        continue;
      }
      const key = `${event.subjectType}:${event.subjectId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      orderedRefs.push({
        domain: event.subjectType,
        id: event.subjectId,
      });
      if (orderedRefs.length >= HOME_LIMITS.recentlyFinished) break;
    }

    if (orderedRefs.length === 0) return [];

    const bookIds = orderedRefs
      .filter((r) => r.domain === "book")
      .map((r) => r.id);
    const audiobookIds = orderedRefs
      .filter((r) => r.domain === "audiobook")
      .map((r) => r.id);

    const [books, audiobooks] = await Promise.all([
      this.books.listBooksByIdsForUser(userId, bookIds),
      this.audiobooks.listAudiobooksByIdsForUser(userId, audiobookIds),
    ]);

    return this.orderLibraryItems(orderedRefs, books, audiobooks);
  }

  private async loadFavorites(userId: string): Promise<HomeLibraryItem[]> {
    const favRows = await this.db
      .select()
      .from(schema.userFavorites)
      .where(
        and(
          eq(schema.userFavorites.userId, userId),
          inArray(schema.userFavorites.subjectType, ["book", "audiobook"]),
        ),
      )
      .orderBy(desc(schema.userFavorites.createdAt))
      .limit(HOME_LIMITS.favorites);

    if (favRows.length === 0) return [];

    const orderedRefs: OrderedSubjectRef[] = favRows.map((row) => ({
      domain: row.subjectType as "book" | "audiobook",
      id: row.subjectId,
    }));

    const bookIds = orderedRefs
      .filter((r) => r.domain === "book")
      .map((r) => r.id);
    const audiobookIds = orderedRefs
      .filter((r) => r.domain === "audiobook")
      .map((r) => r.id);

    const [books, audiobooks] = await Promise.all([
      this.books.listBooksByIdsForUser(userId, bookIds),
      this.audiobooks.listAudiobooksByIdsForUser(userId, audiobookIds),
    ]);

    return this.orderLibraryItems(orderedRefs, books, audiobooks);
  }

  private async loadRecentActivity(userId: string) {
    const { events } = await this.activity.listForUser(userId, {
      limit: HOME_LIMITS.activity * 3,
    });

    return events
      .filter((e) => !LOW_VALUE_ACTIVITY_TYPES.has(e.type))
      .slice(0, HOME_LIMITS.activity);
  }

  private async loadShelfPreviews(user: AuthUser): Promise<HomeShelfPreview[]> {
    if (!user.permissions.has(PERMISSIONS.SHELVES_READ)) {
      return [];
    }

    const accessible = await this.shelves.listAccessible(user, "global");
    const globalOnly = accessible.filter((s) => s.scope === "global");
    const top = globalOnly.slice(0, HOME_LIMITS.shelves);

    const previews = await Promise.all(
      top.map(async (shelf) => {
        try {
          const detail = await this.shelves.getShelfDetailForUser(
            user,
            shelf.id,
          );
          const books = detail.items
            .map((i) => i.book)
            .filter((b): b is BookListItem => b != null);
          return {
            shelf: this.shelves.toPublic(shelf, user.id),
            coverFileIds: books.slice(0, 4).map((b) => b.coverFileId),
            itemCount: detail.items.length,
          };
        } catch {
          return {
            shelf: this.shelves.toPublic(shelf, user.id),
            coverFileIds: [],
            itemCount: 0,
          };
        }
      }),
    );

    return previews;
  }

  private async loadShortcuts(userId: string): Promise<HomeShortcut[]> {
    const memberships = await this.libraryMembership.listForUser(userId);
    const hasBooks = memberships.some((m) => m.targetType === "book");
    const hasAudiobooks = memberships.some((m) => m.targetType === "audiobook");
    const hasMusic = memberships.some((m) => m.targetType === "album");
    const hasMovies = memberships.some((m) => m.targetType === "movie");
    const hasShows = memberships.some((m) => m.targetType === "show");

    const shortcuts: HomeShortcut[] = [{ key: "search", href: "/search" }];
    if (hasBooks) shortcuts.push({ key: "books", href: "/books" });
    if (hasAudiobooks) shortcuts.push({ key: "audiobooks", href: "/audiobooks" });
    if (hasMusic) shortcuts.push({ key: "music", href: "/music" });
    if (hasMovies) shortcuts.push({ key: "movies", href: "/movies" });
    if (hasShows) shortcuts.push({ key: "tv", href: "/tv" });
    shortcuts.push({ key: "shelves", href: "/shelves" });
    return shortcuts;
  }

  private orderLibraryItems(
    orderedRefs: OrderedSubjectRef[],
    books: BookListItem[],
    audiobooks: AudiobookListItem[],
  ): HomeLibraryItem[] {
    const bookMap = new Map(books.map((b) => [b.id, b]));
    const audiobookMap = new Map(audiobooks.map((a) => [a.id, a]));
    const items: HomeLibraryItem[] = [];

    for (const ref of orderedRefs) {
      if (ref.domain === "book") {
        const item = bookMap.get(ref.id);
        if (item) items.push({ domain: "book", item });
      } else {
        const item = audiobookMap.get(ref.id);
        if (item) items.push({ domain: "audiobook", item });
      }
    }

    return items;
  }
}
