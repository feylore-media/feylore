import {
  eq,
  and,
  inArray,
  ilike,
  asc,
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
  TvShowListQuery,
  TvShowListItem,
  TvShowDetail,
  TvSeasonDetail,
  TvEpisodeDetail,
  TvEpisodeListItem,
  TvContinueEpisode,
  TvSeasonProgress,
  TvCreditPublic,
} from "../../../shared/tv.js";
import type { PlaybackLocator } from "../../../shared/playback.js";
import { isPlaybackProgressLocator } from "../../../shared/progress-locator.js";
import {
  allocateTvPersonCanonicalSlug,
  allocateTvShowCanonicalSlug,
  generateUniqueTvEpisodeId,
  generateUniqueTvPersonId,
  generateUniqueTvShowId,
  getTvShowBySlug,
  pendingTvShowIdentity,
  promoteTvShowSlugIfPending,
} from "./identity.js";
import {
  compareEpisodes,
  getNextEpisode,
  isEpisodeProgressCompleted,
  listEpisodesForQueue,
  resolveContinueEpisode,
  type EpisodeOrderFields,
  type EpisodeProgressEntry,
} from "./episode-order.js";
import { parseTvPath } from "./import-heuristics.js";

export const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mkv",
  "webm",
  "video",
  "mov",
  "avi",
]);

type ShowRow = typeof schema.tvShows.$inferSelect;
type SeasonRow = typeof schema.tvSeasons.$inferSelect;
type EpisodeRow = typeof schema.tvEpisodes.$inferSelect;

export class TvService {
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

