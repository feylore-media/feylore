import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
import { generateUniquePodcastShowId } from "../src/server/modules/podcasts/identity.js";

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

describe("podcast playback progress", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let episodeId = "";
  let showSlug = "";
  let episodeSlug = "";
  let representationId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-podcast-progress-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "podcast-progress@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "podcast-progress@test.local",
      username: "podcastprogress",
      displayName: "Podcast Progress",
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
      payload: { email: "podcast-progress@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const showId = await generateUniquePodcastShowId(db);
    showSlug = `progress-show-${generateId()}`;
    episodeId = generateId();
    episodeSlug = "episode-one";
    representationId = generateId();
    const expressionId = generateId();
    const manifestationId = generateId();
    const storageId = generateId();
    const fileId = generateId();

    await db.insert(schema.podcastShows).values({
      id: showId,
      slug: showSlug,
      slugStatus: "canonical",
      title: "Progress Show",
    });
    await db.insert(schema.podcastFeeds).values({
      id: generateId(),
      showId,
      feedUrl: `https://example.com/progress-${generateId()}.xml`,
    });
    await db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Podcast Progress Storage",
      kind: "managed",
      rootPath: process.env.STORAGE_ROOT!,
    });
    await fs.writeFile(
      path.join(process.env.STORAGE_ROOT!, "episode.mp3"),
      Buffer.alloc(2048, 0xff),
    );
    await db.insert(schema.files).values({
      id: fileId,
      storageLocationId: storageId,
      relativePath: "episode.mp3",
      size: 2048,
      mediaType: "audio/mpeg",
    });
    await db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "podcast_episode",
      workId: episodeId,
    });
    await db.insert(schema.creativeWorkManifestations).values({
      id: manifestationId,
      expressionId,
    });
    await db.insert(schema.representations).values({
      id: representationId,
      manifestationId,
      format: "audio",
      domainModule: "podcasts",
    });
    await db.insert(schema.representationFiles).values({
      representationId,
      fileId,
      role: "content",
    });
    await db.insert(schema.podcastEpisodes).values({
      id: episodeId,
      showId,
      slug: episodeSlug,
      title: "Episode One",
      guid: "progress-guid-1",
      prepareStatus: "ready",
      representationId,
    });
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("returns playback manifest without library membership", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/representations/${representationId}/playback`,
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.subject.type).toBe("podcast_episode");
    expect(res.json().data.subject.id).toBe(episodeId);
  });

  it.skipIf(!dbAvailable)("round-trips playback progress for podcast_episode", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/api/v1/playback/progress",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        subjectType: "podcast_episode",
        subjectId: episodeId,
        representationId,
        locator: {
          kind: "playback",
          positionSeconds: 42,
          durationSeconds: 300,
        },
      },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({
      method: "GET",
      url: `/api/v1/playback/progress?subjectType=podcast_episode&subjectId=${episodeId}`,
      headers: { cookie },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.locator.positionSeconds).toBe(42);

    const continueRes = await app.inject({
      method: "GET",
      url: "/api/v1/podcasts/continue-listening",
      headers: { cookie },
    });
    expect(continueRes.statusCode).toBe(200);
    expect(
      continueRes.json().data.some((e: { id: string }) => e.id === episodeId),
    ).toBe(true);
  });
});
