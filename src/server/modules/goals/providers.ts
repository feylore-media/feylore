import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { GoalCandidate } from "../../../shared/goal-evaluation.js";
import type {
  GoalCandidateProvider,
  GoalPeriod,
} from "../../../shared/goal-registry.js";

function inPeriod(value: Date, period: GoalPeriod): boolean {
  if (period.startsAt && value < new Date(period.startsAt)) return false;
  if (period.endsAt && value >= new Date(period.endsAt)) return false;
  return true;
}

function playbackCompleted(locator: Record<string, unknown>): boolean {
  if (locator.completed === true) return true;
  const position = locator.positionSeconds;
  const duration = locator.durationSeconds;
  return (
    typeof position === "number" &&
    typeof duration === "number" &&
    duration > 0 &&
    position / duration >= 0.97
  );
}

export function createCompletedReadingProvider(
  db: Database,
): GoalCandidateProvider {
  return {
    id: "completed-reading",
    domains: ["books", "audiobooks"],
    activities: ["completed"],
    async getCandidates({ userId, period }) {
      const [readingRows, playbackRows] = await Promise.all([
        db
          .select()
          .from(schema.readingProgress)
          .where(
            and(
              eq(schema.readingProgress.userId, userId),
              isNotNull(schema.readingProgress.completedAt),
            ),
          ),
        db
          .select()
          .from(schema.userProgress)
          .where(eq(schema.userProgress.userId, userId)),
      ]);

      const bookIds = readingRows
        .filter((row) => row.workType === "book")
        .map((row) => row.workId);
      const authors = bookIds.length
        ? await db
            .select({ bookId: schema.bookAuthors.bookId, peopleId: schema.bookAuthors.peopleId })
            .from(schema.bookAuthors)
        : [];
      const genres = bookIds.length
        ? await db
            .select({ bookId: schema.bookGenres.bookId, name: schema.bookGenres.name })
            .from(schema.bookGenres)
        : [];
      const audiobookIds = playbackRows
        .filter((row) => row.subjectType === "audiobook")
        .map((row) => row.subjectId);
      const audiobookAuthors = audiobookIds.length
        ? await db
            .select({ audiobookId: schema.audiobookAuthors.audiobookId, peopleId: schema.audiobookAuthors.peopleId })
            .from(schema.audiobookAuthors)
        : [];
      const audiobookGenres = audiobookIds.length
        ? await db
            .select({ audiobookId: schema.audiobookGenres.audiobookId, name: schema.audiobookGenres.name })
            .from(schema.audiobookGenres)
        : [];
      const books = bookIds.length
        ? await db.select({ id: schema.books.id, title: schema.books.title }).from(schema.books)
        : [];
      const audiobooks = audiobookIds.length
        ? await db.select({ id: schema.audiobooks.id, title: schema.audiobooks.title }).from(schema.audiobooks)
        : [];
      const titles = new Map([
        ...books.map((book) => [`book:${book.id}`, book.title] as const),
        ...audiobooks.map((book) => [`audiobook:${book.id}`, book.title] as const),
      ]);
      const authorsByBook = new Map<string, string[]>();
      for (const author of authors) {
        if (!bookIds.includes(author.bookId) || !author.peopleId) continue;
        const values = authorsByBook.get(author.bookId) ?? [];
        values.push(author.peopleId);
        authorsByBook.set(author.bookId, values);
      }
      const authorsByAudiobook = new Map<string, string[]>();
      for (const author of audiobookAuthors) {
        if (!author.peopleId) continue;
        const values = authorsByAudiobook.get(author.audiobookId) ?? [];
        values.push(author.peopleId);
        authorsByAudiobook.set(author.audiobookId, values);
      }
      const genresByWork = new Map<string, string[]>();
      for (const genre of genres) {
        const values = genresByWork.get(`book:${genre.bookId}`) ?? [];
        values.push(genre.name);
        genresByWork.set(`book:${genre.bookId}`, values);
      }
      for (const genre of audiobookGenres) {
        const values = genresByWork.get(`audiobook:${genre.audiobookId}`) ?? [];
        values.push(genre.name);
        genresByWork.set(`audiobook:${genre.audiobookId}`, values);
      }

      const readingCandidates: GoalCandidate[] = readingRows
        .filter((row) => row.completedAt && inPeriod(row.completedAt, period))
        .map((row) => ({
          workType: row.workType,
          workId: row.workId,
          occurredAt: row.completedAt!,
          distinctKey: `${row.workType}:${row.workId}`,
          attributes: {
            mediaType: row.workType,
            title: titles.get(`book:${row.workId}`) ?? "Untitled work",
            finished: true,
            genre: genresByWork.get(`book:${row.workId}`) ?? [],
            creatorPersonIds: authorsByBook.get(row.workId) ?? [],
          },
        }));

      const playbackCandidates: GoalCandidate[] = playbackRows
        .filter((row) => row.subjectType === "audiobook")
        .filter((row) => {
          const locator = row.locatorJson as Record<string, unknown>;
          return playbackCompleted(locator) && inPeriod(row.updatedAt, period);
        })
        .map((row) => {
          const locator = row.locatorJson as Record<string, unknown>;
          const durationSeconds =
            typeof locator.durationSeconds === "number"
              ? locator.durationSeconds
              : null;
          return {
            workType: row.subjectType,
            workId: row.subjectId,
            occurredAt: row.updatedAt,
            distinctKey: `${row.subjectType}:${row.subjectId}`,
            attributes: {
              mediaType: row.subjectType,
              title: titles.get(`audiobook:${row.subjectId}`) ?? "Untitled work",
              finished: true,
              genre: genresByWork.get(`audiobook:${row.subjectId}`) ?? [],
              creatorPersonIds: authorsByAudiobook.get(row.subjectId) ?? [],
              consumedDurationMinutes:
                durationSeconds == null ? null : durationSeconds / 60,
            },
          };
        });

      return [...readingCandidates, ...playbackCandidates];
    },
  };
}