  async createShow(input: {
    title: string;
    subtitle?: string;
    description?: string;
    premiereDate?: string;
    studio?: string;
    contentRating?: string;
    genres?: string[];
  }) {
    const id = await generateUniqueTvShowId(this.db);
    const canonicalSlug = await allocateTvShowCanonicalSlug(this.db, input.title);
    const identity = canonicalSlug
      ? { id, slug: canonicalSlug, slugStatus: "canonical" as const }
      : pendingTvShowIdentity(id);

    await this.db.insert(schema.tvShows).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      title: input.title,
      subtitle: input.subtitle,
      description: input.description,
      premiereDate: input.premiereDate,
      studio: input.studio,
      contentRating: input.contentRating,
    });

    if (input.genres?.length) await this.setGenres(id, input.genres);
    await this.indexShow(id);
    return id;
  }

  async updateShow(
    id: string,
    input: Partial<{
      title: string;
      subtitle: string;
      description: string;
      premiereDate: string;
      studio: string;
      contentRating: string;
    }>,
  ) {
    const show = await this.getShow(id);
    await this.db
      .update(schema.tvShows)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.tvShows.id, id));

    if (input.title) {
      await promoteTvShowSlugIfPending(this.db, id, input.title);
    } else if (show.slugStatus === "pending") {
      await promoteTvShowSlugIfPending(this.db, id, show.title);
    }

    await this.indexShow(id);
  }

  async deleteShow(id: string) {
    await this.getShow(id);
    const episodes = await this.listEpisodesForShow(id);
    for (const episode of episodes) {
      await this.search.remove("tv_episode", episode.id);
    }
    await this.search.remove("show", id);
    await this.db.delete(schema.tvShows).where(eq(schema.tvShows.id, id));
  }

  async getShow(id: string) {
    const show = await this.db.query.tvShows.findFirst({
      where: eq(schema.tvShows.id, id),
    });
    if (!show) throw new NotFoundError("TV show not found");
    return show;
  }

  async getShowByRef(ref: string) {
    return getTvShowBySlug(this.db, ref);
  }

  async ensureUserAccess(userId: string, showId: string) {
    const membership = await this.libraryMembership.listForUser(userId, "show");
    if (!membership.some((m) => m.targetId === showId)) {
      throw new ForbiddenError("TV show not in your library");
    }
  }

  async listShowsForUser(
    userId: string,
    query: TvShowListQuery = {} as TvShowListQuery,
  ) {
    const memberships = await this.libraryMembership.listForUser(userId, "show");
    if (memberships.length === 0) {
      return { items: [] as TvShowListItem[], nextCursor: undefined };
    }

    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );
    let showIds = memberships.map((m) => m.targetId);

    if (query.q) {
      const searchResults = await this.search.query({
        q: query.q,
        types: ["show"],
        limit: 200,
      });
      const searchedIds = new Set(searchResults.results.map((r) => r.id));
      showIds = showIds.filter((id) => searchedIds.has(id));
    }

    if (query.genre) {
      const genreRows = await this.db
        .select({ showId: schema.tvGenres.showId })
        .from(schema.tvGenres)
        .where(ilike(schema.tvGenres.name, `%${query.genre}%`));
      const ids = new Set(genreRows.map((r) => r.showId));
      showIds = showIds.filter((id) => ids.has(id));
    }

    if (query.favorite === true) {
      const favRows = await this.db
        .select({ subjectId: schema.userFavorites.subjectId })
        .from(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, "show"),
          ),
        );
      const favIds = new Set(favRows.map((r) => r.subjectId));
      showIds = showIds.filter((id) => favIds.has(id));
    } else if (query.favorite === false) {
      const favRows = await this.db
        .select({ subjectId: schema.userFavorites.subjectId })
        .from(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, "show"),
          ),
        );
      const favIds = new Set(favRows.map((r) => r.subjectId));
      showIds = showIds.filter((id) => !favIds.has(id));
    }

    if (query.view === "continue") {
      const continueShows = await this.listContinueEpisodesForUser(userId, 500);
      const continueShowIds = new Set(continueShows.map((item) => item.showId));
      showIds = showIds.filter((id) => continueShowIds.has(id));
    }

    if (showIds.length === 0) {
      return { items: [] as TvShowListItem[], nextCursor: undefined };
    }

    const shows = await this.db
      .select()
      .from(schema.tvShows)
      .where(inArray(schema.tvShows.id, showIds));

    const sortField = query.sort ?? "title";
    const sortOrder = query.order ?? "asc";
    shows.sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortField === "updatedAt") {
        cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
      } else if (sortField === "addedAt") {
        const aAdded = membershipMap.get(a.id)?.getTime() ?? 0;
        const bAdded = membershipMap.get(b.id)?.getTime() ?? 0;
        cmp = aAdded - bAdded;
      } else if (sortField === "premiereDate") {
        cmp = (a.premiereDate ?? "").localeCompare(b.premiereDate ?? "");
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });

    if (query.view === "recent") {
      shows.sort((a, b) => {
        const aAdded = membershipMap.get(a.id)?.getTime() ?? 0;
        const bAdded = membershipMap.get(b.id)?.getTime() ?? 0;
        return bAdded - aAdded;
      });
    }

    const limit = query.limit ?? 50;
    const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
    const page = shows.slice(offset, offset + limit + 1);
    const hasMore = page.length > limit;
    const pageShows = hasMore ? page.slice(0, limit) : page;

    const items = await Promise.all(
      pageShows.map((show) =>
        this.toListItem(show, userId, membershipMap.get(show.id)),
      ),
    );

    return {
      items,
      nextCursor: hasMore ? String(offset + limit) : undefined,
    };
  }

  async getShowDetail(showId: string, userId?: string): Promise<TvShowDetail> {
    const show = await this.getShow(showId);
    const seasons = await this.listSeasonsForShow(showId);
    const genres = await this.getGenreNames(showId);
    const credits = await this.getCreditsForShow(showId);
    const overrides = await this.metadata.getOverrides("show", showId);
    const episodes = await this.listEpisodesWithSeasonNumbers(showId);

    let favorite = false;
    let rating: number | null = null;
    let continueEpisode: TvContinueEpisode | null = null;
    let seasonProgress: TvSeasonProgress[] = [];

    if (userId) {
      favorite = await this.userState.getFavorite(userId, "show", showId);
      rating = await this.userState.getRating(userId, "show", showId);
      const progressMap = await this.buildEpisodeProgressMap(userId, episodes);
      continueEpisode = await this.toContinueEpisode(
        resolveContinueEpisode(episodes, progressMap),
        progressMap,
      );
      seasonProgress = await this.buildSeasonProgress(
        seasons,
        episodes,
        progressMap,
      );
    } else {
      seasonProgress = seasons.map((season) => ({
        seasonNumber: season.seasonNumber,
        watchedCount: 0,
        totalEpisodes: episodes.filter((e) => e.seasonNumber === season.seasonNumber)
          .length,
        nextEpisode: null,
      }));
    }

    const overrideMap: Record<string, unknown> = {};
    for (const o of overrides) {
      overrideMap[o.field] = o.value;
    }

    const effective = this.applyShowOverrides(show, overrideMap);

    return {
      ...this.toShowPublic(effective),
      genres,
      credits,
      seasons: seasons.map((season) => this.toSeasonPublic(season)),
      seasonProgress,
      continueEpisode,
      userState: { favorite, rating },
      overrides: overrideMap,
    };
  }

  async createSeason(
    showId: string,
    input: { seasonNumber: number; title?: string; description?: string },
  ) {
    await this.getShow(showId);
    const existing = await this.db.query.tvSeasons.findFirst({
      where: and(
        eq(schema.tvSeasons.showId, showId),
        eq(schema.tvSeasons.seasonNumber, input.seasonNumber),
      ),
    });
    if (existing) return existing.id;

    const id = generateId();
    await this.db.insert(schema.tvSeasons).values({
      id,
      showId,
      seasonNumber: input.seasonNumber,
      title: input.title,
      description: input.description,
    });
    return id;
  }

  async listSeasonsForShow(showId: string) {
    return this.db
      .select()
      .from(schema.tvSeasons)
      .where(eq(schema.tvSeasons.showId, showId))
      .orderBy(asc(schema.tvSeasons.seasonNumber));
  }

  async getSeason(showId: string, seasonId: string) {
    const season = await this.db.query.tvSeasons.findFirst({
      where: and(
        eq(schema.tvSeasons.id, seasonId),
        eq(schema.tvSeasons.showId, showId),
      ),
    });
    if (!season) throw new NotFoundError("TV season not found");
    return season;
  }

  async getSeasonDetail(
    showId: string,
    seasonId: string,
    userId?: string,
  ): Promise<TvSeasonDetail> {
    const show = await this.getShow(showId);
    const season = await this.getSeason(showId, seasonId);
    const episodes = await this.listEpisodesForSeason(seasonId);
    const episodesWithSeason = episodes.map((episode) => ({
      ...episode,
      seasonNumber: season.seasonNumber,
    }));

    let progress: TvSeasonProgress = {
      seasonNumber: season.seasonNumber,
      watchedCount: 0,
      totalEpisodes: episodes.length,
      nextEpisode: null,
    };

    const episodeItems = await Promise.all(
      episodesWithSeason.map((episode) =>
        this.toEpisodeListItem(episode, userId),
      ),
    );

    if (userId) {
      const progressMap = await this.buildEpisodeProgressMap(
        userId,
        episodesWithSeason,
      );
      const [seasonProgress] = await this.buildSeasonProgress(
        [season],
        episodesWithSeason,
        progressMap,
      );
      progress = seasonProgress ?? progress;
    }

    return {
      ...this.toSeasonPublic(season),
      showSlug: show.slug,
      showTitle: show.title,
      episodes: episodeItems,
      progress,
    };
  }

  async deleteSeason(showId: string, seasonId: string) {
    const season = await this.getSeason(showId, seasonId);
    const episodes = await this.listEpisodesForSeason(season.id);
    for (const episode of episodes) {
      await this.search.remove("tv_episode", episode.id);
    }
    await this.db.delete(schema.tvSeasons).where(eq(schema.tvSeasons.id, season.id));
  }

  async createEpisode(
    showId: string,
    seasonId: string,
    input: {
      episodeNumber: number;
      sortOrder?: number;
      title: string;
      description?: string;
      airDate?: string;
      runtimeSeconds?: number;
    },
  ) {
    await this.getSeason(showId, seasonId);
    const id = await generateUniqueTvEpisodeId(this.db);

    await this.db.insert(schema.tvEpisodes).values({
      id,
      showId,
      seasonId,
      episodeNumber: input.episodeNumber,
      sortOrder: input.sortOrder ?? 0,
      title: input.title,
      description: input.description,
      airDate: input.airDate,
      runtimeSeconds: input.runtimeSeconds,
    });

    const expressionId = generateId();
    await this.db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "tv_episode",
      workId: id,
      label: "default",
    });

    await this.db.insert(schema.creativeWorkManifestations).values({
      id: generateId(),
      expressionId,
      label: "default",
    });

    await this.indexEpisode(id);
    return id;
  }

  async updateEpisode(
    showId: string,
    episodeId: string,
    input: Partial<{
      episodeNumber: number;
      sortOrder: number;
      title: string;
      description: string;
      airDate: string;
      runtimeSeconds: number;
    }>,
  ) {
    await this.getEpisode(showId, episodeId);
    await this.db
      .update(schema.tvEpisodes)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.tvEpisodes.id, episodeId));
    await this.indexEpisode(episodeId);
  }

  async deleteEpisode(showId: string, episodeId: string) {
    await this.getEpisode(showId, episodeId);
    await this.search.remove("tv_episode", episodeId);
    await this.db.delete(schema.tvEpisodes).where(eq(schema.tvEpisodes.id, episodeId));
  }

  async getEpisode(showId: string, episodeId: string) {
    const episode = await this.db.query.tvEpisodes.findFirst({
      where: and(
        eq(schema.tvEpisodes.id, episodeId),
        eq(schema.tvEpisodes.showId, showId),
      ),
    });
    if (!episode) throw new NotFoundError("TV episode not found");
    return episode;
  }

  async getEpisodeById(episodeId: string) {
    const episode = await this.db.query.tvEpisodes.findFirst({
      where: eq(schema.tvEpisodes.id, episodeId),
    });
    if (!episode) throw new NotFoundError("TV episode not found");
    return episode;
  }

  async getEpisodeWemIds(episodeId: string) {
    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: and(
        eq(schema.creativeWorkExpressions.workType, "tv_episode"),
        eq(schema.creativeWorkExpressions.workId, episodeId),
      ),
    });
    if (!expression) {
      return { expressionId: null as string | null, manifestationId: null as string | null };
    }

    const manifestation = await this.db.query.creativeWorkManifestations.findFirst({
      where: eq(schema.creativeWorkManifestations.expressionId, expression.id),
    });

    return {
      expressionId: expression.id,
      manifestationId: manifestation?.id ?? null,
    };
  }

  async resolveEpisodeByNumbers(
    showSlug: string,
    seasonNumber: number,
    episodeNumber: number,
    sortOrder = 0,
  ) {
    const show = await this.getShowByRef(showSlug);
    const season = await this.db.query.tvSeasons.findFirst({
      where: and(
        eq(schema.tvSeasons.showId, show.id),
        eq(schema.tvSeasons.seasonNumber, seasonNumber),
      ),
    });
    if (!season) throw new NotFoundError("TV season not found");

    const episode = await this.db.query.tvEpisodes.findFirst({
      where: and(
        eq(schema.tvEpisodes.seasonId, season.id),
        eq(schema.tvEpisodes.episodeNumber, episodeNumber),
        eq(schema.tvEpisodes.sortOrder, sortOrder),
      ),
    });
    if (!episode) throw new NotFoundError("TV episode not found");
    return { show, season, episode };
  }

  async getEpisodeDetail(
    showId: string,
    episodeId: string,
    userId?: string,
  ): Promise<TvEpisodeDetail> {
    const show = await this.getShow(showId);
    const episode = await this.getEpisode(showId, episodeId);
    const season = await this.db.query.tvSeasons.findFirst({
      where: eq(schema.tvSeasons.id, episode.seasonId),
    });
    if (!season) throw new NotFoundError("TV season not found");

    const reps = await this.representationsForEpisode(episodeId);
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

    const overrides = await this.metadata.getOverrides("tv_episode", episodeId);
    const overrideMap: Record<string, unknown> = {};
    for (const o of overrides) {
      overrideMap[o.field] = o.value;
    }

    let progress: PlaybackLocator | null = null;
    let progressRepresentationId: string | null = null;
    let completed = false;
    let nextEpisode: TvContinueEpisode | null = null;

    if (userId) {
      const progressRow = await this.userState.getProgress(
        userId,
        "tv_episode",
        episodeId,
      );
      progress =
        progressRow?.locator && isPlaybackProgressLocator(progressRow.locator)
          ? progressRow.locator
          : null;
      progressRepresentationId = progressRow?.representationId ?? null;
      completed = isEpisodeProgressCompleted(progress);

      const episodes = await this.listEpisodesWithSeasonNumbers(showId);
      const progressMap = await this.buildEpisodeProgressMap(userId, episodes);
      const next = getNextEpisode(episodes, episodeId, progressMap);
      nextEpisode = await this.toContinueEpisode(next, progressMap);
    }

    const effective = this.applyEpisodeOverrides(episode, overrideMap);

    return {
      ...this.toEpisodePublic(effective, season.seasonNumber),
      showSlug: show.slug,
      showTitle: show.title,
      representations: representationsWithFiles,
      userState: {
        progress,
        progressRepresentationId,
        completed,
      },
      nextEpisode,
      overrides: overrideMap,
    };
  }

  async setFavorite(userId: string, showId: string, favorite: boolean) {
    await this.ensureUserAccess(userId, showId);
    await this.userState.setFavorite(userId, "show", showId, favorite);
  }

  async setRating(userId: string, showId: string, rating: number | null) {
    await this.ensureUserAccess(userId, showId);
    await this.userState.setRating(userId, "show", showId, rating);
  }

  async setGenres(showId: string, genres: string[]) {
    await this.getShow(showId);
    await this.db
      .delete(schema.tvGenres)
      .where(eq(schema.tvGenres.showId, showId));
    for (const name of genres) {
      await this.db.insert(schema.tvGenres).values({
        id: generateId(),
        showId,
        name,
      });
    }
    await this.indexShow(showId);
  }

  async setCredits(
    showId: string,
    credits: Array<{ name: string; role: string; character?: string }>,
  ) {
    await this.getShow(showId);
    await this.db
      .delete(schema.tvCredits)
      .where(eq(schema.tvCredits.showId, showId));

    for (let i = 0; i < credits.length; i++) {
      const credit = credits[i]!;
      const personId = await this.findOrCreatePersonByName(credit.name);
      await this.db.insert(schema.tvCredits).values({
        id: generateId(),
        showId,
        personId,
        role: credit.role,
        character: credit.character,
        sortOrder: i,
      });
    }
    await this.indexShow(showId);
  }

  async findOrCreatePersonByName(name: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("person_name_required");

    const existing = await this.db
      .select({ id: schema.tvPeople.id })
      .from(schema.tvPeople)
      .where(ilike(schema.tvPeople.name, trimmed))
      .limit(1);
    if (existing[0]) return existing[0].id;

    const id = await generateUniqueTvPersonId(this.db);
    const canonicalSlug = await allocateTvPersonCanonicalSlug(this.db, trimmed);
    const identity = canonicalSlug
      ? { id, slug: canonicalSlug, slugStatus: "canonical" as const }
      : pendingTvShowIdentity(id);
    await this.db.insert(schema.tvPeople).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      name: trimmed,
    });
    return id;
  }

  async createEpisodeRepresentation(params: {
    episodeId: string;
    fileId: string;
    userId?: string;
    format?: string;
    sortOrder?: number;
  }) {
    const episode = await this.db.query.tvEpisodes.findFirst({
      where: eq(schema.tvEpisodes.id, params.episodeId),
    });
    if (!episode) throw new NotFoundError("TV episode not found");

    const file = await this.files.getFile(params.fileId);
    const format =
      params.format ?? inferFormatFromPath(file.relativePath);

    if (!VIDEO_EXTENSIONS.has(format)) {
      throw new Error("not_a_tv_format");
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
            where: eq(
              schema.creativeWorkExpressions.id,
              manifestation.expressionId,
            ),
          })
        : undefined;
      return {
        episodeId: expression?.workId ?? episode.id,
        expressionId: expression?.id ?? "",
        manifestationId: rep.manifestationId,
        representationId: rep.id,
        alreadyLinked: true,
      };
    }

    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: and(
        eq(schema.creativeWorkExpressions.workType, "tv_episode"),
        eq(schema.creativeWorkExpressions.workId, episode.id),
      ),
    });

    const expressionId = expression?.id ?? generateId();
    if (!expression) {
      await this.db.insert(schema.creativeWorkExpressions).values({
        id: expressionId,
        workType: "tv_episode",
        workId: episode.id,
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
      domainModule: "tv",
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
        "show",
        episode.showId,
      );
    }

    return {
      episodeId: episode.id,
      expressionId,
      manifestationId,
      representationId,
      alreadyLinked: false,
    };
  }

  async importFiles(fileIds: string[], userId?: string) {
    const results: Array<{
      fileId: string;
      showId?: string;
      episodeId?: string;
      representationId?: string;
      skipped?: boolean;
      reason?: string;
    }> = [];

    for (const fileId of fileIds) {
      try {
        const file = await this.files.getFile(fileId);
        const format = inferFormatFromPath(file.relativePath);
        if (!VIDEO_EXTENSIONS.has(format)) {
          results.push({ fileId, skipped: true, reason: "not_a_tv_format" });
          continue;
        }

        const parsed = parseTvPath(file.relativePath);
        if (!parsed) {
          results.push({ fileId, skipped: true, reason: "unrecognized_tv_path" });
          continue;
        }

        const showId = await this.findOrCreateShowByTitle(parsed.showTitle);
        const seasonId = await this.createSeason(showId, {
          seasonNumber: parsed.seasonNumber,
          title:
            parsed.seasonNumber === 0
              ? "Specials"
              : `Season ${parsed.seasonNumber}`,
        });

        const episodeId = await this.findOrCreateEpisodeByNumbers(showId, seasonId, {
          episodeNumber: parsed.episodeNumber,
          title: parsed.episodeTitle ?? titleFromPath(file.relativePath),
        });

        const created = await this.createEpisodeRepresentation({
          episodeId,
          fileId,
          userId,
          format,
        });

        if (userId) {
          await this.libraryMembership.ensureWorkMembership(userId, "show", showId);
        }
        await this.indexShow(showId);
        await this.indexEpisode(episodeId);

        if (this.jobs && !created.alreadyLinked) {
          await this.jobs.enqueue(JOB_TYPES.MEDIA_PROCESS, {
            representationId: created.representationId,
            fileId,
            domain: "tv",
          });
        }

        results.push({
          fileId,
          showId,
          episodeId,
          representationId: created.representationId,
        });
      } catch (error) {
        results.push({
          fileId,
          skipped: true,
          reason: error instanceof Error ? error.message : "import_failed",
        });
      }
    }

    return results;
  }

  async listContinueEpisodesForUser(userId: string, limit = 20) {
    const memberships = await this.libraryMembership.listForUser(userId, "show");
    if (memberships.length === 0) return [];

    const showIds = memberships.map((m) => m.targetId);
    const shows = await this.db
      .select()
      .from(schema.tvShows)
      .where(inArray(schema.tvShows.id, showIds));
    const showMap = new Map(shows.map((show) => [show.id, show]));

    const items: Array<{
      showId: string;
      showSlug: string;
      showTitle: string;
      continueEpisode: TvContinueEpisode;
      updatedAt: Date;
    }> = [];

    for (const showId of showIds) {
      const show = showMap.get(showId);
      if (!show) continue;

      const episodes = await this.listEpisodesWithSeasonNumbers(showId);
      if (episodes.length === 0) continue;

      const progressMap = await this.buildEpisodeProgressMap(userId, episodes);
      const next = resolveContinueEpisode(episodes, progressMap);
      if (!next) continue;

      const progress = progressMap.get(next.id);
      const continueEpisode = await this.toContinueEpisode(next, progressMap);
      if (!continueEpisode) continue;

      const progressRow = await this.userState.getProgress(
        userId,
        "tv_episode",
        next.id,
      );

      items.push({
        showId: show.id,
        showSlug: show.slug,
        showTitle: show.title,
        continueEpisode,
        updatedAt: progressRow?.updatedAt
          ? new Date(progressRow.updatedAt)
          : new Date(0),
      });

      void progress;
    }

    items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return items.slice(0, limit);
  }

  async listAllShowIds(): Promise<string[]> {
    const rows = await this.db.select({ id: schema.tvShows.id }).from(schema.tvShows);
    return rows.map((r) => r.id);
  }

  async listAllEpisodeIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.tvEpisodes.id })
      .from(schema.tvEpisodes);
    return rows.map((r) => r.id);
  }

  async indexShow(showId: string) {
    const show = await this.getShow(showId);
    const genres = await this.getGenreNames(showId);
    const creditRows = await this.db
      .select({ name: schema.tvPeople.name })
      .from(schema.tvCredits)
      .innerJoin(
        schema.tvPeople,
        eq(schema.tvCredits.personId, schema.tvPeople.id),
      )
      .where(eq(schema.tvCredits.showId, showId));
    const creditNames = creditRows.map((r) => r.name);

    await this.search.upsert({
      entityType: "show",
      entityId: showId,
      title: show.title,
      body: [
        show.subtitle,
        show.description,
        show.studio,
        show.contentRating,
        ...genres,
        ...creditNames,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  async indexEpisode(episodeId: string) {
    const episode = await this.db.query.tvEpisodes.findFirst({
      where: eq(schema.tvEpisodes.id, episodeId),
    });
    if (!episode) return;

    await this.search.upsert({
      entityType: "tv_episode",
      entityId: episodeId,
      title: episode.title,
      body: [episode.description, episode.airDate].filter(Boolean).join(" "),
    });
  }

  async getPrimaryRepresentationId(
    episodeId: string,
    userId?: string,
  ): Promise<string | null> {
    const reps = await this.representationsForEpisode(episodeId);
    if (reps.length === 0) return null;

    if (userId) {
      const progress = await this.userState.getProgress(
        userId,
        "tv_episode",
        episodeId,
      );
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

  resolveCoverFileId(
    episode: Pick<EpisodeRow, "coverFileId">,
    season: Pick<SeasonRow, "coverFileId">,
    show: Pick<ShowRow, "coverFileId">,
  ): string | null {
    return episode.coverFileId ?? season.coverFileId ?? show.coverFileId ?? null;
  }

  async findEpisodeIdForRepresentation(
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
    if (!expression || expression.workType !== "tv_episode") return null;
    return expression.workId;
  }

  async ensureRepresentationAccess(userId: string, representationId: string) {
    const episodeId = await this.findEpisodeIdForRepresentation(representationId);
    if (!episodeId) throw new ForbiddenError("Representation not accessible");

    const episode = await this.db.query.tvEpisodes.findFirst({
      where: eq(schema.tvEpisodes.id, episodeId),
    });
    if (!episode) throw new ForbiddenError("Representation not accessible");

    await this.ensureUserAccess(userId, episode.showId);
    return { showId: episode.showId, episodeId };
  }

  listEpisodesForPlaybackQueue(showId: string, startEpisodeId: string, userId: string) {
    return this.listEpisodesWithSeasonNumbers(showId).then(async (episodes) => {
      const progressMap = await this.buildEpisodeProgressMap(userId, episodes);
      return listEpisodesForQueue(episodes, startEpisodeId, progressMap);
    });
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

  private async findOrCreateShowByTitle(title: string) {
    const existing = await this.db
      .select({ id: schema.tvShows.id })
      .from(schema.tvShows)
      .where(ilike(schema.tvShows.title, title.trim()))
      .limit(1);
    if (existing[0]) return existing[0].id;

    return this.createShow({ title: title.trim() });
  }

  private async findOrCreateEpisodeByNumbers(
    showId: string,
    seasonId: string,
    input: { episodeNumber: number; title: string; sortOrder?: number },
  ) {
    const existing = await this.db.query.tvEpisodes.findFirst({
      where: and(
        eq(schema.tvEpisodes.seasonId, seasonId),
        eq(schema.tvEpisodes.episodeNumber, input.episodeNumber),
        eq(schema.tvEpisodes.sortOrder, input.sortOrder ?? 0),
      ),
    });
    if (existing) return existing.id;

    return this.createEpisode(showId, seasonId, {
      episodeNumber: input.episodeNumber,
      sortOrder: input.sortOrder,
      title: input.title,
    });
  }

  private async listEpisodesForShow(showId: string) {
    return this.db
      .select()
      .from(schema.tvEpisodes)
      .where(eq(schema.tvEpisodes.showId, showId));
  }

  private async listEpisodesForSeason(seasonId: string) {
    return this.db
      .select()
      .from(schema.tvEpisodes)
      .where(eq(schema.tvEpisodes.seasonId, seasonId))
      .orderBy(
        asc(schema.tvEpisodes.episodeNumber),
        asc(schema.tvEpisodes.sortOrder),
      );
  }

  private async listEpisodesWithSeasonNumbers(
    showId: string,
  ): Promise<Array<EpisodeRow & { seasonNumber: number }>> {
    const rows = await this.db
      .select({
        episode: schema.tvEpisodes,
        seasonNumber: schema.tvSeasons.seasonNumber,
      })
      .from(schema.tvEpisodes)
      .innerJoin(
        schema.tvSeasons,
        eq(schema.tvEpisodes.seasonId, schema.tvSeasons.id),
      )
      .where(eq(schema.tvEpisodes.showId, showId));

    return rows
      .map((row) => ({
        ...row.episode,
        seasonNumber: row.seasonNumber,
      }))
      .sort((a, b) => compareEpisodes(a, b));
  }

  private async buildEpisodeProgressMap(
    userId: string,
    episodes: EpisodeOrderFields[],
  ): Promise<Map<string, EpisodeProgressEntry>> {
    const map = new Map<string, EpisodeProgressEntry>();
    for (const episode of episodes) {
      const progress = await this.userState.getProgress(
        userId,
        "tv_episode",
        episode.id,
      );
      map.set(
        episode.id,
        progress?.locator && isPlaybackProgressLocator(progress.locator)
          ? progress.locator
          : null,
      );
    }
    return map;
  }

  private async buildSeasonProgress(
    seasons: SeasonRow[],
    episodes: Array<EpisodeRow & { seasonNumber: number }>,
    progressMap: Map<string, EpisodeProgressEntry>,
  ): Promise<TvSeasonProgress[]> {
    return seasons.map((season) => {
      const seasonEpisodes = episodes.filter(
        (episode) => episode.seasonNumber === season.seasonNumber,
      );
      const watchedCount = seasonEpisodes.filter((episode) =>
        isEpisodeProgressCompleted(progressMap.get(episode.id)),
      ).length;
      const next = resolveContinueEpisode(seasonEpisodes, progressMap);
      return {
        seasonNumber: season.seasonNumber,
        watchedCount,
        totalEpisodes: seasonEpisodes.length,
        nextEpisode: next
          ? {
              episodeId: next.id,
              seasonNumber: next.seasonNumber,
              episodeNumber: next.episodeNumber,
              title:
                seasonEpisodes.find((episode) => episode.id === next.id)?.title ??
                "",
              progress:
                (progressMap.get(next.id) as PlaybackLocator | null) ?? null,
            }
          : null,
      };
    });
  }

  private async toContinueEpisode(
    episode: EpisodeOrderFields | null,
    progressMap: Map<string, EpisodeProgressEntry>,
  ): Promise<TvContinueEpisode | null> {
    if (!episode) return null;
    const row = await this.db.query.tvEpisodes.findFirst({
      where: eq(schema.tvEpisodes.id, episode.id),
    });
    if (!row) return null;

    const progress = progressMap.get(episode.id);
    return {
      episodeId: episode.id,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      title: row.title,
      progress:
        progress && isPlaybackProgressLocator(progress) ? progress : null,
    };
  }

  private async toListItem(
    show: ShowRow,
    userId: string,
    addedAt?: Date,
  ): Promise<TvShowListItem> {
    const genres = await this.getGenreNames(show.id);
    const favorite = await this.userState.getFavorite(userId, "show", show.id);
    const rating = await this.userState.getRating(userId, "show", show.id);
    const episodes = await this.listEpisodesWithSeasonNumbers(show.id);
    const progressMap = await this.buildEpisodeProgressMap(userId, episodes);
    const continueEpisode = await this.toContinueEpisode(
      resolveContinueEpisode(episodes, progressMap),
      progressMap,
    );

    return {
      ...this.toShowPublic(show),
      genres,
      addedAt: addedAt?.toISOString() ?? null,
      episodeCount: episodes.length,
      favorite,
      rating,
      continueEpisode,
    };
  }

  private async toEpisodeListItem(
    episode: EpisodeRow & { seasonNumber: number },
    userId?: string,
  ): Promise<TvEpisodeListItem> {
    const reps = await this.representationsForEpisode(episode.id);
    let progress: PlaybackLocator | null = null;
    let completed = false;
    let primaryRepresentationId: string | null = null;

    if (userId) {
      const progressRow = await this.userState.getProgress(
        userId,
        "tv_episode",
        episode.id,
      );
      progress =
        progressRow?.locator && isPlaybackProgressLocator(progressRow.locator)
          ? progressRow.locator
          : null;
      completed = isEpisodeProgressCompleted(progress);
      primaryRepresentationId = await this.getPrimaryRepresentationId(
        episode.id,
        userId,
      );
    }

    return {
      ...this.toEpisodePublic(episode, episode.seasonNumber),
      progress,
      completed,
      representationFormats: [...new Set(reps.map((r) => r.format))],
      primaryRepresentationId,
    };
  }

  private async getCreditsForShow(showId: string): Promise<TvCreditPublic[]> {
    const rows = await this.db
      .select({
        id: schema.tvCredits.id,
        personId: schema.tvCredits.personId,
        personSlug: schema.tvPeople.slug,
        name: schema.tvPeople.name,
        role: schema.tvCredits.role,
        character: schema.tvCredits.character,
        sortOrder: schema.tvCredits.sortOrder,
      })
      .from(schema.tvCredits)
      .innerJoin(
        schema.tvPeople,
        eq(schema.tvCredits.personId, schema.tvPeople.id),
      )
      .where(eq(schema.tvCredits.showId, showId))
      .orderBy(asc(schema.tvCredits.sortOrder));

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

  private async getGenreNames(showId: string) {
    const rows = await this.db
      .select({ name: schema.tvGenres.name })
      .from(schema.tvGenres)
      .where(eq(schema.tvGenres.showId, showId));
    return rows.map((r) => r.name);
  }

  private async getFileDurationSeconds(fileId: string): Promise<number | null> {
    const technical = await this.db.query.fileTechnicalMetadata.findFirst({
      where: eq(schema.fileTechnicalMetadata.fileId, fileId),
    });
    const duration = technical?.payload?.durationSeconds;
    return typeof duration === "number" ? duration : null;
  }

  private async representationsForEpisode(episodeId: string) {
    const expressions = await this.db
      .select({ id: schema.creativeWorkExpressions.id })
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          eq(schema.creativeWorkExpressions.workType, "tv_episode"),
          eq(schema.creativeWorkExpressions.workId, episodeId),
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

  private applyShowOverrides(
    show: ShowRow,
    overrides: Record<string, unknown>,
  ) {
    return {
      ...show,
      title: (overrides.title as string) ?? show.title,
      subtitle: (overrides.subtitle as string | undefined) ?? show.subtitle,
      description:
        (overrides.description as string | undefined) ?? show.description,
      premiereDate:
        (overrides.premiereDate as string | undefined) ?? show.premiereDate,
      studio: (overrides.studio as string | undefined) ?? show.studio,
      contentRating:
        (overrides.contentRating as string | undefined) ?? show.contentRating,
    };
  }

  private applyEpisodeOverrides(
    episode: EpisodeRow,
    overrides: Record<string, unknown>,
  ) {
    return {
      ...episode,
      title: (overrides.title as string) ?? episode.title,
      description:
        (overrides.description as string | undefined) ?? episode.description,
      airDate: (overrides.airDate as string | undefined) ?? episode.airDate,
      runtimeSeconds:
        (overrides.runtimeSeconds as number | undefined) ??
        episode.runtimeSeconds,
    };
  }

  toShowPublic(show: ShowRow) {
    return {
      id: show.id,
      slug: show.slug,
      slugStatus: show.slugStatus as "pending" | "canonical",
      title: show.title,
      subtitle: show.subtitle,
      description: show.description,
      premiereDate: show.premiereDate,
      studio: show.studio,
      contentRating: show.contentRating,
      coverFileId: show.coverFileId,
      createdAt: show.createdAt.toISOString(),
      updatedAt: show.updatedAt.toISOString(),
    };
  }

  toSeasonPublic(season: SeasonRow) {
    return {
      id: season.id,
      showId: season.showId,
      seasonNumber: season.seasonNumber,
      title: season.title,
      description: season.description,
      coverFileId: season.coverFileId,
      createdAt: season.createdAt.toISOString(),
      updatedAt: season.updatedAt.toISOString(),
    };
  }

  toEpisodePublic(episode: EpisodeRow, seasonNumber: number) {
    return {
      id: episode.id,
      showId: episode.showId,
      seasonId: episode.seasonId,
      seasonNumber,
      episodeNumber: episode.episodeNumber,
      sortOrder: episode.sortOrder,
      title: episode.title,
      description: episode.description,
      airDate: episode.airDate,
      runtimeSeconds: episode.runtimeSeconds,
      coverFileId: episode.coverFileId,
      createdAt: episode.createdAt.toISOString(),
      updatedAt: episode.updatedAt.toISOString(),
    };
  }
}
