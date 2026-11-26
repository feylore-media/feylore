import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";

export interface SnapshotCreator {
  role: string;
  name: string;
  peopleId?: string | null;
}

export interface SnapshotGenre {
  name: string;
  termId?: string | null;
}

export interface StatSnapshot {
  snapshotVersion: 1;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  creators: SnapshotCreator[];
  genres: SnapshotGenre[];
  releaseYear?: number | null;
  pages?: number | null;
  durationSeconds?: number | null;
  coverFileId?: string | null;
}

export interface SnapshotSubject {
  subjectType: string;
  subjectId: string;
}

interface SnapshotRow {
  snapshot: Record<string, unknown>;
  mediaType: string;
}

/**
 * Resolves a display snapshot for a subject from live library tables.
 * Unknown subjects return a minimal snapshot so writers never fail hard.
 */
export class SnapshotResolver {
  constructor(private readonly db: Database) {}

  async resolve(
    subjectType: string,
    subjectId: string,
  ): Promise<SnapshotRow> {
    const mediaType = mediaTypeForSubjectType(subjectType);
    const snapshot = await this.resolveSnapshot(subjectType, subjectId);
    const fallback: StatSnapshot = {
      snapshotVersion: 1,
      title: "",
      creators: [],
      genres: [],
    };
    return {
      snapshot: (snapshot ?? fallback) as unknown as Record<string, unknown>,
      mediaType,
    };
  }

  private resolveSnapshot(
    subjectType: string,
    subjectId: string,
  ): Promise<StatSnapshot | null> {
    switch (subjectType) {
      case "book":
        return this.resolveBook(subjectId);
      case "audiobook":
        return this.resolveAudiobook(subjectId);
      case "album":
        return this.resolveAlbum(subjectId);
      case "track":
        return this.resolveTrack(subjectId);
      case "movie":
        return this.resolveMovie(subjectId);
      case "tv_show":
        return this.resolveTvShow(subjectId);
      case "tv_episode":
        return this.resolveTvEpisode(subjectId);
      case "podcast_episode":
        return this.resolvePodcastEpisode(subjectId);
      default:
        return Promise.resolve(null);
    }
  }

  private async resolveBook(bookId: string): Promise<StatSnapshot | null> {
    const [book] = await this.db
      .select()
      .from(schema.books)
      .where(eq(schema.books.id, bookId as never))
      .limit(1);
    if (!book) return null;
    const [authors, genres] = await Promise.all([
      this.db
        .select({
          name: schema.bookAuthors.name,
          peopleId: schema.bookAuthors.peopleId,
        })
        .from(schema.bookAuthors)
        .where(eq(schema.bookAuthors.bookId, bookId as never))
        .orderBy(schema.bookAuthors.sortOrder),
      this.db
        .select({ name: schema.bookGenres.name })
        .from(schema.bookGenres)
        .where(eq(schema.bookGenres.bookId, bookId as never)),
    ]);
    return {
      snapshotVersion: 1,
      title: book.title,
      subtitle: book.subtitle,
      href: `/books/${book.slug}`,
      creators: authors.map((a) => ({ role: "author", name: a.name, peopleId: a.peopleId })),
      genres: genres.map((g) => ({ name: g.name, termId: null })),
      releaseYear: null,
      pages: null,
      durationSeconds: null,
      coverFileId: book.coverFileId,
    };
  }