type CompletedPlaybackDomain = {
  id: string;
  domains: readonly ["movies" | "tv" | "podcasts" | "music"];
  subjectType: string;
  title: string;
};

export function createCompletedPlaybackProvider(
  db: Database,
  config: CompletedPlaybackDomain,
): GoalCandidateProvider {
  return {
    id: `completed-${config.id}`,
    domains: config.domains,
    activities: ["completed"],
    async getCandidates({ userId, period }) {
      const rows = await db
        .select()
        .from(schema.userProgress)
        .where(
          and(
            eq(schema.userProgress.userId, userId),
            eq(schema.userProgress.subjectType, config.subjectType),
          ),
        );
      const candidates = rows.filter((row) => {
        const locator = row.locatorJson as Record<string, unknown>;
        return playbackCompleted(locator) && inPeriod(row.updatedAt, period);
      });
      if (candidates.length === 0) return [];

      const ids = candidates.map((row) => row.subjectId);
      const attributes = await loadCandidateAttributes(db, config.subjectType, ids);
      return candidates.map((row) => {
        const value = attributes.get(row.subjectId) ?? {};
        return {
          workType: config.subjectType,
          workId: row.subjectId,
          occurredAt: row.updatedAt,
          distinctKey: `${config.subjectType}:${row.subjectId}`,
          attributes: {
            mediaType: config.subjectType,
            finished: true,
            title: value.title ?? "Untitled work",
            ...value,
          },
        };
      });
    },
  };
}

async function loadCandidateAttributes(
  db: Database,
  subjectType: string,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();
  if (subjectType === "movie") {
    const rows = await db.select().from(schema.movies);
    const genres = await db.select().from(schema.movieGenres);
    for (const row of rows.filter((item) => ids.includes(item.id))) {
      result.set(row.id, {
        title: row.title,
        genre: genres.filter((genre) => genre.movieId === row.id).map((genre) => genre.name),
        releaseYear: row.releaseDate ? Number(row.releaseDate.slice(0, 4)) : undefined,
      });
    }
  } else if (subjectType === "tv_episode") {
    const rows = await db.select().from(schema.tvEpisodes);
    const genres = await db.select().from(schema.tvGenres);
    for (const row of rows.filter((item) => ids.includes(item.id))) {
      result.set(row.id, {
        title: row.title,
        genre: genres.filter((genre) => genre.showId === row.showId).map((genre) => genre.name),
        releaseYear: row.airDate ? Number(row.airDate.slice(0, 4)) : undefined,
      });
    }
  } else if (subjectType === "podcast_episode") {
    const rows = await db.select().from(schema.podcastEpisodes);
    for (const row of rows.filter((item) => ids.includes(item.id))) {
      result.set(row.id, {
        title: row.title,
        releaseYear: row.publishedAt?.getUTCFullYear(),
      });
    }
  } else if (subjectType === "album") {
    const rows = await db.select().from(schema.albums);
    const genres = await db.select().from(schema.albumGenres);
    const artists = await db.select().from(schema.albumArtists);
    const people = await db.select().from(schema.musicArtists);
    for (const row of rows.filter((item) => ids.includes(item.id))) {
      const artistIds = artists.filter((artist) => artist.albumId === row.id).map((artist) => artist.artistId);
      result.set(row.id, {
        title: row.title,
        genre: genres.filter((genre) => genre.albumId === row.id).map((genre) => genre.name),
        creatorPersonIds: people
          .filter((artist) => artistIds.includes(artist.id) && artist.peopleId)
          .map((artist) => artist.peopleId!),
      });
    }
  }
  return result;
}
