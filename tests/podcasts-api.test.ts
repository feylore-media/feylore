import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildApp } from "../src/server/http/app.js";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { ROLE_NAMES } from "../src/shared/permissions.js";
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
<rss version="2.0"><channel><title>API Test Show</title>
<item><title>First</title><guid>g1</guid>
<enclosure url="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" type="audio/mpeg"/></item>
</channel></rss>`;

describe("Podcasts API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let cookie = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-podcasts-api-"),
    );

    pool = createPool(DATABASE_URL);
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "podcasts@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "podcasts@test.local",
      username: "podcastuser",
      displayName: "Podcast User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });
    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db.insert(schema.userRoles).values({ userId, roleId: adminRole.id });
    }
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "podcasts@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

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
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("lists episode detail without subscription", async () => {
    const feedUrl = `https://example.com/feed-${generateId()}.xml`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(SAMPLE_FEED, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      }),
    );

    const search = new PostgresSearchIndex(db);
    const parsed = await parsePodcastFeed(SAMPLE_FEED);
    const { showId, feedId } = await findOrCreateShowForFeedUrl(
      db,
      feedUrl,
      parsed.title,
      search,
    );
    await runPodcastFeedSync(db, feedId, search);

    const show = await db.query.podcastShows.findFirst({
      where: eq(schema.podcastShows.id, showId),
    });
    const episodes = await db.query.podcastEpisodes.findMany({
      where: eq(schema.podcastEpisodes.showId, showId),
    });
    expect(episodes.length).toBeGreaterThan(0);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/podcasts/${show!.slug}/episodes/${episodes[0]!.slug}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.title).toBe("First");

    vi.unstubAllGlobals();
  });
});

describe("podcast prepare dedup", () => {
  it.skipIf(!dbAvailable)("concurrent prepare shares one in-flight fetch", async () => {
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(SAMPLE_FEED, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      }),
    );

    const search = new PostgresSearchIndex(db);
    const representations = new RepresentationService(db);
    const built = await buildApp();
    const podcasts = new PodcastsService(
      db,
      representations,
      built.ctx.files,
      search,
    );

    const feedUrl = `https://example.com/dedup-${generateId()}.xml`;
    const parsed = await parsePodcastFeed(SAMPLE_FEED);
    const { showId, feedId } = await findOrCreateShowForFeedUrl(
      db,
      feedUrl,
      parsed.title,
      search,
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
      vi.fn(async (url: string) => {
        if (String(url).includes("dedup-") && String(url).endsWith(".xml")) {
          return new Response(SAMPLE_FEED, {
            status: 200,
            headers: { "content-type": "application/rss+xml" },
          });
        }
        fetchCount++;
        await new Promise((r) => setTimeout(r, 50));
        return new Response(Buffer.alloc(512), {
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
    vi.restoreAllMocks();
    await pool.end();
    vi.unstubAllGlobals();
  });
});
