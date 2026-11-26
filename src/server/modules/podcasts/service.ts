import {
  eq,
  and,
  desc,
  asc,
  ilike,
  inArray,
  sql,
  isNull,
} from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError, ValidationError } from "../../../shared/errors.js";
import { isPlaybackProgressLocator } from "../../../shared/progress-locator.js";
import type {
  PodcastContinueListeningItem,
  PodcastEpisodeDetail,
  PodcastEpisodeListItem,
  PodcastEpisodeListQuery,
  PodcastListQuery,
  PodcastPrepareResult,
  PodcastShowDetail,
  PodcastShowListItem,
} from "../../../shared/podcasts.js";
import type { RepresentationService } from "../representations/service.js";
import type { FileService } from "../files/service.js";
import type { PostgresSearchIndex } from "../search/index.js";
import type { JobService } from "../jobs/service.js";
import type { CoverPipeline } from "../metadata/cover.js";
import { JOB_TYPES } from "../jobs/types.js";
import { outboundFetch, OutboundFetchError } from "../metadata/outbound-fetch.js";
import { plainTextFromHtml } from "../../../shared/plain-text.js";
import { parsePodcastFeed } from "./feed-parser.js";
import {
  findOrCreateShowForFeedUrl,
  MAX_FEED_BYTES,
  runPodcastFeedSync,
} from "./feed-sync.js";
import { runPodcastEnclosureFetch } from "./enclosure.js";
import { getPodcastShowBySlug } from "./identity.js";
import {
  MIN_ENCLOSURE_BYTES,
  validateEnclosureAudio,
} from "./enclosure-validation.js";

const prepareWaiters = new Map<string, Promise<void>>();

function podcastFeedFetchErrorMessage(err: OutboundFetchError): string {
  switch (err.code) {
    case "size":
      return "This podcast feed is too large to import";
    case "timeout":
      return "Timed out while fetching the podcast feed";
    case "redirect":
      return "Podcast feed redirects are not supported; use the final feed URL";
    case "scheme":
      return "Only HTTPS podcast feed URLs are supported";
    case "hostname":
    case "ip":
    case "dns":
      return "This podcast feed URL is not allowed";
    default:
      return err.message || "Could not fetch podcast feed";
  }
}

async function fetchPodcastFeed(feedUrl: string) {
  try {
    const response = await outboundFetch(feedUrl, { maxBytes: MAX_FEED_BYTES });
    if (response.status < 200 || response.status >= 300) {
      throw new ValidationError(`Feed fetch failed: HTTP ${response.status}`);
    }
    return response;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    if (err instanceof OutboundFetchError) {
      throw new ValidationError(podcastFeedFetchErrorMessage(err));
    }
    throw err;
  }
}

export class PodcastsService {
  private jobs: JobService | undefined;
  private coverPipeline: CoverPipeline | undefined;

  constructor(
    private readonly db: Database,
    private readonly representations: RepresentationService,
    private readonly files: FileService,
    private readonly search: PostgresSearchIndex,
  ) {}

  setJobService(jobs: JobService) {
    this.jobs = jobs;
  }

  setCoverPipeline(cover: CoverPipeline) {
    this.coverPipeline = cover;
  }

  async getShow(id: string) {
    const show = await this.db.query.podcastShows.findFirst({
      where: eq(schema.podcastShows.id, id),
    });
    if (!show) throw new NotFoundError("Podcast show not found");
    return show;
  }

  async getShowByRef(ref: string) {
    return getPodcastShowBySlug(this.db, ref);
  }

  async getEpisode(showId: string, episodeRef: string) {
    const episode = await this.db.query.podcastEpisodes.findFirst({
      where: and(
        eq(schema.podcastEpisodes.showId, showId),
        eq(schema.podcastEpisodes.slug, episodeRef),
      ),
    });
    if (!episode) throw new NotFoundError("Podcast episode not found");
    return episode;
  }

  async episodeExistsInCatalog(episodeId: string): Promise<boolean> {
    const episode = await this.db.query.podcastEpisodes.findFirst({
      where: eq(schema.podcastEpisodes.id, episodeId),
    });
    return episode != null && episode.unavailableAt == null;
  }

  async findEpisodeIdForRepresentation(
    representationId: string,
  ): Promise<string | null> {
    const episode = await this.db.query.podcastEpisodes.findFirst({
      where: eq(schema.podcastEpisodes.representationId, representationId),
    });
    return episode?.id ?? null;
  }

