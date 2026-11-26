import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPool, createDb } from "../src/server/db/client.js";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { createContext } from "../src/server/context.js";
import { loadConfig } from "../src/server/config.js";
import { runMetadataIngest } from "../src/server/modules/metadata/ingest.js";
import { runBookMetadataResolution } from "../src/server/modules/metadata/book-metadata-resolution.js";
import { EXTRACTOR_EPUB_OPF } from "../src/server/modules/metadata/extractors/epub-opf.js";
import { EXTRACTOR_FILENAME } from "../src/server/modules/metadata/extractors/filename.js";
import { buildMinimalEpub } from "./fixtures/epub/build-minimal-epub.js";

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

describe("metadata ingest", () => {
  let pool: ReturnType<typeof createPool>;
  let ctx: ReturnType<typeof createContext>;
  let storageRoot = "";
  let storageId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-ingest-"));
    process.env.STORAGE_ROOT = storageRoot;

    try {
      pool = createPool(DATABASE_URL);
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: "./drizzle" });
      await seed(db);
    } catch {
      console.warn("PostgreSQL unavailable — skipping metadata ingest tests");
      return;
    }

    const config = loadConfig();
    ctx = createContext(config, createDb(pool));
    await ctx.jobs.start();

    storageId = generateId();
    await ctx.db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Ingest Test",
      kind: "managed",
      rootPath: storageRoot,
    });
    await ctx.files.loadStorageLocations();
  }, 60000);

  afterAll(async () => {
    if (!dbAvailable) return;
    await ctx?.jobs.stop();
    await pool?.end();
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  async function registerEpub(
    relativePath: string,
    buffer: Buffer,
  ): Promise<string> {
    await fs.writeFile(path.join(storageRoot, relativePath), buffer);
    const fileId = generateId();
    await ctx.db.insert(schema.files).values({
      id: fileId,
      storageLocationId: storageId,
      relativePath,
      size: buffer.length,
      mediaType: "application/epub+zip",
    });
    return fileId;
  }

  it.skipIf(!dbAvailable)(
    "ingests OPF metadata and cover after association",
    async () => {
      const buffer = await buildMinimalEpub({
        title: "Ingested Title",
        authors: ["Metadata Author"],
        subjects: ["Science Fiction"],
        isbn: "978-0-999999-99-9",
        withCover: true,
      });
      const fileId = await registerEpub("ingest-test.epub", buffer);

      const result = await ctx.books.associateFile(fileId);
      expect(result.skipped).toBe(false);
      if (result.skipped) return;

      const pendingBook = await ctx.db.query.books.findFirst({
        where: eq(schema.books.id, result.bookId),
      });
      expect(pendingBook?.slugStatus).toBe("pending");
      expect(pendingBook?.slug).toBe(pendingBook?.id);

      const jobId = generateId();
      await ctx.db.insert(schema.jobRuns).values({
        id: jobId,
        type: "metadata.ingest",
        taskKey: result.representationId,
        status: "queued",
        payload: {
          fileId,
          bookId: result.bookId,
          representationId: result.representationId,
          manifestationId: result.manifestationId!,
        },
      });

      await runMetadataIngest(
        ctx.jobs,
        ctx.db,
        ctx.files,
        ctx.metadata,
        ctx.metadataPolicy,
        ctx.metadataCanonical,
        ctx.metadataRegistry,
        ctx.books,
        ctx.audiobooks,
        ctx.music,
        ctx.movies,
        ctx.coverPipeline,
        {
          fileId,
          bookId: result.bookId,
          representationId: result.representationId,
          manifestationId: result.manifestationId!,
          feyloreJobId: jobId,
        },
      );

      const book = await ctx.db.query.books.findFirst({
        where: eq(schema.books.id, result.bookId),
      });
      expect(book?.title).toBe("Ingested Title");
      expect(book?.slugStatus).toBe("canonical");
      expect(book?.slug).toMatch(/^ingested-title(-\d+)?$/);
      expect(book?.coverFileId).toBeTruthy();

      const authors = await ctx.db
        .select()
        .from(schema.bookAuthors)
        .where(eq(schema.bookAuthors.bookId, result.bookId));
      expect(authors.map((a) => a.name)).toEqual(["Metadata Author"]);

      const genres = await ctx.db
        .select()
        .from(schema.bookGenres)
        .where(eq(schema.bookGenres.bookId, result.bookId));
      expect(genres.map((g) => g.name)).toEqual(["Science Fiction"]);

      const techMeta = await ctx.db
        .select()
        .from(schema.fileTechnicalMetadata)
        .where(eq(schema.fileTechnicalMetadata.fileId, fileId));
      expect(techMeta.some((m) => m.extractor === EXTRACTOR_EPUB_OPF)).toBe(
        true,
      );
      expect(techMeta.some((m) => m.extractor === EXTRACTOR_FILENAME)).toBe(
        true,
      );

      const records = await ctx.db
        .select()
        .from(schema.metadataRecords)
        .where(eq(schema.metadataRecords.subjectId, result.bookId));
      expect(records.length).toBeGreaterThanOrEqual(2);

      const manifestation =
        await ctx.db.query.creativeWorkManifestations.findFirst({
          where: eq(
            schema.creativeWorkManifestations.id,
            result.manifestationId!,
          ),
        });
      expect(manifestation?.externalIdType).toBe("isbn13");
      expect(manifestation?.externalId).toBe("9780999999999");
    },
  );

  it.skipIf(!dbAvailable)(
    "preserves user title override during ingest",
    async () => {
      const buffer = await buildMinimalEpub({
        title: "OPF Title",
        authors: ["Someone"],
      });
      const fileId = await registerEpub("override-test.epub", buffer);
      const result = await ctx.books.associateFile(fileId);
      expect(result.skipped).toBe(false);
      if (result.skipped) return;

      const userId = generateId();
      const email = `override-${userId}@test.local`;
      const username = `override-${userId}`;
      await ctx.db.delete(schema.users).where(eq(schema.users.email, email));
      await ctx.db.insert(schema.users).values({
        id: userId,
        email,
        username,
        passwordHash: "hash",
        displayName: "Override User",
      });

      await ctx.metadata.setOverride({
        subjectType: "book",
        subjectId: result.bookId,
        field: "title",
        value: "User Title",
        userId,
      });

      const jobId = generateId();
      await ctx.db.insert(schema.jobRuns).values({
        id: jobId,
        type: "metadata.ingest",
        taskKey: jobId,
        status: "queued",
        payload: {},
      });

      await runMetadataIngest(
        ctx.jobs,
        ctx.db,
        ctx.files,
        ctx.metadata,
        ctx.metadataPolicy,
        ctx.metadataCanonical,
        ctx.metadataRegistry,
        ctx.books,
        ctx.audiobooks,
        ctx.music,
        ctx.movies,
        ctx.coverPipeline,
        {
          fileId,
          bookId: result.bookId,
          representationId: result.representationId,
          manifestationId: result.manifestationId!,
          feyloreJobId: jobId,
        },
      );

      const overrides = await ctx.metadata.getOverrides("book", result.bookId);
      const titleOverride = overrides.find((o) => o.field === "title");
      expect(titleOverride?.value).toBe("User Title");

      const detail = await ctx.books.getBookDetail(result.bookId, userId);
      expect(detail.title).toBe("User Title");
    },
  );

  it.skipIf(!dbAvailable)(
    "provider refresh does not re-merge ingest extraction into canonical metadata",
    async () => {
      const buffer = await buildMinimalEpub({
        title: "Canonical Title",
        authors: ["Author"],
      });
      const fileId = await registerEpub("provider-refresh.epub", buffer);
      const result = await ctx.books.associateFile(fileId);
      expect(result.skipped).toBe(false);
      if (result.skipped) return;

      const jobId = generateId();
      await ctx.db.insert(schema.jobRuns).values({
        id: jobId,
        type: "metadata.ingest",
        taskKey: result.representationId,
        status: "queued",
        payload: {
          fileId,
          bookId: result.bookId,
          representationId: result.representationId,
          manifestationId: result.manifestationId!,
        },
      });

      await runMetadataIngest(
        ctx.jobs,
        ctx.db,
        ctx.files,
        ctx.metadata,
        ctx.metadataPolicy,
        ctx.metadataCanonical,
        ctx.metadataRegistry,
        ctx.books,
        ctx.audiobooks,
        ctx.music,
        ctx.movies,
        ctx.coverPipeline,
        {
          fileId,
          bookId: result.bookId,
          representationId: result.representationId,
          manifestationId: result.manifestationId!,
          feyloreJobId: jobId,
        },
      );

      await ctx.metadata.storeExtractorRecord({
        providerKey: EXTRACTOR_FILENAME,
        subjectType: "book",
        subjectId: result.bookId,
        payload: { title: "Filename Should Not Win" },
      });
      await ctx.metadata.storeExtractorRecord({
        providerKey: EXTRACTOR_EPUB_OPF,
        subjectType: "book",
        subjectId: result.bookId,
        payload: { title: "OPF Should Not Win", authors: ["Other"] },
      });

      await runBookMetadataResolution(
        ctx.files,
        ctx.metadata,
        ctx.metadataPolicy,
        ctx.metadataCanonical,
        ctx.metadataRegistry,
        ctx.books,
        ctx.coverPipeline,
        {
          fileId,
          bookId: result.bookId,
          representationId: result.representationId,
          manifestationId: result.manifestationId!,
          mode: "providers_only",
        },
      );

      const book = await ctx.db.query.books.findFirst({
        where: eq(schema.books.id, result.bookId),
      });
      expect(book?.title).toBe("Canonical Title");
    },
  );
});
