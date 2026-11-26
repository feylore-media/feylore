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
import { runDownloadPrepare } from "../src/server/modules/downloads/prepare.js";
import { generateUniqueAudiobookId } from "../src/server/modules/audiobooks/identity.js";
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

describe("download audio auth", () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let userId = "";
  let audiobookRepId = "";
  let podcastRepId = "";
  let audiobookFileId = "";
  let podcastFileId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-download-audio-auth-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    ctx = built.ctx;
    pool = built.pool;
    await ctx.jobs.start();

    userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "dl-audio@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "dl-audio@test.local",
      username: "dlaudio",
      displayName: "DL Audio",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });
    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await db.insert(schema.userRoles).values({ userId, roleId: memberRole.id });
    }

    const storageId = generateId();
    audiobookFileId = generateId();
    podcastFileId = generateId();
    audiobookRepId = generateId();
    podcastRepId = generateId();
    const audiobookWorkId = await generateUniqueAudiobookId(db);
    const podcastShowId = await generateUniquePodcastShowId(db);
    const podcastEpisodeId = generateId();
    const abExpressionId = generateId();
    const abManifestationId = generateId();
    const pcExpressionId = generateId();
    const pcManifestationId = generateId();

    await db.insert(schema.storageLocations).values({
      id: storageId,
      name: "DL Audio Storage",
      kind: "managed",
      rootPath: process.env.STORAGE_ROOT!,
    });
    await fs.writeFile(
      path.join(process.env.STORAGE_ROOT!, "audiobook.mp3"),
      "audio",
    );
    await fs.writeFile(
      path.join(process.env.STORAGE_ROOT!, "podcast.mp3"),
      Buffer.alloc(2048, 0xff),
    );
    await db.insert(schema.files).values([
      {
        id: audiobookFileId,
        storageLocationId: storageId,
        relativePath: "audiobook.mp3",
        size: 5,
        mediaType: "audio/mpeg",
      },
      {
        id: podcastFileId,
        storageLocationId: storageId,
        relativePath: "podcast.mp3",
        size: 2048,
        mediaType: "audio/mpeg",
      },
    ]);
    await db.insert(schema.audiobooks).values({
      id: audiobookWorkId,
      slug: `dl-audiobook-${generateId()}`,
      slugStatus: "canonical",
      title: "DL Audiobook",
    });
    await db.insert(schema.libraryMemberships).values({
      userId,
      targetType: "audiobook",
      targetId: audiobookWorkId,
    });
    await db.insert(schema.creativeWorkExpressions).values([
      {
        id: abExpressionId,
        workType: "audiobook",
        workId: audiobookWorkId,
      },
      {
        id: pcExpressionId,
        workType: "podcast_episode",
        workId: podcastEpisodeId,
      },
    ]);
    await db.insert(schema.creativeWorkManifestations).values([
      { id: abManifestationId, expressionId: abExpressionId },
      { id: pcManifestationId, expressionId: pcExpressionId },
    ]);
    await db.insert(schema.representations).values([
      {
        id: audiobookRepId,
        manifestationId: abManifestationId,
        format: "audio",
        domainModule: "audiobooks",
      },
      {
        id: podcastRepId,
        manifestationId: pcManifestationId,
        format: "audio",
        domainModule: "podcasts",
      },
    ]);
    await db.insert(schema.representationFiles).values([
      {
        representationId: audiobookRepId,
        fileId: audiobookFileId,
        role: "content",
      },
      {
        representationId: podcastRepId,
        fileId: podcastFileId,
        role: "content",
      },
    ]);
    await db.insert(schema.podcastShows).values({
      id: podcastShowId,
      slug: `dl-show-${generateId()}`,
      slugStatus: "canonical",
      title: "DL Show",
    });
    await db.insert(schema.podcastEpisodes).values({
      id: podcastEpisodeId,
      showId: podcastShowId,
      slug: "dl-episode",
      title: "DL Episode",
      guid: "dl-guid",
      prepareStatus: "ready",
      representationId: podcastRepId,
    });
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  async function runPrepare(representationId: string, fileId: string) {
    const downloadId = generateId();
    const feyloreJobId = generateId();
    await ctx.db.insert(schema.downloads).values({
      id: downloadId,
      userId,
      fileId,
      status: "queued",
    });
    await ctx.db.insert(schema.jobRuns).values({
      id: feyloreJobId,
      type: "download.prepare",
      taskKey: downloadId,
      status: "queued",
      payload: { downloadId, fileId, userId, representationId },
    });

    await runDownloadPrepare(
      ctx.jobs,
      ctx.downloads,
      ctx.files,
      ctx.representations,
      ctx.epubPublication,
      ctx.playback,
      { downloadId, fileId, userId, representationId, feyloreJobId },
    );
  }

  it.skipIf(!dbAvailable)("allows audiobook download prepare with library membership", async () => {
    await expect(
      runPrepare(audiobookRepId, audiobookFileId),
    ).resolves.toBeUndefined();
  });

  it.skipIf(!dbAvailable)("allows podcast download prepare without library membership", async () => {
    await expect(runPrepare(podcastRepId, podcastFileId)).resolves.toBeUndefined();
  });
});
