import {
  eq,
  and,
  inArray,
  ilike,
  asc,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { NotFoundError, ForbiddenError } from "../../../shared/errors.js";
import {
  inferFormatFromPath,
  titleFromPath,
} from "../../../shared/subject.js";
import type { RepresentationService } from "../representations/service.js";
import type { LibraryMembershipService } from "../library-membership/service.js";
import type { FileService } from "../files/service.js";
import type { MetadataService } from "../metadata/service.js";
import type { UserStateService } from "../user-state/service.js";
import type { PostgresSearchIndex } from "../search/index.js";
import type { JobService } from "../jobs/service.js";
import { JOB_TYPES } from "../jobs/types.js";
import type {
  MovieListQuery,
  MovieListItem,
  MovieDetail,
  MovieCollectionPublic,
  MovieCreditPublic,
} from "../../../shared/movies.js";
import type { PlaybackLocator } from "../../../shared/playback.js";
import { isPlaybackProgressLocator } from "../../../shared/progress-locator.js";
import {
  allocateMovieCanonicalSlug,
  allocateMovieCollectionCanonicalSlug,
  allocateMoviePersonCanonicalSlug,
  generateUniqueMovieCollectionId,
  generateUniqueMovieId,
  generateUniqueMoviePersonId,
  getMovieBySlug,
  getMovieCollectionBySlug,
  pendingMovieCollectionIdentity,
  pendingMovieIdentity,
  pendingMoviePersonIdentity,
  promoteMoviePersonSlugIfPending,
  promoteMovieSlugIfPending,
} from "./identity.js";

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mkv",
  "webm",
  "video",
  "mov",
  "avi",
]);

export class MoviesService {
  private jobs: JobService | undefined;

  constructor(
    private readonly db: Database,
    private readonly representations: RepresentationService,
    private readonly libraryMembership: LibraryMembershipService,
    private readonly files: FileService,
    private readonly metadata: MetadataService,
    private readonly userState: UserStateService,
    private readonly search: PostgresSearchIndex,
  ) {}

  setJobService(jobs: JobService) {
    this.jobs = jobs;
  }

