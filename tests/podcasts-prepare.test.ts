import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildApp } from "../src/server/http/app.js";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { generateId } from "../src/server/security/crypto.js";
import { parsePodcastFeed } from "../src/server/modules/podcasts/feed-parser.js";
import {
  findOrCreateShowForFeedUrl,
  runPodcastFeedSync,
} from "../src/server/modules/podcasts/feed-sync.js";
import { PodcastsService } from "../src/server/modules/podcasts/service.js";
import * as enclosureValidation from "../src/server/modules/podcasts/enclosure-validation.js";
import { PostgresSearchIndex } from "../src/server/modules/search/index.js";
import { RepresentationService } from "../src/server/modules/representations/service.js";

const DATABASE_URL =
  process.env.FEYLORE_TEST_DATABASE_URL ??
  "postgresql://feylore:feylore@localhost:5432/feylore_test";

const dbAvailable = await (async () => {
  try {
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await pool.end();
    return true;
  } catch {
    return false;
  }
})();

const SAMPLE_FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Prepare Test Show</title>
<item><title>Episode A</title><guid>prep-g1</guid>
<enclosure url="https://example.com/audio.mp3" type="audio/mpeg"/></item>
</channel></rss>`;

describe("podcast prepare", () => {
  it.skipIf(!dbAvailable)("concurrent prepare shares one in-flight fetch", async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-podcasts-prepare-"),
    );
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });

    const search = new PostgresSearchIndex(db);
    const representations = new RepresentationService(db);
    const built = await buildApp();
    const podcasts = new PodcastsService(
      db,
      representations,
      built.ctx.files,
      search,
    );

    const feedUrl = `https://example.com/prepare-${generateId()}.xml`;
    const parsed = await parsePodcastFeed(SAMPLE_FEED);
    const { showId, feedId } = await findOrCreateShowForFeedUrl(
      db,
      feedUrl,
      parsed.title,
      search,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(SAMPLE_FEED, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      }),
    );
    await runPodcastFeedSync(db, feedId, search);
    const episode = await db.query.podcastEpisodes.findFirst({
      where: eq(schema.podcastEpisodes.showId, showId),
    });
    expect(episode).toBeTruthy();

    await db
      .update(schema.podcastEpisodes)
      .set({
        prepareStatus: "none",
        representationId: null,
        prepareError: null,
      })
      .where(eq(schema.podcastEpisodes.id, episode!.id));

    let fetchCount = 0;
    vi.spyOn(enclosureValidation, "validateEnclosureAudio").mockResolvedValue({
      durationSeconds: 120,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(".xml")) {
          return new Response(SAMPLE_FEED, {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          });
        }
        fetchCount++;
        await new Promise((r) => setTimeout(r, 50));
        return new Response(Buffer.alloc(2048, 0xff), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      }),
    );

    await built.ctx.files.loadStorageLocations();
    const managedId = await built.ctx.files.getManagedStorageLocationId();
    if (!managedId) {
      const locId = generateId();
      await db.insert(schema.storageLocations).values({
        id: locId,
        name: "Managed Test",
        kind: "managed",
        rootPath: process.env.STORAGE_ROOT!,
      });
      await built.ctx.files.loadStorageLocations();
    }

    await Promise.all([
      podcasts.runEnclosureFetch(episode!.id),
      podcasts.runEnclosureFetch(episode!.id),
    ]);

    expect(fetchCount).toBe(1);

    const links = await representations.listFilesForRepresentation(
      (await db.query.podcastEpisodes.findFirst({
        where: eq(schema.podcastEpisodes.id, episode!.id),
      }))!.representationId!,
    );
    expect(links.length).toBe(1);

    vi.restoreAllMocks();
    await pool.end();
    vi.unstubAllGlobals();
  });

  it.skipIf(!dbAvailable)("two prepare calls share one managed representation", async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-podcasts-shared-"),
    );
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });

    const search = new PostgresSearchIndex(db);
    const representations = new RepresentationService(db);
    const built = await buildApp();
    const podcasts = new PodcastsService(
      db,
      representations,
      built.ctx.files,
      search,
    );

    const feedUrl = `https://example.com/shared-${generateId()}.xml`;
    const parsed = await parsePodcastFeed(SAMPLE_FEED);
    const { showId, feedId } = await findOrCreateShowForFeedUrl(
      db,
      feedUrl,
      parsed.title,
      search,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(".xml")) {
          return new Response(SAMPLE_FEED, {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          });
        }
        return new Response(Buffer.alloc(2048, 0xff), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      }),
    );
    await runPodcastFeedSync(db, feedId, search);
    const episode = await db.query.podcastEpisodes.findFirst({
      where: eq(schema.podcastEpisodes.showId, showId),
    });

    vi.spyOn(enclosureValidation, "validateEnclosureAudio").mockResolvedValue({
      durationSeconds: 90,
    });

    await built.ctx.files.loadStorageLocations();
    const managedId = await built.ctx.files.getManagedStorageLocationId();
    if (!managedId) {
      const locId = generateId();
      await db.insert(schema.storageLocations).values({
        id: locId,
        name: "Managed Test",
        kind: "managed",
        rootPath: process.env.STORAGE_ROOT!,
      });
      await built.ctx.files.loadStorageLocations();
    }

    const first = await podcasts.ensureEpisodePrepared(episode!.id);
    const second = await podcasts.ensureEpisodePrepared(episode!.id);

    expect(first.prepareStatus).toBe("ready");
    expect(second.prepareStatus).toBe("ready");
    expect(first.representationId).toBe(second.representationId);

    vi.restoreAllMocks();
    await pool.end();
    vi.unstubAllGlobals();
  });

  it.skipIf(!dbAvailable)("retries when episode is stuck in pending", async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-podcasts-stuck-"),
    );
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });

    const search = new PostgresSearchIndex(db);
    const representations = new RepresentationService(db);
    const built = await buildApp();
    const podcasts = new PodcastsService(
      db,
      representations,
      built.ctx.files,
      search,
    );

    const feedUrl = `https://example.com/stuck-${generateId()}.xml`;
    const parsed = await parsePodcastFeed(SAMPLE_FEED);
    const { showId, feedId } = await findOrCreateShowForFeedUrl(
      db,
      feedUrl,
      parsed.title,
      search,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(".xml")) {
          return new Response(SAMPLE_FEED, {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          });
        }
        return new Response(Buffer.alloc(2048, 0xff), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      }),
    );
    await runPodcastFeedSync(db, feedId, search);
    const episode = await db.query.podcastEpisodes.findFirst({
      where: eq(schema.podcastEpisodes.showId, showId),
    });

    await db
      .update(schema.podcastEpisodes)
      .set({
        prepareStatus: "pending",
        representationId: null,
        prepareError: null,
      })
      .where(eq(schema.podcastEpisodes.id, episode!.id));

    vi.spyOn(enclosureValidation, "validateEnclosureAudio").mockResolvedValue({
      durationSeconds: 60,
    });

    await built.ctx.files.loadStorageLocations();
    const managedId = await built.ctx.files.getManagedStorageLocationId();
    if (!managedId) {
      const locId = generateId();
      await db.insert(schema.storageLocations).values({
        id: locId,
        name: "Managed Test",
        kind: "managed",
        rootPath: process.env.STORAGE_ROOT!,
      });
      await built.ctx.files.loadStorageLocations();
    }

    const result = await podcasts.ensureEpisodePrepared(episode!.id);
    expect(result.prepareStatus).toBe("ready");
    expect(result.representationId).toBeTruthy();

    vi.restoreAllMocks();
    await pool.end();
    vi.unstubAllGlobals();
  });
});
