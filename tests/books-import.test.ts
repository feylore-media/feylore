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
import { buildMinimalEpub } from "./fixtures/epub/build-minimal-epub.js";
import { BOOK_IMPORT_FILE_LIMIT } from "../src/shared/books.js";

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

describe("Books import", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let cookie = "";
  let userId = "";
  let storageRoot = "";
  let storageId = "";
  let epubFileId = "";
  let txtFileId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-import-"));
    process.env.STORAGE_ROOT = storageRoot;

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    storageId = generateId();
    await db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Import Test",
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
    await db.delete(schema.users).where(eq(schema.users.email, "import@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "import@test.local",
      username: "importuser",
      displayName: "Import User",
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
      payload: { email: "import@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const epubBuffer = await buildMinimalEpub({ title: "Import Test EPUB" });
    const epubPath = "import-test.epub";
    await fs.writeFile(path.join(storageRoot, epubPath), epubBuffer);
    epubFileId = generateId();
    await db.insert(schema.files).values({
      id: epubFileId,
      storageLocationId: storageId,
      relativePath: epubPath,
      size: epubBuffer.length,
      mediaType: "application/epub+zip",
    });

    const txtPath = "notes.txt";
    await fs.writeFile(path.join(storageRoot, txtPath), "not a book");
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

  it.skipIf(!dbAvailable)("lists unassociated files", async () => {
    for (const fileId of [epubFileId, txtFileId]) {
      const linked = await ctx.db.query.representationFiles.findFirst({
        where: eq(schema.representationFiles.fileId, fileId),
      });
      expect(linked).toBeUndefined();

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/files/${fileId}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
    }
  });

  it.skipIf(!dbAvailable)("POST /books/import returns 202 with ingest items", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/books/import",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { fileIds: [epubFileId] },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().data.ingestItemIds?.length).toBeGreaterThan(0);
  });

  it.skipIf(!dbAvailable)("rejects empty fileIds", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/books/import",
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
    const tooMany = Array.from({ length: BOOK_IMPORT_FILE_LIMIT + 1 }, () =>
      generateId(),
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/books/import",
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
    "library.associate creates book with membership and enqueues metadata",
    async () => {
      const freshEpub = await buildMinimalEpub({ title: "Associate Flow Book" });
      const freshPath = "associate-flow.epub";
      await fs.writeFile(path.join(storageRoot, freshPath), freshEpub);
      const freshFileId = generateId();
      await createDb(pool).insert(schema.files).values({
        id: freshFileId,
        storageLocationId: storageId,
        relativePath: freshPath,
        size: freshEpub.length,
        mediaType: "application/epub+zip",
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
      const book = expression
        ? await createDb(pool).query.books.findFirst({
            where: eq(schema.books.id, expression.workId),
          })
        : undefined;
      expect(book?.slugStatus).toBe("pending");
      expect(book?.slug).toBe(book?.id);
      expect(book?.id).toMatch(/^[a-z0-9]{6}$/);

      const membership = await createDb(pool)
        .select()
        .from(schema.libraryMemberships)
        .where(eq(schema.libraryMemberships.userId, userId));
      expect(membership.length).toBeGreaterThan(0);

      const metadataJobs = await createDb(pool)
        .select()
        .from(schema.jobRuns)
        .where(eq(schema.jobRuns.type, "metadata.ingest"));
      expect(metadataJobs.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(!dbAvailable)(
    "skips non-book format and already-associated file",
    async () => {
      const firstJobId = generateId();
      await createDb(pool).insert(schema.jobRuns).values({
        id: firstJobId,
        type: "library.associate",
        taskKey: firstJobId,
        status: "queued",
        payload: { fileIds: [epubFileId], userId },
      });
      await runLibraryAssociate(
        ctx.jobs,
        ctx.books,
        ctx.audiobooks,
        ctx.movies,
        ctx.music,
        createDb(pool),
        {
          fileIds: [epubFileId],
          userId,
          feyloreJobId: firstJobId,
        },
      );

      const skipJobId = generateId();
      await createDb(pool).insert(schema.jobRuns).values({
        id: skipJobId,
        type: "library.associate",
        taskKey: skipJobId,
        status: "queued",
        payload: { fileIds: [txtFileId, epubFileId], userId },
      });

      await runLibraryAssociate(
        ctx.jobs,
        ctx.books,
        ctx.audiobooks,
        ctx.movies,
        ctx.music,
        createDb(pool),
        {
          fileIds: [txtFileId, epubFileId],
          userId,
          feyloreJobId: skipJobId,
        },
      );

      const job = await ctx.jobs.getJob(skipJobId);
      expect(job?.status).toBe("completed");
      expect(job?.logExcerpt).toMatch(/skipped 2/);
    },
  );
});
