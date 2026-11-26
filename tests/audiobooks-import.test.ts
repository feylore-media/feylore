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
import { runLibraryAssociate } from "../src/server/modules/jobs/service.js";
import {
  compareAudioFileSortKeys,
  type AudioFileSortKey,
} from "../src/shared/audio-ingest.js";
import { AUDIOBOOK_IMPORT_FILE_LIMIT } from "../src/shared/audiobooks.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
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

describe("compareAudioFileSortKeys", () => {
  it("orders by disc, then track, then filename", () => {
    const files: AudioFileSortKey[] = [
      { filename: "z.mp3", discNumber: 1, trackNumber: 2 },
      { filename: "a.mp3", discNumber: 2, trackNumber: 1 },
      { filename: "b.mp3", discNumber: 1, trackNumber: 1 },
      { filename: "c.mp3" },
    ];
    const sorted = [...files].sort(compareAudioFileSortKeys);
    expect(sorted.map((f) => f.filename)).toEqual([
      "b.mp3",
      "z.mp3",
      "c.mp3",
      "a.mp3",
    ]);
  });
});

describe("Audiobooks import", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let cookie = "";
  let userId = "";
  let storageRoot = "";
  let storageId = "";
  let mp3FileId = "";
  let txtFileId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-ab-import-"));
    process.env.STORAGE_ROOT = storageRoot;

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    storageId = generateId();
    await db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Audiobook Import Test",
      kind: "managed",
      rootPath: storageRoot,
    });

    const built = await buildApp();
    app = built.app;
    pool = built.pool;
    ctx = built.ctx;
    await ctx.files.loadStorageLocations();
    await ctx.jobs.start();

    userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "ab-import@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "ab-import@test.local",
      username: "abimport",
      displayName: "AB Import User",
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
      payload: { email: "ab-import@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const mp3Path = "album/chapter-01.mp3";
    await fs.mkdir(path.join(storageRoot, "album"), { recursive: true });
    await fs.writeFile(path.join(storageRoot, mp3Path), "fake mp3 audio");
    mp3FileId = generateId();
    await db.insert(schema.files).values({
      id: mp3FileId,
      storageLocationId: storageId,
      relativePath: mp3Path,
      size: 16,
      mediaType: "audio/mpeg",
    });

    const txtPath = "notes.txt";
    await fs.writeFile(path.join(storageRoot, txtPath), "not audio");
    txtFileId = generateId();
    await db.insert(schema.files).values({
      id: txtFileId,
      storageLocationId: storageId,
      relativePath: txtPath,
      size: 8,
      mediaType: "text/plain",
    });
  }, 60000);

  afterAll(async () => {
    if (ctx) await ctx.jobs.stop();
    if (pool) await pool.end();
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it.skipIf(!dbAvailable)("POST /audiobooks/import returns 202", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/audiobooks/import",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { fileIds: [mp3FileId] },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().data.ingestItemIds?.length).toBeGreaterThan(0);
  });

  it.skipIf(!dbAvailable)("rejects empty fileIds", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/audiobooks/import",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { fileIds: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it.skipIf(!dbAvailable)("rejects more than import limit", async () => {
    const tooMany = Array.from(
      { length: AUDIOBOOK_IMPORT_FILE_LIMIT + 1 },
      () => generateId(),
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/audiobooks/import",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { fileIds: tooMany },
    });
    expect(res.statusCode).toBe(400);
  });

  it.skipIf(!dbAvailable)(
    "library.associate creates audiobook from mp3 without external metadata",
    async () => {
      const freshPath = "album/fresh-title.mp3";
      await fs.writeFile(path.join(storageRoot, freshPath), "audio content");
      const freshFileId = generateId();
      await createDb(pool).insert(schema.files).values({
        id: freshFileId,
        storageLocationId: storageId,
        relativePath: freshPath,
        size: 13,
        mediaType: "audio/mpeg",
      });

      const jobId = generateId();
      await createDb(pool).insert(schema.jobRuns).values({
        id: jobId,
        type: "library.associate",
        taskKey: jobId,
        status: "queued",
        payload: { fileIds: [freshFileId], userId },
      });

      await runLibraryAssociate(
        ctx.jobs,
        ctx.books,
        ctx.audiobooks,
        ctx.movies,
        ctx.music,
        createDb(pool),
        {
          fileIds: [freshFileId],
          userId,
          feyloreJobId: jobId,
        },
      );

      const job = await ctx.jobs.getJob(jobId);
      expect(job?.status).toBe("completed");

      const reps = await ctx.representations.findByFileId(freshFileId);
      expect(reps.length).toBe(1);

      const manifestation = await createDb(pool).query.creativeWorkManifestations.findFirst({
        where: eq(schema.creativeWorkManifestations.id, reps[0]!.manifestationId!),
      });
      const expression = manifestation
        ? await createDb(pool).query.creativeWorkExpressions.findFirst({
            where: eq(schema.creativeWorkExpressions.id, manifestation.expressionId),
          })
        : undefined;
      const audiobook = expression
        ? await createDb(pool).query.audiobooks.findFirst({
            where: eq(schema.audiobooks.id, expression.workId),
          })
        : undefined;
      expect(audiobook).toBeTruthy();
      expect(expression?.workType).toBe("audiobook");

      const membership = await createDb(pool)
        .select()
        .from(schema.libraryMemberships)
        .where(eq(schema.libraryMemberships.userId, userId));
      expect(membership.some((m) => m.targetType === "audiobook")).toBe(true);
    },
  );

  it.skipIf(!dbAvailable)(
    "ingest pipeline links sibling audio files with deterministic sortOrder",
    async () => {
      const albumDir = "multi-disc-album";
      const tracks = ["03-end.mp3", "01-start.mp3", "02-middle.mp3"];
      const fileIds: string[] = [];

      for (const name of tracks) {
        const rel = `${albumDir}/${name}`;
        await fs.mkdir(path.join(storageRoot, albumDir), { recursive: true });
        await fs.writeFile(path.join(storageRoot, rel), `audio-${name}`);
        const id = generateId();
        fileIds.push(id);
        await createDb(pool).insert(schema.files).values({
          id,
          storageLocationId: storageId,
          relativePath: rel,
          size: 20,
          mediaType: "audio/mpeg",
        });
      }

      const result = await ctx.ingest.items.reconcileDiscovered({
        sourceKind: "filesystem",
        sourceIdentity: `test:${fileIds[1]}`,
        sourcePath: `${albumDir}/01-start.mp3`,
        sourceStorageLocationId: storageId,
        originalFilename: "01-start.mp3",
        sourceSize: 20,
        submittedByUserId: userId,
        targetLibraryId: (await ctx.libraries.getDefaultAudiobookLibrary())?.id,
      });

      await ctx.ingest.getPipeline().process(result.item.id);

      const item = await ctx.ingest.items.getById(result.item.id);
      expect(item?.status).toBe("completed");
      expect(item?.workType).toBe("audiobook");
      expect(item?.fileId).toBeTruthy();

      const reps = await ctx.representations.findByFileId(item!.fileId!);
      expect(reps.length).toBeGreaterThan(0);

      let links: Awaited<
        ReturnType<typeof ctx.representations.listFilesForRepresentation>
      > = [];
      for (const rep of reps) {
        const candidate = await ctx.representations.listFilesForRepresentation(
          rep.id,
        );
        if (candidate.length >= links.length) {
          links = candidate;
        }
      }
      expect(links.length).toBe(3);
      expect(links.map((l) => l.sortOrder)).toEqual([0, 1, 2]);

      const orderedPaths: string[] = [];
      for (const link of links) {
        const file = await ctx.files.getFile(link.fileId);
        orderedPaths.push(path.basename(file.relativePath));
      }
      expect(orderedPaths.map((name) => name.toLowerCase())).toEqual([
        "01 start.mp3",
        "02-middle.mp3",
        "03-end.mp3",
      ]);
    },
  );

  it.skipIf(!dbAvailable)(
    "skips non-audio format and already-associated file",
    async () => {
      const associatePath = "solo-book.mp3";
      await fs.writeFile(path.join(storageRoot, associatePath), "audio");
      const soloId = generateId();
      await createDb(pool).insert(schema.files).values({
        id: soloId,
        storageLocationId: storageId,
        relativePath: associatePath,
        size: 5,
        mediaType: "audio/mpeg",
      });

      const firstJobId = generateId();
      await createDb(pool).insert(schema.jobRuns).values({
        id: firstJobId,
        type: "library.associate",
        taskKey: firstJobId,
        status: "queued",
        payload: { fileIds: [soloId], userId },
      });
      await runLibraryAssociate(
        ctx.jobs,
        ctx.books,
        ctx.audiobooks,
        ctx.movies,
        ctx.music,
        createDb(pool),
        { fileIds: [soloId], userId, feyloreJobId: firstJobId },
      );

      const skipJobId = generateId();
      await createDb(pool).insert(schema.jobRuns).values({
        id: skipJobId,
        type: "library.associate",
        taskKey: skipJobId,
        status: "queued",
        payload: { fileIds: [txtFileId, soloId], userId },
      });

      await runLibraryAssociate(
        ctx.jobs,
        ctx.books,
        ctx.audiobooks,
        ctx.movies,
        ctx.music,
        createDb(pool),
        { fileIds: [txtFileId, soloId], userId, feyloreJobId: skipJobId },
      );

      const job = await ctx.jobs.getJob(skipJobId);
      expect(job?.status).toBe("completed");
      expect(job?.logExcerpt).toMatch(/skipped 2/);
    },
  );
});