  private async isSubscribed(userId: string, showId: string) {
    const row = await this.db.query.podcastSubscriptions.findFirst({
      where: and(
        eq(schema.podcastSubscriptions.userId, userId),
        eq(schema.podcastSubscriptions.showId, showId),
      ),
    });
    return row != null;
  }

  private toShowListItem(
    show: typeof schema.podcastShows.$inferSelect,
    subscribed: boolean,
    extras?: { episodeCount?: number; latestEpisodeAt?: Date },
  ): PodcastShowListItem {
    return {
      id: show.id,
      slug: show.slug,
      slugStatus: show.slugStatus as PodcastShowListItem["slugStatus"],
      title: show.title,
      description: plainTextFromHtml(show.description ?? undefined),
      author: show.author ?? undefined,
      coverFileId: show.coverFileId ?? undefined,
      subscribed,
      episodeCount: extras?.episodeCount,
      latestEpisodeAt: extras?.latestEpisodeAt?.toISOString(),
    };
  }

  private toEpisodeListItem(
    episode: typeof schema.podcastEpisodes.$inferSelect,
  ): PodcastEpisodeListItem {
    return {
      id: episode.id,
      slug: episode.slug,
      title: episode.title,
      description: plainTextFromHtml(episode.description ?? undefined),
      publishedAt: episode.publishedAt?.toISOString(),
      durationSeconds: episode.durationSeconds ?? undefined,
      episodeNumber: episode.episodeNumber ?? undefined,
      seasonNumber: episode.seasonNumber ?? undefined,
      prepareStatus: episode.prepareStatus as PodcastEpisodeListItem["prepareStatus"],
      representationId: episode.representationId ?? undefined,
      unavailable: episode.unavailableAt != null,
    };
  }

  async listSubscribedShows(userId: string, query: PodcastListQuery) {
    const subs = await this.db
      .select({ showId: schema.podcastSubscriptions.showId })
      .from(schema.podcastSubscriptions)
      .where(eq(schema.podcastSubscriptions.userId, userId));

    if (subs.length === 0) {
      return { items: [] as PodcastShowListItem[], nextCursor: undefined };
    }

    let showIds = subs.map((s) => s.showId);

    if (query.q) {
      const searchResults = await this.search.query({
        q: query.q,
        types: ["podcast"],
        limit: 200,
      });
      const searched = new Set(searchResults.results.map((r) => r.id));
      if (searched.size > 0) {
        showIds = showIds.filter((id) => searched.has(id));
      }
    }

    const shows = await this.db
      .select()
      .from(schema.podcastShows)
      .where(inArray(schema.podcastShows.id, showIds))
      .orderBy(asc(schema.podcastShows.title));

    const items = shows.map((show) =>
      this.toShowListItem(show, true),
    );

    return { items, nextCursor: undefined };
  }

  async listContinueListening(
    userId: string,
    limit = 20,
  ): Promise<{ items: PodcastContinueListeningItem[] }> {
    const progressRows = await this.db
      .select()
      .from(schema.userProgress)
      .where(
        and(
          eq(schema.userProgress.userId, userId),
          eq(schema.userProgress.subjectType, "podcast_episode"),
        ),
      )
      .orderBy(desc(schema.userProgress.updatedAt))
      .limit(limit);

    const items: PodcastContinueListeningItem[] = [];
    for (const row of progressRows) {
      if (!isPlaybackProgressLocator(row.locatorJson)) continue;
      if (row.locatorJson.completed) continue;

      const episode = await this.db.query.podcastEpisodes.findFirst({
        where: eq(schema.podcastEpisodes.id, row.subjectId),
      });
      if (!episode || episode.unavailableAt) continue;

      const show = await this.db.query.podcastShows.findFirst({
        where: eq(schema.podcastShows.id, episode.showId),
      });
      if (!show) continue;

      items.push({
        ...this.toEpisodeListItem(episode),
        showSlug: show.slug,
        showTitle: show.title,
        positionSeconds: row.locatorJson.positionSeconds,
      });
    }

    return { items };
  }