  private async resolveAudiobook(id: string): Promise<StatSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id as never))
      .limit(1);
    if (!row) return null;
    const [authors, narrators, genres] = await Promise.all([
      this.db
        .select({ name: schema.audiobookAuthors.name, peopleId: schema.audiobookAuthors.peopleId })
        .from(schema.audiobookAuthors)
        .where(eq(schema.audiobookAuthors.audiobookId, id as never))
        .orderBy(schema.audiobookAuthors.sortOrder),
      this.db
        .select({
          name: schema.audiobookNarrators.name,
          peopleId: schema.audiobookNarrators.peopleId,
        })
        .from(schema.audiobookNarrators)
        .where(eq(schema.audiobookNarrators.audiobookId, id as never))
        .orderBy(schema.audiobookNarrators.sortOrder),
      this.db
        .select({ name: schema.audiobookGenres.name })
        .from(schema.audiobookGenres)
        .where(eq(schema.audiobookGenres.audiobookId, id as never)),
    ]);
    return {
      snapshotVersion: 1,
      title: row.title,
      subtitle: row.subtitle,
      href: `/audiobooks/${row.slug}`,
      creators: [
        ...authors.map((a) => ({ role: "author", name: a.name, peopleId: a.peopleId })),
        ...narrators.map((n) => ({ role: "narrator", name: n.name, peopleId: n.peopleId })),
      ],
      genres: genres.map((g) => ({ name: g.name, termId: null })),
      releaseYear: null,
      pages: null,
      durationSeconds: null,
      coverFileId: row.coverFileId,
    };
  }

  private async resolveAlbum(id: string): Promise<StatSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.albums)
      .where(eq(schema.albums.id, id as never))
      .limit(1);
    if (!row) return null;
    const [artistRows, genres, tracks] = await Promise.all([
      this.db
        .select({
          artistId: schema.albumArtists.artistId,
          name: schema.musicArtists.name,
          peopleId: schema.musicArtists.peopleId,
        })
        .from(schema.albumArtists)
        .innerJoin(schema.musicArtists, eq(schema.albumArtists.artistId, schema.musicArtists.id))
        .where(eq(schema.albumArtists.albumId, id as never))
        .orderBy(schema.albumArtists.sortOrder),
      this.db
        .select({ name: schema.albumGenres.name })
        .from(schema.albumGenres)
        .where(eq(schema.albumGenres.albumId, id as never)),
      this.db
        .select({ durationSeconds: schema.musicTracks.durationSeconds })
        .from(schema.musicTracks)
        .where(eq(schema.musicTracks.albumId, id as never)),
    ]);
    const totalSeconds = tracks.reduce(
      (sum, t) => sum + (t.durationSeconds ?? 0),
      0,
    );
    return {
      snapshotVersion: 1,
      title: row.title,
      subtitle: row.subtitle,
      href: `/music/albums/${row.slug}`,
      creators: artistRows.map((a) => ({
        role: "artist",
        name: a.name,
        peopleId: a.peopleId,
      })),
      genres: genres.map((g) => ({ name: g.name, termId: null })),
      releaseYear: parseYear(row.releaseDate),
      pages: null,
      durationSeconds: totalSeconds > 0 ? totalSeconds : null,
      coverFileId: row.coverFileId,
    };
  }

  private async resolveTrack(id: string): Promise<StatSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.musicTracks)
      .where(eq(schema.musicTracks.id, id))
      .limit(1);
    if (!row) return null;
    const [artistRows, album] = await Promise.all([
      this.db
        .select({
          artistId: schema.trackArtists.artistId,
          name: schema.musicArtists.name,
          peopleId: schema.musicArtists.peopleId,
        })
        .from(schema.trackArtists)
        .innerJoin(schema.musicArtists, eq(schema.trackArtists.artistId, schema.musicArtists.id))
        .where(eq(schema.trackArtists.trackId, id))
        .orderBy(schema.trackArtists.sortOrder),
      this.db
        .select()
        .from(schema.albums)
        .where(eq(schema.albums.id, row.albumId as never))
        .limit(1),
    ]);
    const coverFileId = album[0]?.coverFileId ?? null;
    return {
      snapshotVersion: 1,
      title: row.title,
      subtitle: album[0]?.title ?? row.slug,
      href: null,
      creators: artistRows.map((a) => ({
        role: "artist",
        name: a.name,
        peopleId: a.peopleId,
      })),
      genres: [],
      releaseYear: album[0] ? parseYear(album[0].releaseDate) : null,
      pages: null,
      durationSeconds: row.durationSeconds,
      coverFileId,
    };
  }

  private async resolveMovie(id: string): Promise<StatSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.movies)
      .where(eq(schema.movies.id, id as never))
      .limit(1);
    if (!row) return null;
    const [creditRows, genres] = await Promise.all([
      this.db
        .select({
          role: schema.movieCredits.role,
          name: schema.moviePeople.name,
        })
        .from(schema.movieCredits)
        .innerJoin(schema.moviePeople, eq(schema.movieCredits.personId, schema.moviePeople.id))
        .where(eq(schema.movieCredits.movieId, id as never))
        .orderBy(schema.movieCredits.sortOrder),
      this.db
        .select({ name: schema.movieGenres.name })
        .from(schema.movieGenres)
        .where(eq(schema.movieGenres.movieId, id as never)),
    ]);
    return {
      snapshotVersion: 1,
      title: row.title,
      subtitle: row.subtitle,
      href: `/movies/${row.slug}`,
      creators: creditRows.map((c) => ({ role: c.role, name: c.name, peopleId: null })),
      genres: genres.map((g) => ({ name: g.name, termId: null })),
      releaseYear: parseYear(row.releaseDate),
      pages: null,
      durationSeconds: row.runtimeSeconds,
      coverFileId: row.coverFileId,
    };
  }

  private async resolveTvShow(id: string): Promise<StatSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.tvShows)
      .where(eq(schema.tvShows.id, id as never))
      .limit(1);
    if (!row) return null;
    const [creditRows, genres] = await Promise.all([
      this.db
        .select({ role: schema.tvCredits.role, name: schema.tvPeople.name })
        .from(schema.tvCredits)
        .innerJoin(schema.tvPeople, eq(schema.tvCredits.personId, schema.tvPeople.id))
        .where(eq(schema.tvCredits.showId, id as never))
        .orderBy(schema.tvCredits.sortOrder),
      this.db
        .select({ name: schema.tvGenres.name })
        .from(schema.tvGenres)
        .where(eq(schema.tvGenres.showId, id as never)),
    ]);
    return {
      snapshotVersion: 1,
      title: row.title,
      subtitle: row.subtitle,
      href: `/tv/${row.slug}`,
      creators: creditRows.map((c) => ({ role: c.role, name: c.name, peopleId: null })),
      genres: genres.map((g) => ({ name: g.name, termId: null })),
      releaseYear: parseYear(row.premiereDate),
      pages: null,
      durationSeconds: null,
      coverFileId: row.coverFileId,
    };
  }

  private async resolveTvEpisode(id: string): Promise<StatSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.tvEpisodes)
      .where(eq(schema.tvEpisodes.id, id as never))
      .limit(1);
    if (!row) return null;
    const [show, genres] = await Promise.all([
      this.db
        .select({ title: schema.tvShows.title, slug: schema.tvShows.slug, coverFileId: schema.tvShows.coverFileId })
        .from(schema.tvShows)
        .where(eq(schema.tvShows.id, row.showId as never))
        .limit(1),
      this.db
        .select({ name: schema.tvGenres.name })
        .from(schema.tvGenres)
        .where(eq(schema.tvGenres.showId, row.showId as never)),
    ]);
    return {
      snapshotVersion: 1,
      title: row.title,
      subtitle: show[0]?.title ?? row.showId,
      href: null,
      creators: [],
      genres: genres.map((g) => ({ name: g.name, termId: null })),
      releaseYear: parseYear(row.airDate),
      pages: null,
      durationSeconds: row.runtimeSeconds,
      coverFileId: row.coverFileId ?? show[0]?.coverFileId ?? null,
    };
  }

  private async resolvePodcastEpisode(id: string): Promise<StatSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(schema.podcastEpisodes)
      .where(eq(schema.podcastEpisodes.id, id))
      .limit(1);
    if (!row) return null;
    const [show] = await this.db
      .select()
      .from(schema.podcastShows)
      .where(eq(schema.podcastShows.id, row.showId as never))
      .limit(1);
    return {
      snapshotVersion: 1,
      title: row.title,
      subtitle: show?.title ?? row.showId,
      href: null,
      creators: show?.author
        ? [{ role: "author", name: show.author, peopleId: null }]
        : [],
      genres: [],
      releaseYear: row.publishedAt
        ? row.publishedAt.getUTCFullYear()
        : null,
      pages: null,
      durationSeconds: row.durationSeconds,
      coverFileId: show?.coverFileId ?? null,
    };
  }
}

export function mediaTypeForSubjectType(subjectType: string): string {
  switch (subjectType) {
    case "book":
      return "books";
    case "audiobook":
      return "audiobooks";
    case "album":
    case "track":
      return "music";
    case "movie":
      return "movies";
    case "tv_show":
    case "tv_episode":
      return "tv";
    case "podcast_episode":
      return "podcasts";
    default:
      return "books";
  }
}

export function parseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4})/.exec(value.trim());
  return match ? Number(match[1]) : null;
}