  async createMovie(input: {
    title: string;
    subtitle?: string;
    description?: string;
    releaseDate?: string;
    runtimeSeconds?: number;
    studio?: string;
    contentRating?: string;
    genres?: string[];
  }) {
    const id = await generateUniqueMovieId(this.db);
    const canonicalSlug = await allocateMovieCanonicalSlug(this.db, input.title);
    const identity = canonicalSlug
      ? { id, slug: canonicalSlug, slugStatus: "canonical" as const }
      : pendingMovieIdentity(id);

    await this.db.insert(schema.movies).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      title: input.title,
      subtitle: input.subtitle,
      description: input.description,
      releaseDate: input.releaseDate,
      runtimeSeconds: input.runtimeSeconds,
      studio: input.studio,
      contentRating: input.contentRating,
    });

    const expressionId = generateId();
    await this.db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "movie",
      workId: id,
      label: "default",
    });

    await this.db.insert(schema.creativeWorkManifestations).values({
      id: generateId(),
      expressionId,
      label: "default",
    });

    if (input.genres?.length) await this.setGenres(id, input.genres);

    await this.indexMovie(id);
    return id;
  }

  private async createPendingMovie(input: { title: string }) {
    const id = await generateUniqueMovieId(this.db);
    const identity = pendingMovieIdentity(id);

    await this.db.insert(schema.movies).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      title: input.title,
    });

    const expressionId = generateId();
    await this.db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "movie",
      workId: id,
      label: "default",
    });

    await this.db.insert(schema.creativeWorkManifestations).values({
      id: generateId(),
      expressionId,
      label: "default",
    });

    await this.indexMovie(id);
    return id;
  }

  async updateMovie(
    id: string,
    input: Partial<{
      title: string;
      subtitle: string;
      description: string;
      releaseDate: string;
      runtimeSeconds: number;
      studio: string;
      contentRating: string;
    }>,
  ) {
    await this.getMovie(id);
    await this.db
      .update(schema.movies)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.movies.id, id));
    await this.indexMovie(id);
  }

  async deleteMovie(id: string) {
    await this.getMovie(id);
    await this.search.remove("movie", id);
    await this.db.delete(schema.movies).where(eq(schema.movies.id, id));
  }

  async getMovie(id: string) {
    const movie = await this.db.query.movies.findFirst({
      where: eq(schema.movies.id, id),
    });
    if (!movie) throw new NotFoundError("Movie not found");
    return movie;
  }

  async getMovieByRef(ref: string) {
    return getMovieBySlug(this.db, ref);
  }

  async ensureUserAccess(userId: string, movieId: string) {
    const membership = await this.libraryMembership.listForUser(
      userId,
      "movie",
    );
    if (!membership.some((m) => m.targetId === movieId)) {
      throw new ForbiddenError("Movie not in your library");
    }
  }

  async findMovieIdForRepresentation(
    representationId: string,
  ): Promise<string | null> {
    const rep = await this.representations.get(representationId);
    if (!rep.manifestationId) return null;

    const manifestation = await this.db.query.creativeWorkManifestations.findFirst({
      where: eq(schema.creativeWorkManifestations.id, rep.manifestationId),
    });
    if (!manifestation) return null;

    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: eq(schema.creativeWorkExpressions.id, manifestation.expressionId),
    });
    if (!expression || expression.workType !== "movie") return null;
    return expression.workId;
  }

  async ensureRepresentationAccess(userId: string, representationId: string) {
    const movieId = await this.findMovieIdForRepresentation(representationId);
    if (!movieId) throw new ForbiddenError("Representation not accessible");
    await this.ensureUserAccess(userId, movieId);
    return movieId;
  }

  async listMoviesForUser(
    userId: string,
    query: MovieListQuery = {} as MovieListQuery,
  ) {
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "movie",
    );
    if (memberships.length === 0) {
      return { items: [] as MovieListItem[], nextCursor: undefined };
    }

    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );
    let movieIds = memberships.map((m) => m.targetId);

    if (query.q) {
      const searchResults = await this.search.query({
        q: query.q,
        types: ["movie"],
        limit: 200,
      });
      const searchedIds = new Set(searchResults.results.map((r) => r.id));
      if (searchedIds.size > 0) {
        movieIds = movieIds.filter((id) => searchedIds.has(id));
      } else if (
        "searchMoviesByTitle" in this.search &&
        typeof this.search.searchMoviesByTitle === "function"
      ) {
        movieIds = await this.search.searchMoviesByTitle(
          this.db,
          movieIds,
          query.q,
        );
      } else {
        movieIds = await this.searchMoviesByTitle(movieIds, query.q);
      }
    }

    if (query.director) {
      const directorRows = await this.db
        .select({ movieId: schema.movieCredits.movieId })
        .from(schema.movieCredits)
        .innerJoin(
          schema.moviePeople,
          eq(schema.movieCredits.personId, schema.moviePeople.id),
        )
        .where(
          and(
            ilike(schema.moviePeople.name, `%${query.director}%`),
            ilike(schema.movieCredits.role, "director"),
          ),
        );
      const ids = new Set(directorRows.map((r) => r.movieId));
      movieIds = movieIds.filter((id) => ids.has(id));
    }

    if (query.genre) {
      const genreRows = await this.db
        .select({ movieId: schema.movieGenres.movieId })
        .from(schema.movieGenres)
        .where(ilike(schema.movieGenres.name, `%${query.genre}%`));
      const ids = new Set(genreRows.map((r) => r.movieId));
      movieIds = movieIds.filter((id) => ids.has(id));
    }

    if (query.collection) {
      const collection = await this.db.query.movieCollections.findFirst({
        where: or(
          eq(schema.movieCollections.slug, query.collection),
          eq(schema.movieCollections.id, query.collection),
        ),
      });
      if (collection) {
        const itemRows = await this.db
          .select({ movieId: schema.movieCollectionItems.movieId })
          .from(schema.movieCollectionItems)
          .where(eq(schema.movieCollectionItems.collectionId, collection.id));
        const ids = new Set(itemRows.map((r) => r.movieId));
        movieIds = movieIds.filter((id) => ids.has(id));
      } else {
        movieIds = [];
      }
    }

    if (query.favorite === true) {
      const favRows = await this.db
        .select({ subjectId: schema.userFavorites.subjectId })
        .from(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, "movie"),
          ),
        );
      const favIds = new Set(favRows.map((r) => r.subjectId));
      movieIds = movieIds.filter((id) => favIds.has(id));
    } else if (query.favorite === false) {
      const favRows = await this.db
        .select({ subjectId: schema.userFavorites.subjectId })
        .from(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, "movie"),
          ),
        );
      const favIds = new Set(favRows.map((r) => r.subjectId));
      movieIds = movieIds.filter((id) => !favIds.has(id));
    }

    let progressUpdatedMap: Map<string, Date> | undefined;
    if (query.view === "continue") {
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
          ),
        );
      progressUpdatedMap = new Map(
        progressRows.map((r) => [r.subjectId, r.updatedAt]),
      );
      const progressIds = new Set(progressRows.map((r) => r.subjectId));
      movieIds = movieIds.filter((id) => progressIds.has(id));
    }

    if (movieIds.length === 0) {
      return { items: [] as MovieListItem[], nextCursor: undefined };
    }

    const movies = await this.db
      .select()
      .from(schema.movies)
      .where(inArray(schema.movies.id, movieIds));

    const sortField = query.sort ?? "title";
    const sortOrder = query.order ?? "asc";
    movies.sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortField === "updatedAt") {
        cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
      } else if (sortField === "addedAt") {
        const aAdded = membershipMap.get(a.id)?.getTime() ?? 0;
        const bAdded = membershipMap.get(b.id)?.getTime() ?? 0;
        cmp = aAdded - bAdded;
      } else if (sortField === "releaseDate") {
        cmp = (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "");
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });

    if (query.view === "continue" && progressUpdatedMap) {
      movies.sort((a, b) => {
        const aTime = progressUpdatedMap!.get(a.id)?.getTime() ?? 0;
        const bTime = progressUpdatedMap!.get(b.id)?.getTime() ?? 0;
        return bTime - aTime;
      });
    } else if (query.view === "recent") {
      movies.sort((a, b) => {
        const aAdded = membershipMap.get(a.id)?.getTime() ?? 0;
        const bAdded = membershipMap.get(b.id)?.getTime() ?? 0;
        return bAdded - aAdded;
      });
    }

    const limit = query.limit ?? 50;
    const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
    const page = movies.slice(offset, offset + limit + 1);
    const hasMore = page.length > limit;
    const pageMovies = hasMore ? page.slice(0, limit) : page;

    const items = await Promise.all(
      pageMovies.map((movie) =>
        this.toListItem(movie, userId, membershipMap.get(movie.id)),
      ),
    );

    return {
      items,
      nextCursor: hasMore ? String(offset + limit) : undefined,
    };
  }

  async listMoviesByIdsForUser(
    userId: string,
    movieIds: string[],
  ): Promise<MovieListItem[]> {
    if (movieIds.length === 0) return [];

    const memberships = await this.libraryMembership.listForUser(
      userId,
      "movie",
    );
    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );

    const accessibleIds = movieIds.filter((id) => membershipMap.has(id));
    if (accessibleIds.length === 0) return [];

    const movies = await this.db
      .select()
      .from(schema.movies)
      .where(inArray(schema.movies.id, accessibleIds));
    const movieById = new Map(movies.map((m) => [m.id, m]));

    const items: MovieListItem[] = [];
    for (const id of movieIds) {
      const movie = movieById.get(id);
      if (movie) {
        items.push(
          await this.toListItem(movie, userId, membershipMap.get(id)),
        );
      }
    }
    return items;
  }

  async getMovieDetail(movieId: string, userId?: string): Promise<MovieDetail> {
    const movie = await this.getMovie(movieId);
    const reps = await this.representationsForMovie(movieId);

    const representationsWithFiles = await Promise.all(
      reps.map(async (rep) => {
        const fileLinks = await this.representations.listFilesForRepresentation(
          rep.id,
        );
        const files = await Promise.all(
          fileLinks.map(async (link) => {
            const file = await this.files.getFile(link.fileId);
            const durationSeconds = await this.getFileDurationSeconds(
              link.fileId,
            );
            return {
              id: file.id,
              relativePath: file.relativePath,
              mediaType: file.mediaType,
              size: file.size,
              role: link.role ?? "content",
              sortOrder: link.sortOrder,
              durationSeconds,
            };
          }),
        );
        const runtimeSeconds = await this.deriveRepresentationRuntime(rep.id);
        return {
          id: rep.id,
          format: rep.format,
          domainModule: rep.domainModule,
          manifestationId: rep.manifestationId,
          runtimeSeconds,
          files,
        };
      }),
    );

    const genres = await this.getGenreNames(movieId);
    const credits = await this.getCreditsForMovie(movieId);
    const collections = await this.getCollectionsForMovie(movieId);
    const overrides = await this.metadata.getOverrides("movie", movieId);

    let userState = {
      favorite: false,
      rating: null as number | null,
      progress: null as PlaybackLocator | null,
      progressRepresentationId: null as string | null,
    };

    if (userId) {
      const progress = await this.userState.getProgress(
        userId,
        "movie",
        movieId,
      );
      userState = {
        favorite: await this.userState.getFavorite(userId, "movie", movieId),
        rating: await this.userState.getRating(userId, "movie", movieId),
        progress:
          progress?.locator && isPlaybackProgressLocator(progress.locator)
            ? progress.locator
            : null,
        progressRepresentationId: progress?.representationId ?? null,
      };
    }

    const overrideMap: Record<string, unknown> = {};
    for (const o of overrides) {
      overrideMap[o.field] = o.value;
    }

    const effective = this.applyOverrides(movie, overrideMap);

    return {
      ...this.toPublic(effective),
      genres,
      credits,
      collections,
      representations: representationsWithFiles,
      userState,
      overrides: overrideMap,
    };
  }

  private applyOverrides(
    movie: typeof schema.movies.$inferSelect,
    overrides: Record<string, unknown>,
  ) {
    return {
      ...movie,
      title: (overrides.title as string) ?? movie.title,
      subtitle: (overrides.subtitle as string | undefined) ?? movie.subtitle,
      description:
        (overrides.description as string | undefined) ?? movie.description,
      releaseDate:
        (overrides.releaseDate as string | undefined) ?? movie.releaseDate,
      runtimeSeconds:
        (overrides.runtimeSeconds as number | undefined) ?? movie.runtimeSeconds,
      studio: (overrides.studio as string | undefined) ?? movie.studio,
      contentRating:
        (overrides.contentRating as string | undefined) ?? movie.contentRating,
    };
  }

  async setGenres(movieId: string, genres: string[]) {
    await this.getMovie(movieId);
    await this.db
      .delete(schema.movieGenres)
      .where(eq(schema.movieGenres.movieId, movieId));
    for (const name of genres) {
      await this.db.insert(schema.movieGenres).values({
        id: generateId(),
        movieId,
        name,
      });
    }
    await this.indexMovie(movieId);
  }

  async findOrCreatePersonByName(name: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("person_name_required");

    const existing = await this.db
      .select({ id: schema.moviePeople.id })
      .from(schema.moviePeople)
      .where(ilike(schema.moviePeople.name, trimmed))
      .limit(1);
    if (existing[0]) return existing[0].id;

    const id = await generateUniqueMoviePersonId(this.db);
    const canonicalSlug = await allocateMoviePersonCanonicalSlug(this.db, trimmed);
    const identity = canonicalSlug
      ? { id, slug: canonicalSlug, slugStatus: "canonical" as const }
      : pendingMoviePersonIdentity(id);

    await this.db.insert(schema.moviePeople).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      name: trimmed,
    });

    await promoteMoviePersonSlugIfPending(this.db, id, trimmed);
    return id;
  }

  async setCredits(
    movieId: string,
    credits: Array<{ name: string; role: string; character?: string }>,
  ) {
    await this.getMovie(movieId);
    await this.db
      .delete(schema.movieCredits)
      .where(eq(schema.movieCredits.movieId, movieId));

    for (let i = 0; i < credits.length; i++) {
      const credit = credits[i]!;
      const personId = await this.findOrCreatePersonByName(credit.name);
      await this.db.insert(schema.movieCredits).values({
        id: generateId(),
        movieId,
        personId,
        role: credit.role,
        character: credit.character,
        sortOrder: i,
      });
    }
    await this.indexMovie(movieId);
  }

  async applyIngestedMetadata(
    movieId: string,
    sources: {
      merged: Partial<{
        title: string;
        subtitle: string;
        description: string;
        releaseDate: string;
        runtimeSeconds: number;
        studio: string;
        contentRating: string;
        genres: string[];
        credits: Array<{ name: string; role: string; character?: string }>;
        imdbId: string;
        tmdbId: string;
      }>;
      manifestationId: string;
    },
  ) {
    const movie = await this.getMovie(movieId);
    const overrides = await this.metadata.getOverrides("movie", movieId);
    const overriddenFields = new Set(overrides.map((o) => o.field));
    const merged = sources.merged;

    const updates: Partial<{
      title: string;
      subtitle: string;
      description: string;
      releaseDate: string;
      runtimeSeconds: number;
      studio: string;
      contentRating: string;
    }> = {};

    if (!overriddenFields.has("title") && merged.title) {
      updates.title = merged.title;
    }
    if (!overriddenFields.has("subtitle") && merged.subtitle) {
      updates.subtitle = merged.subtitle;
    }
    if (!overriddenFields.has("description") && merged.description) {
      updates.description = merged.description;
    }
    if (!overriddenFields.has("releaseDate") && merged.releaseDate) {
      updates.releaseDate = merged.releaseDate;
    }
    if (!overriddenFields.has("runtimeSeconds") && merged.runtimeSeconds) {
      updates.runtimeSeconds = merged.runtimeSeconds;
    }
    if (!overriddenFields.has("studio") && merged.studio) {
      updates.studio = merged.studio;
    }
    if (!overriddenFields.has("contentRating") && merged.contentRating) {
      updates.contentRating = merged.contentRating;
    }

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(schema.movies)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.movies.id, movieId));
    }

    if (!overriddenFields.has("genres") && merged.genres?.length) {
      await this.setGenres(movieId, merged.genres);
    }
    if (!overriddenFields.has("credits") && merged.credits?.length) {
      await this.setCredits(movieId, merged.credits);
    }

    if (merged.imdbId) {
      await this.db
        .update(schema.creativeWorkManifestations)
        .set({
          externalIdType: "imdb",
          externalId: merged.imdbId,
        })
        .where(eq(schema.creativeWorkManifestations.id, sources.manifestationId));
    } else if (merged.tmdbId) {
      await this.db
        .update(schema.creativeWorkManifestations)
        .set({
          externalIdType: "tmdb",
          externalId: merged.tmdbId,
        })
        .where(eq(schema.creativeWorkManifestations.id, sources.manifestationId));
    }

    const titleForSlug = updates.title ?? movie.title;
    await promoteMovieSlugIfPending(this.db, movieId, titleForSlug);
    await this.indexMovie(movieId);
  }

  async createCollection(input: { title: string; description?: string }) {
    const id = await generateUniqueMovieCollectionId(this.db);
    const canonicalSlug = await allocateMovieCollectionCanonicalSlug(
      this.db,
      input.title,
    );
    const identity = canonicalSlug
      ? { id, slug: canonicalSlug, slugStatus: "canonical" as const }
      : pendingMovieCollectionIdentity(id);

    await this.db.insert(schema.movieCollections).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      title: input.title,
      description: input.description,
    });

    return id;
  }

  async updateCollection(
    id: string,
    input: Partial<{ title: string; description: string }>,
  ) {
    const collection = await this.getCollection(id);
    const updates: Partial<{
      title: string;
      description: string;
      slug: string;
      slugStatus: string;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (input.title !== undefined) {
      updates.title = input.title;
      const canonicalSlug = await allocateMovieCollectionCanonicalSlug(
        this.db,
        input.title,
      );
      if (canonicalSlug) {
        updates.slug = canonicalSlug;
        updates.slugStatus = "canonical";
      }
    }
    if (input.description !== undefined) {
      updates.description = input.description;
    }

    await this.db
      .update(schema.movieCollections)
      .set(updates)
      .where(eq(schema.movieCollections.id, collection.id));
  }

  async deleteCollection(id: string) {
    await this.getCollection(id);
    await this.db
      .delete(schema.movieCollections)
      .where(eq(schema.movieCollections.id, id));
  }

  async getCollection(id: string) {
    const collection = await this.db.query.movieCollections.findFirst({
      where: eq(schema.movieCollections.id, id),
    });
    if (!collection) throw new NotFoundError("Collection not found");
    return collection;
  }

  async getCollectionBySlug(slug: string) {
    return getMovieCollectionBySlug(this.db, slug);
  }

  async listCollections(): Promise<MovieCollectionPublic[]> {
    const rows = await this.db
      .select()
      .from(schema.movieCollections)
      .orderBy(asc(schema.movieCollections.title));

    return Promise.all(
      rows.map(async (row) => {
        const countRows = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.movieCollectionItems)
          .where(eq(schema.movieCollectionItems.collectionId, row.id));
        return this.toCollectionPublic(row, countRows[0]?.count ?? 0);
      }),
    );
  }

  async addMovieToCollection(collectionId: string, movieId: string) {
    await this.getCollection(collectionId);
    await this.getMovie(movieId);

    const existing = await this.db.query.movieCollectionItems.findFirst({
      where: and(
        eq(schema.movieCollectionItems.collectionId, collectionId),
        eq(schema.movieCollectionItems.movieId, movieId),
      ),
    });
    if (existing) return;

    const maxOrder = await this.db
      .select({
        max: sql<number>`coalesce(max(${schema.movieCollectionItems.sortOrder}), -1)`,
      })
      .from(schema.movieCollectionItems)
      .where(eq(schema.movieCollectionItems.collectionId, collectionId));

    await this.db.insert(schema.movieCollectionItems).values({
      id: generateId(),
      collectionId,
      movieId,
      sortOrder: (maxOrder[0]?.max ?? -1) + 1,
    });

    await this.db
      .update(schema.movieCollections)
      .set({ updatedAt: new Date() })
      .where(eq(schema.movieCollections.id, collectionId));
  }

  async removeMovieFromCollection(collectionId: string, movieId: string) {
    await this.getCollection(collectionId);
    await this.db
      .delete(schema.movieCollectionItems)
      .where(
        and(
          eq(schema.movieCollectionItems.collectionId, collectionId),
          eq(schema.movieCollectionItems.movieId, movieId),
        ),
      );
    await this.db
      .update(schema.movieCollections)
      .set({ updatedAt: new Date() })
      .where(eq(schema.movieCollections.id, collectionId));
  }

  async reorderCollectionMovies(collectionId: string, movieIds: string[]) {
    await this.getCollection(collectionId);
    for (let i = 0; i < movieIds.length; i++) {
      await this.db
        .update(schema.movieCollectionItems)
        .set({ sortOrder: i })
        .where(
          and(
            eq(schema.movieCollectionItems.collectionId, collectionId),
            eq(schema.movieCollectionItems.movieId, movieIds[i]!),
          ),
        );
    }
    await this.db
      .update(schema.movieCollections)
      .set({ updatedAt: new Date() })
      .where(eq(schema.movieCollections.id, collectionId));
  }

  async getCollectionDetail(
    slug: string,
    userId?: string,
  ): Promise<MovieCollectionPublic & { movies: MovieListItem[] }> {
    const collection = await this.getCollectionBySlug(slug);
    const itemRows = await this.db
      .select({ movieId: schema.movieCollectionItems.movieId })
      .from(schema.movieCollectionItems)
      .where(eq(schema.movieCollectionItems.collectionId, collection.id))
      .orderBy(asc(schema.movieCollectionItems.sortOrder));

    const movies =
      userId != null
        ? await this.listMoviesByIdsForUser(
            userId,
            itemRows.map((r) => r.movieId),
          )
        : [];

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.movieCollectionItems)
      .where(eq(schema.movieCollectionItems.collectionId, collection.id));

    return {
      ...this.toCollectionPublic(collection, countRows[0]?.count ?? 0),
      movies,
    };
  }

  async findDuplicateMovieByChecksum(
    checksum: string,
  ): Promise<{ workType: "movie"; workId: string } | null> {
    const sameChecksum = await this.db
      .select({ movieId: schema.creativeWorkExpressions.workId })
      .from(schema.representationFiles)
      .innerJoin(
        schema.representations,
        eq(schema.representationFiles.representationId, schema.representations.id),
      )
      .innerJoin(schema.files, eq(schema.representationFiles.fileId, schema.files.id))
      .innerJoin(
        schema.creativeWorkManifestations,
        eq(schema.representations.manifestationId, schema.creativeWorkManifestations.id),
      )
      .innerJoin(
        schema.creativeWorkExpressions,
        eq(schema.creativeWorkManifestations.expressionId, schema.creativeWorkExpressions.id),
      )
      .where(
        and(
          eq(schema.files.checksum, checksum),
          eq(schema.creativeWorkExpressions.workType, "movie"),
        ),
      )
      .limit(1);
    if (sameChecksum[0]) {
      return { workType: "movie", workId: sameChecksum[0].movieId };
    }
    return null;
  }

  async createMovieRepresentation(params: {
    fileId: string;
    title: string;
    userId?: string;
    format?: string;
    sortOrder?: number;
  }) {
    const file = await this.files.getFile(params.fileId);
    const format =
      params.format ?? inferFormatFromPath(file.relativePath);

    if (!VIDEO_EXTENSIONS.has(format)) {
      throw new Error("not_a_movie_format");
    }

    const existing = await this.representations.findByFileId(params.fileId);
    if (existing.length > 0) {
      const rep = existing[0]!;
      const manifestation = rep.manifestationId
        ? await this.db.query.creativeWorkManifestations.findFirst({
            where: eq(schema.creativeWorkManifestations.id, rep.manifestationId),
          })
        : undefined;
      const expression = manifestation
        ? await this.db.query.creativeWorkExpressions.findFirst({
            where: eq(schema.creativeWorkExpressions.id, manifestation.expressionId),
          })
        : undefined;
      return {
        movieId: expression?.workId ?? "",
        expressionId: expression?.id ?? "",
        manifestationId: rep.manifestationId,
        representationId: rep.id,
        alreadyLinked: true,
      };
    }

    const movieId = await this.createPendingMovie({ title: params.title });

    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: and(
        eq(schema.creativeWorkExpressions.workType, "movie"),
        eq(schema.creativeWorkExpressions.workId, movieId),
      ),
    });

    const expressionId = expression?.id ?? generateId();
    if (!expression) {
      await this.db.insert(schema.creativeWorkExpressions).values({
        id: expressionId,
        workType: "movie",
        workId: movieId,
      });
    }

    const manifestationId = generateId();
    await this.db.insert(schema.creativeWorkManifestations).values({
      id: manifestationId,
      expressionId,
      label: format,
    });

    const representationId = await this.representations.create({
      format,
      domainModule: "movies",
      manifestationId,
    });

    await this.representations.linkFile(
      representationId,
      params.fileId,
      "content",
      params.sortOrder ?? 0,
    );

    if (params.userId) {
      await this.libraryMembership.ensureWorkMembership(
        params.userId,
        "movie",
        movieId,
      );
    }

    return {
      movieId,
      expressionId,
      manifestationId,
      representationId,
      alreadyLinked: false,
    };
  }

  async associateFile(fileId: string, userId?: string) {
    const file = await this.files.getFile(fileId);
    const format = inferFormatFromPath(file.relativePath);

    if (!VIDEO_EXTENSIONS.has(format)) {
      return { skipped: true as const, reason: "not_a_movie_format" };
    }

    const existing = await this.representations.findByFileId(fileId);
    if (existing.length > 0) {
      return {
        skipped: true as const,
        reason: "already_associated",
        representationId: existing[0]!.id,
      };
    }

    const title = titleFromPath(file.relativePath);
    const created = await this.createMovieRepresentation({
      fileId,
      title,
      userId,
      format,
    });

    await this.indexMovie(created.movieId);

    if (this.jobs) {
      await this.jobs.enqueue(JOB_TYPES.METADATA_INGEST, {
        fileId,
        movieId: created.movieId,
        representationId: created.representationId,
        manifestationId: created.manifestationId,
      });
      await this.jobs.enqueue(JOB_TYPES.MEDIA_PROCESS, {
        representationId: created.representationId,
        fileId,
        domain: "movie",
      });
    }

    return {
      skipped: false as const,
      movieId: created.movieId,
      expressionId: created.expressionId,
      manifestationId: created.manifestationId,
      representationId: created.representationId,
    };
  }

  async indexMovie(movieId: string) {
    const movie = await this.getMovie(movieId);
    const genres = await this.getGenreNames(movieId);
    const directors = await this.getDirectorNames(movieId);
    const creditRows = await this.db
      .select({ name: schema.moviePeople.name })
      .from(schema.movieCredits)
      .innerJoin(
        schema.moviePeople,
        eq(schema.movieCredits.personId, schema.moviePeople.id),
      )
      .where(eq(schema.movieCredits.movieId, movieId));
    const creditNames = creditRows.map((r) => r.name);

    await this.search.upsert({
      entityType: "movie",
      entityId: movieId,
      title: movie.title,
      body: [
        movie.subtitle,
        movie.description,
        movie.studio,
        movie.contentRating,
        ...genres,
        ...directors,
        ...creditNames,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  async listAllMovieIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.movies.id })
      .from(schema.movies);
    return rows.map((r) => r.id);
  }

  async getPrimaryRepresentationId(
    movieId: string,
    userId?: string,
  ): Promise<string | null> {
    const reps = await this.representationsForMovie(movieId);
    if (reps.length === 0) return null;

    if (userId) {
      const progress = await this.userState.getProgress(userId, "movie", movieId);
      if (
        progress?.representationId &&
        reps.some((r) => r.id === progress.representationId)
      ) {
        return progress.representationId;
      }
    }

    const available = reps.find((r) => !r.unavailableAt);
    return available?.id ?? reps[0]?.id ?? null;
  }

  private async searchMoviesByTitle(
    movieIds: string[],
    q: string,
  ): Promise<string[]> {
    if (movieIds.length === 0) return [];
    const pattern = `%${q}%`;
    const rows = await this.db
      .select({ id: schema.movies.id })
      .from(schema.movies)
      .where(
        and(
          inArray(schema.movies.id, movieIds),
          or(
            ilike(schema.movies.title, pattern),
            ilike(schema.movies.subtitle, pattern),
          ),
        ),
      );
    return rows.map((r) => r.id);
  }

  private async toListItem(
    movie: typeof schema.movies.$inferSelect,
    userId: string,
    addedAt?: Date,
  ): Promise<MovieListItem> {
    const genres = await this.getGenreNames(movie.id);
    const directors = await this.getDirectorNames(movie.id);
    const favorite = await this.userState.getFavorite(
      userId,
      "movie",
      movie.id,
    );
    const rating = await this.userState.getRating(userId, "movie", movie.id);
    const progressRow = await this.userState.getProgress(
      userId,
      "movie",
      movie.id,
    );
    const progress =
      progressRow?.locator && isPlaybackProgressLocator(progressRow.locator)
        ? progressRow.locator
        : null;
    const reps = await this.representationsForMovie(movie.id);
    const primaryRepresentationId = await this.getPrimaryRepresentationId(
      movie.id,
      userId,
    );

    return {
      ...this.toPublic(movie),
      genres,
      directors,
      favorite,
      rating,
      progress,
      addedAt: addedAt?.toISOString() ?? null,
      representationFormats: [...new Set(reps.map((r) => r.format))],
      primaryRepresentationId,
    };
  }

  private async getCreditsForMovie(movieId: string): Promise<MovieCreditPublic[]> {
    const rows = await this.db
      .select({
        id: schema.movieCredits.id,
        personId: schema.movieCredits.personId,
        personSlug: schema.moviePeople.slug,
        name: schema.moviePeople.name,
        role: schema.movieCredits.role,
        character: schema.movieCredits.character,
        sortOrder: schema.movieCredits.sortOrder,
      })
      .from(schema.movieCredits)
      .innerJoin(
        schema.moviePeople,
        eq(schema.movieCredits.personId, schema.moviePeople.id),
      )
      .where(eq(schema.movieCredits.movieId, movieId))
      .orderBy(asc(schema.movieCredits.sortOrder));

    return rows.map((row) => ({
      id: row.id,
      personId: row.personId,
      personSlug: row.personSlug,
      name: row.name,
      role: row.role,
      character: row.character,
      sortOrder: row.sortOrder,
    }));
  }

  private async getCollectionsForMovie(
    movieId: string,
  ): Promise<MovieCollectionPublic[]> {
    const rows = await this.db
      .select({ collection: schema.movieCollections })
      .from(schema.movieCollectionItems)
      .innerJoin(
        schema.movieCollections,
        eq(schema.movieCollectionItems.collectionId, schema.movieCollections.id),
      )
      .where(eq(schema.movieCollectionItems.movieId, movieId))
      .orderBy(asc(schema.movieCollectionItems.sortOrder));

    return rows.map((row) => this.toCollectionPublic(row.collection));
  }

  private async getGenreNames(movieId: string) {
    const rows = await this.db
      .select({ name: schema.movieGenres.name })
      .from(schema.movieGenres)
      .where(eq(schema.movieGenres.movieId, movieId));
    return rows.map((r) => r.name);
  }

  private async getDirectorNames(movieId: string) {
    const rows = await this.db
      .select({ name: schema.moviePeople.name })
      .from(schema.movieCredits)
      .innerJoin(
        schema.moviePeople,
        eq(schema.movieCredits.personId, schema.moviePeople.id),
      )
      .where(
        and(
          eq(schema.movieCredits.movieId, movieId),
          ilike(schema.movieCredits.role, "director"),
        ),
      )
      .orderBy(asc(schema.movieCredits.sortOrder));
    return rows.map((r) => r.name);
  }

  async deriveRepresentationRuntime(
    representationId: string,
  ): Promise<number | null> {
    const fileLinks =
      await this.representations.listFilesForRepresentation(representationId);
    if (fileLinks.length === 0) return null;

    let total = 0;
    let hasDuration = false;
    for (const link of fileLinks) {
      const duration = await this.getFileDurationSeconds(link.fileId);
      if (duration != null) {
        total += duration;
        hasDuration = true;
      }
    }
    return hasDuration ? total : null;
  }

  private async getFileDurationSeconds(
    fileId: string,
  ): Promise<number | null> {
    const technical = await this.db.query.fileTechnicalMetadata.findFirst({
      where: eq(schema.fileTechnicalMetadata.fileId, fileId),
    });
    const duration = technical?.payload?.durationSeconds;
    return typeof duration === "number" ? duration : null;
  }

  private async representationsForMovie(movieId: string) {
    const expressions = await this.db
      .select({ id: schema.creativeWorkExpressions.id })
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          eq(schema.creativeWorkExpressions.workType, "movie"),
          eq(schema.creativeWorkExpressions.workId, movieId),
        ),
      );

    if (expressions.length === 0) return [];

    const manifestationIds = (
      await this.db
        .select({ id: schema.creativeWorkManifestations.id })
        .from(schema.creativeWorkManifestations)
        .where(
          inArray(
            schema.creativeWorkManifestations.expressionId,
            expressions.map((e) => e.id),
          ),
        )
    ).map((m) => m.id);

    if (manifestationIds.length === 0) return [];

    return this.db
      .select()
      .from(schema.representations)
      .where(inArray(schema.representations.manifestationId, manifestationIds));
  }

  toCollectionPublic(
    collection: typeof schema.movieCollections.$inferSelect,
    movieCount?: number,
  ): MovieCollectionPublic {
    return {
      id: collection.id,
      slug: collection.slug,
      slugStatus: collection.slugStatus as "pending" | "canonical",
      title: collection.title,
      description: collection.description,
      coverFileId: collection.coverFileId,
      movieCount,
      createdAt: collection.createdAt.toISOString(),
      updatedAt: collection.updatedAt.toISOString(),
    };
  }

  toPublic(movie: typeof schema.movies.$inferSelect) {
    return {
      id: movie.id,
      slug: movie.slug,
      slugStatus: movie.slugStatus as "pending" | "canonical",
      title: movie.title,
      subtitle: movie.subtitle,
      description: movie.description,
      releaseDate: movie.releaseDate,
      runtimeSeconds: movie.runtimeSeconds,
      studio: movie.studio,
      contentRating: movie.contentRating,
      coverFileId: movie.coverFileId,
      createdAt: movie.createdAt.toISOString(),
      updatedAt: movie.updatedAt.toISOString(),
    };
  }
}
