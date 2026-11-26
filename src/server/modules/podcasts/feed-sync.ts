import { eq, and, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { outboundFetch } from "../metadata/outbound-fetch.js";
import { parsePodcastFeed } from "./feed-parser.js";
import {
  allocateEpisodeSlug,
  allocatePodcastShowCanonicalSlug,
  generateUniquePodcastShowId,
  pendingPodcastShowIdentity,
  promotePodcastShowSlugIfPending,
} from "./identity.js";
import type { PostgresSearchIndex } from "../search/index.js";
import type { CoverPipeline } from "../metadata/cover.js";

/** Large catalogs (e.g. long-running shows with HTML show notes) can exceed 2MB. */
export const MAX_FEED_BYTES = 8 * 1024 * 1024;

export async function runPodcastFeedSync(
  db: Database,
  feedId: string,
  search: PostgresSearchIndex,
  coverPipeline?: CoverPipeline,
): Promise<void> {
  const feed = await db.query.podcastFeeds.findFirst({
    where: eq(schema.podcastFeeds.id, feedId),
  });
  if (!feed) throw new Error("Feed not found");

  if (feed.syncInProgress) return;

  await db
    .update(schema.podcastFeeds)
    .set({ syncInProgress: true, updatedAt: new Date() })
    .where(eq(schema.podcastFeeds.id, feedId));

  try {
    const headers: Record<string, string> = {};
    if (feed.etag) headers["If-None-Match"] = feed.etag;
    if (feed.lastModified) headers["If-Modified-Since"] = feed.lastModified;

    const response = await outboundFetch(feed.feedUrl, {
      maxBytes: MAX_FEED_BYTES,
      maxRedirects: 5,
      headers,
    });

    if (response.status === 304) {
      await db
        .update(schema.podcastFeeds)
        .set({
          lastFetchedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.podcastFeeds.id, feedId));
      return;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Feed fetch failed: HTTP ${response.status}`);
    }

    const parsed = await parsePodcastFeed(response.body);
    const show = await db.query.podcastShows.findFirst({
      where: eq(schema.podcastShows.id, feed.showId),
    });
    if (!show) throw new Error("Show not found");

    await db
      .update(schema.podcastShows)
      .set({
        title: parsed.title,
        description: parsed.description ?? show.description,
        author: parsed.author ?? show.author,
        updatedAt: new Date(),
      })
      .where(eq(schema.podcastShows.id, feed.showId));

    await promotePodcastShowSlugIfPending(db, feed.showId, parsed.title);

    const feedGuids = new Set(parsed.episodes.map((e) => e.guid));

    for (const item of parsed.episodes) {
      const existing = await db.query.podcastEpisodes.findFirst({
        where: and(
          eq(schema.podcastEpisodes.showId, feed.showId),
          eq(schema.podcastEpisodes.guid, item.guid),
        ),
      });

      if (existing) {
        await db
          .update(schema.podcastEpisodes)
          .set({
            title: item.title,
            description: item.description,
            publishedAt: item.publishedAt,
            durationSeconds: item.durationSeconds,
            episodeNumber: item.episodeNumber,
            seasonNumber: item.seasonNumber,
            enclosureUrl: item.enclosureUrl,
            enclosureMime: item.enclosureMime,
            enclosureBytes: item.enclosureBytes,
            unavailableAt: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.podcastEpisodes.id, existing.id));

        await search.upsert({
          entityType: "podcast_episode",
          entityId: existing.id,
          title: item.title,
          body: parsed.title,
        });
        continue;
      }

      const episodeId = generateId();
      const slug = await allocateEpisodeSlug(db, feed.showId, item.title);
      await db.insert(schema.podcastEpisodes).values({
        id: episodeId,
        showId: feed.showId,
        slug,
        title: item.title,
        description: item.description,
        guid: item.guid,
        publishedAt: item.publishedAt,
        durationSeconds: item.durationSeconds,
        episodeNumber: item.episodeNumber,
        seasonNumber: item.seasonNumber,
        enclosureUrl: item.enclosureUrl,
        enclosureMime: item.enclosureMime,
        enclosureBytes: item.enclosureBytes,
        prepareStatus: "none",
      });

      await search.upsert({
        entityType: "podcast_episode",
        entityId: episodeId,
        title: item.title,
        body: parsed.title,
      });
    }

    const existingEpisodes = await db
      .select({
        id: schema.podcastEpisodes.id,
        guid: schema.podcastEpisodes.guid,
      })
      .from(schema.podcastEpisodes)
      .where(eq(schema.podcastEpisodes.showId, feed.showId));

    const toMarkUnavailable = existingEpisodes
      .filter((e) => !feedGuids.has(e.guid))
      .map((e) => e.id);

    if (toMarkUnavailable.length > 0) {
      await db
        .update(schema.podcastEpisodes)
        .set({ unavailableAt: new Date(), updatedAt: new Date() })
        .where(inArray(schema.podcastEpisodes.id, toMarkUnavailable));
    }

    await search.upsert({
      entityType: "podcast",
      entityId: feed.showId,
      title: parsed.title,
      body: [parsed.description, parsed.author].filter(Boolean).join(" "),
    });

    if (parsed.imageUrl && coverPipeline && !show.coverFileId) {
      await coverPipeline.fetchAndStorePodcastCover({
        showId: feed.showId,
        coverUrl: parsed.imageUrl,
      });
    }

    await db
      .update(schema.podcastFeeds)
      .set({
        etag: response.headers.get("etag") ?? feed.etag,
        lastModified:
          response.headers.get("last-modified") ?? feed.lastModified,
        lastFetchedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.podcastFeeds.id, feedId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Feed sync failed";
    await db
      .update(schema.podcastFeeds)
      .set({
        lastError: message,
        updatedAt: new Date(),
      })
      .where(eq(schema.podcastFeeds.id, feedId));
    throw err;
  } finally {
    await db
      .update(schema.podcastFeeds)
      .set({ syncInProgress: false, updatedAt: new Date() })
      .where(eq(schema.podcastFeeds.id, feedId));
  }
}

export async function findOrCreateShowForFeedUrl(
  db: Database,
  feedUrl: string,
  parsedTitle: string,
  search: PostgresSearchIndex,
): Promise<{ showId: string; feedId: string; created: boolean }> {
  const existingFeed = await db.query.podcastFeeds.findFirst({
    where: eq(schema.podcastFeeds.feedUrl, feedUrl),
  });
  if (existingFeed) {
    return {
      showId: existingFeed.showId,
      feedId: existingFeed.id,
      created: false,
    };
  }

  const id = await generateUniquePodcastShowId(db);
  const canonicalSlug = await allocatePodcastShowCanonicalSlug(db, parsedTitle);
  const identity = canonicalSlug
    ? { id, slug: canonicalSlug, slugStatus: "canonical" as const }
    : pendingPodcastShowIdentity(id);

  await db.insert(schema.podcastShows).values({
    id: identity.id,
    slug: identity.slug,
    slugStatus: identity.slugStatus,
    title: parsedTitle,
  });

  const feedId = generateId();
  await db.insert(schema.podcastFeeds).values({
    id: feedId,
    showId: id,
    feedUrl,
  });

  await search.upsert({
    entityType: "podcast",
    entityId: id,
    title: parsedTitle,
  });

  return { showId: id, feedId, created: true };
}

export async function countActiveSubscribers(
  db: Database,
  showId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.podcastSubscriptions)
    .where(eq(schema.podcastSubscriptions.showId, showId));
  return row?.count ?? 0;
}