  async listDiscoverShows(userId: string, query: PodcastListQuery) {
    const conditions = [];
    if (query.q) {
      conditions.push(ilike(schema.podcastShows.title, `%${query.q}%`));
    }

    const shows = await this.db
      .select()
      .from(schema.podcastShows)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(schema.podcastShows.title))
      .limit(query.limit ?? 50);

    const items: PodcastShowListItem[] = [];
    for (const show of shows) {
      const subscribed = await this.isSubscribed(userId, show.id);
      items.push(this.toShowListItem(show, subscribed));
    }
    return { items, nextCursor: undefined };
  }

  async getShowDetail(userId: string, showRef: string): Promise<PodcastShowDetail> {
    const show = await getPodcastShowBySlug(this.db, showRef);
    const feed = await this.db.query.podcastFeeds.findFirst({
      where: eq(schema.podcastFeeds.showId, show.id),
    });
    const subscribed = await this.isSubscribed(userId, show.id);

    const recentEpisodes = await this.db
      .select()
      .from(schema.podcastEpisodes)
      .where(
        and(
          eq(schema.podcastEpisodes.showId, show.id),
          isNull(schema.podcastEpisodes.unavailableAt),
        ),
      )
      .orderBy(desc(schema.podcastEpisodes.publishedAt))
      .limit(10);

    return {
      ...this.toShowListItem(show, subscribed),
      feedUrl: feed?.feedUrl,
      recentEpisodes: recentEpisodes.map((e) => this.toEpisodeListItem(e)),
    };
  }

  async listEpisodes(
    showRef: string,
    query: PodcastEpisodeListQuery,
  ) {
    const show = await getPodcastShowBySlug(this.db, showRef);
    const limit = query.limit ?? 50;
    const offset = query.cursor ? parseInt(query.cursor, 10) : 0;

    const rows = await this.db
      .select()
      .from(schema.podcastEpisodes)
      .where(
        and(
          eq(schema.podcastEpisodes.showId, show.id),
          isNull(schema.podcastEpisodes.unavailableAt),
        ),
      )
      .orderBy(desc(schema.podcastEpisodes.publishedAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: page.map((e) => this.toEpisodeListItem(e)),
      nextCursor: hasMore ? String(offset + limit) : undefined,
    };
  }

  async getEpisodeDetail(
    showRef: string,
    episodeRef: string,
  ): Promise<PodcastEpisodeDetail> {
    const show = await getPodcastShowBySlug(this.db, showRef);
    const episode = await this.getEpisode(show.id, episodeRef);

    return {
      ...this.toEpisodeListItem(episode),
      showId: show.id,
      showSlug: show.slug,
      showTitle: show.title,
      guid: episode.guid,
      prepareError: episode.prepareError ?? undefined,
    };
  }

  async subscribe(userId: string, feedUrl: string) {
    const response = await fetchPodcastFeed(feedUrl);
    const parsed = await parsePodcastFeed(response.body);

    const { showId, feedId } = await findOrCreateShowForFeedUrl(
      this.db,
      feedUrl,
      parsed.title,
      this.search,
    );

    await this.db
      .insert(schema.podcastSubscriptions)
      .values({ userId, showId })
      .onConflictDoNothing();

    await this.enqueueFeedSync(feedId);

    const show = await this.getShow(showId);
    return this.toShowListItem(show, true);
  }

  async unsubscribe(userId: string, showRef: string) {
    const show = await getPodcastShowBySlug(this.db, showRef);
    await this.db
      .delete(schema.podcastSubscriptions)
      .where(
        and(
          eq(schema.podcastSubscriptions.userId, userId),
          eq(schema.podcastSubscriptions.showId, show.id),
        ),
      );
  }

  async enqueueFeedSync(feedId: string) {
    if (!this.jobs || process.env.NODE_ENV === "test") {
      await runPodcastFeedSync(
        this.db,
        feedId,
        this.search,
        this.coverPipeline,
      );
      return;
    }
    await this.jobs.enqueue(
      JOB_TYPES.PODCAST_FEED_SYNC,
      { feedId },
      { singletonKey: `podcast-feed-${feedId}` },
    );
  }

  async runEnclosureFetch(episodeId: string): Promise<void> {
    const existing = prepareWaiters.get(episodeId);
    if (existing) {
      await existing;
      return;
    }

    const work = runPodcastEnclosureFetch(
      this.db,
      this.files,
      this.representations,
      this.jobs,
      episodeId,
    ).finally(() => {
      prepareWaiters.delete(episodeId);
    });

    prepareWaiters.set(episodeId, work);
    await work;
  }

  private async isPreparedRepresentationPlayable(
    representationId: string,
  ): Promise<boolean> {
    const links =
      await this.representations.listFilesForRepresentation(representationId);
    if (links.length === 0) return false;

    const file = await this.files.getFile(links[0]!.fileId);
    if (file.size < MIN_ENCLOSURE_BYTES) return false;

    const { stream } = await this.files.getStream(file.id);
    const chunks: Buffer[] = [];
    let total = 0;
    const maxProbe = Math.min(file.size, 256 * 1024);
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
      total += chunk.length;
      if (total >= maxProbe) break;
    }

    try {
      await validateEnclosureAudio(
        Buffer.concat(chunks),
        file.mediaType ?? "audio/mpeg",
      );
      return true;
    } catch {
      return false;
    }
  }

  private async discardInvalidPrepare(episodeId: string) {
    const episode = await this.db.query.podcastEpisodes.findFirst({
      where: eq(schema.podcastEpisodes.id, episodeId),
    });
    if (!episode?.representationId) return;

    const links = await this.representations.listFilesForRepresentation(
      episode.representationId,
    );
    for (const link of links) {
      await this.representations.unlinkFile(episode.representationId, link.fileId);
      try {
        await this.files.deleteFile(link.fileId);
      } catch {
        // File may already be gone from storage.
      }
    }

    await this.db
      .update(schema.podcastEpisodes)
      .set({
        representationId: null,
        prepareStatus: "none",
        prepareError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.podcastEpisodes.id, episodeId));
  }

  private prepareResult(
    episode: typeof schema.podcastEpisodes.$inferSelect,
  ): PodcastPrepareResult {
    if (episode.prepareStatus === "ready" && episode.representationId) {
      return {
        prepareStatus: "ready",
        representationId: episode.representationId,
      };
    }
    if (episode.prepareStatus === "failed") {
      return {
        prepareStatus: "failed",
        prepareError: episode.prepareError ?? "Prepare failed",
      };
    }
    return { prepareStatus: "pending" };
  }

  async ensureEpisodePrepared(episodeId: string): Promise<PodcastPrepareResult> {
    let episode = await this.db.query.podcastEpisodes.findFirst({
      where: eq(schema.podcastEpisodes.id, episodeId),
    });
    if (!episode) throw new NotFoundError("Episode not found");

    if (
      episode.prepareStatus === "ready" &&
      episode.representationId
    ) {
      const links = await this.representations.listFilesForRepresentation(
        episode.representationId,
      );
      if (links.length > 0) {
        const playable = await this.isPreparedRepresentationPlayable(
          episode.representationId,
        );
        if (playable) {
          return {
            prepareStatus: "ready",
            representationId: episode.representationId,
          };
        }
        await this.discardInvalidPrepare(episodeId);
        episode = await this.db.query.podcastEpisodes.findFirst({
          where: eq(schema.podcastEpisodes.id, episodeId),
        });
        if (!episode) throw new NotFoundError("Episode not found");
      }
    }

    try {
      await this.runEnclosureFetch(episodeId);
    } catch {
      // runPodcastEnclosureFetch records failure on the episode row.
    }

    episode = await this.db.query.podcastEpisodes.findFirst({
      where: eq(schema.podcastEpisodes.id, episodeId),
    });
    if (!episode) throw new NotFoundError("Episode not found");
    return this.prepareResult(episode);
  }

  async indexShow(showId: string) {
    const show = await this.getShow(showId);
    await this.search.upsert({
      entityType: "podcast",
      entityId: show.id,
      title: show.title,
      body: [show.description, show.author].filter(Boolean).join(" "),
    });
  }

  async listAllShowIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.podcastShows.id })
      .from(schema.podcastShows);
    return rows.map((r) => r.id);
  }

  async syncFeedsWithSubscribers() {
    const feeds = await this.db
      .select({ feedId: schema.podcastFeeds.id })
      .from(schema.podcastFeeds)
      .innerJoin(
        schema.podcastSubscriptions,
        eq(schema.podcastSubscriptions.showId, schema.podcastFeeds.showId),
      )
      .groupBy(schema.podcastFeeds.id);

    for (const { feedId } of feeds) {
      await this.enqueueFeedSync(feedId);
    }
  }
}
