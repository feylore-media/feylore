import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { createContext } from "../src/server/context.js";
import { loadConfig } from "../src/server/config.js";
import { buildMinimalEpub } from "./fixtures/epub/build-minimal-epub.js";
import { INGEST_TEST_DATABASE_URL, ingestDbAvailable } from "./helpers/ingest-setup.js";

describe.skipIf(!ingestDbAvailable)("Ingest default Books library", () => {
  let pool: ReturnType<typeof createPool>;
  let ctx: ReturnType<typeof createContext>;
  let ingestStorageId = "";
  let ingestRootId = "";
  let booksRoot = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = INGEST_TEST_DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";

    booksRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-books-auto-"));
    const ingestRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-ingest-auto-"));
    process.env.LIBRARY_BOOKS_ROOT = booksRoot;
    process.env.INGEST_ROOT = ingestRoot;

    pool = createPool(INGEST_TEST_DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    ingestStorageId = generateId();
    await db.insert(schema.storageLocations).values({
      id: ingestStorageId,
      name: "Ingest",
      kind: "managed",
      rootPath: ingestRoot,
    });

    ingestRootId = generateId();
    await db.insert(schema.ingestRoots).values({
      id: ingestRootId,
      name: "Test Ingest",
      storageLocationId: ingestStorageId,
    });

    ctx = createContext(loadConfig(), db);
    await ctx.files.loadStorageLocations();
    await ctx.jobs.start();

    const pipeline = ctx.ingest.getPipeline();
    const { registerJobHandlers } = await import(
      "../src/server/modules/jobs/service.js"
    );
    await registerJobHandlers(
      ctx.jobs,
      ctx.files,
      ctx.books,
      ctx.audiobooks,
      ctx.movies,
      ctx.tv,
      ctx.podcasts,
      ctx.people,
      ctx.music,
      ctx.metadata,
      ctx.metadataPolicy,
      ctx.metadataCanonical,
      ctx.metadataRegistry,
      ctx.metadataFormatting,
      ctx.coverPipeline,
      ctx.db,
      ctx.downloads,
      ctx.representations,
      ctx.epubPublication,
      ctx.playback,
      ctx.search,
      pipeline,
    );
  });

  afterAll(async () => {
    await ctx.jobs.stop();
    await pool.end();
  });

  it("auto-creates Books library and completes ingest when none exists", async () => {
    await ctx.db
      .delete(schema.libraries)
      .where(eq(schema.libraries.contentType, "book"));
    const bookLibsBefore = await ctx.db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.contentType, "book"));
    expect(bookLibsBefore.length).toBe(0);

    const ingestLoc = await ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, ingestStorageId),
    });
    const epubPath = path.join(ingestLoc!.rootPath, "auto-lib.epub");
    await fs.writeFile(
      epubPath,
      await buildMinimalEpub({ title: "Auto Library Book" }),
    );

    const result = await ctx.ingest.reconcileFilesystemFile({
      ingestRootId,
      storageLocationId: ingestStorageId,
      relativePath: "auto-lib.epub",
      originalFilename: "auto-lib.epub",
      size: (await fs.stat(epubPath)).size,
    });

    await ctx.jobs.stop();
    await ctx.ingest.getPipeline().process(result.item.id);

    const item = await ctx.ingest.items.getById(result.item.id);
    expect(item?.status).toBe("completed");
    expect(item?.terminalState).toBeNull();
    expect(item?.workType).toBe("book");

    const librariesAfter = await ctx.db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.contentType, "book"));
    expect(librariesAfter.length).toBe(1);
    expect(librariesAfter[0]!.name).toBe("Books");
    expect(item?.targetLibraryId).toBe(librariesAfter[0]!.id);
  });
});
