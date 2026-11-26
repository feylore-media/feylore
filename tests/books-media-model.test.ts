import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { ensureTestUser } from "./helpers/test-user.js";
import { createContext } from "../src/server/context.js";
import { loadConfig } from "../src/server/config.js";
import { runLibraryScan } from "../src/server/modules/jobs/service.js";
import { FileService, FileReferenceRegistry } from "../src/server/modules/files/service.js";
import { StorageService } from "../src/server/modules/storage/adapter.js";
import { RepresentationService } from "../src/server/modules/representations/service.js";

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

describe("WEM media model invariants", () => {
  let pool: ReturnType<typeof createPool>;
  let storageRoot = "";
  let storageId = "";
  let userId = "";
  let epubFileA = "";
  let epubFileB = "";
  let ctx: ReturnType<typeof createContext>;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-wem-"));

    try {
      pool = createPool(DATABASE_URL);
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: "./drizzle" });
      await seed(db);
    } catch {
      console.warn("PostgreSQL unavailable — skipping WEM media model tests.");
      return;
    }

    const config = loadConfig();
    ctx = createContext(config, createDb(pool));
    await ctx.jobs.start();

    userId = await ensureTestUser(ctx.db, "wem@test.local", {
      username: "wemuser",
      displayName: "WEM User",
    });
    await ctx.db.insert(schema.userPreferences).values({ userId });

    storageId = generateId();
    await ctx.db.insert(schema.storageLocations).values({
      id: storageId,
      name: "WEM Test",
      kind: "managed",
      rootPath: storageRoot,
    });

    await fs.writeFile(
      path.join(storageRoot, "book-one.epub"),
      "epub content a",
    );
    await fs.writeFile(
      path.join(storageRoot, "book-one.pdf"),
      "pdf content b",
    );

    epubFileA = generateId();
    epubFileB = generateId();
    await ctx.db.insert(schema.files).values([
      {
        id: epubFileA,
        storageLocationId: storageId,
        relativePath: "book-one.epub",
        size: 14,
        mediaType: "application/epub+zip",
      },
      {
        id: epubFileB,
        storageLocationId: storageId,
        relativePath: "book-one.pdf",
        size: 14,
        mediaType: "application/pdf",
      },
    ]);
  }, 60000);

  afterAll(async () => {
    if (!dbAvailable) return;
    await ctx?.jobs.stop();
    await pool?.end();
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it.skipIf(!dbAvailable)(
    "association creates WEM chain and library membership without scan creating works",
    async () => {
      const filesBefore = await ctx.db.select().from(schema.books);
      const countBefore = filesBefore.length;

      await runLibraryScan(ctx.jobs, ctx.files, {
        storageLocationId: storageId,
        feyloreJobId: generateId(),
      });

      const booksAfterScan = await ctx.db.select().from(schema.books);
      expect(booksAfterScan.length).toBe(countBefore);

      const result = await ctx.books.associateFile(epubFileA, userId);
      expect(result.skipped).toBe(false);
      if (result.skipped) return;

      const book = await ctx.db.query.books.findFirst({
        where: eq(schema.books.id, result.bookId),
      });
      expect(book).toBeTruthy();

      const expression = await ctx.db.query.creativeWorkExpressions.findFirst({
        where: eq(schema.creativeWorkExpressions.id, result.expressionId),
      });
      expect(expression?.workType).toBe("book");
      expect(expression?.workId).toBe(result.bookId);

      const manifestation =
        await ctx.db.query.creativeWorkManifestations.findFirst({
          where: eq(
            schema.creativeWorkManifestations.id,
            result.manifestationId!,
          ),
        });
      expect(manifestation?.expressionId).toBe(result.expressionId);

      const membership = await ctx.db.query.libraryMemberships.findFirst({
        where: and(
          eq(schema.libraryMemberships.userId, userId),
          eq(schema.libraryMemberships.targetType, "book"),
          eq(schema.libraryMemberships.targetId, result.bookId),
        ),
      });
      expect(membership).toBeTruthy();
    },
  );

  it.skipIf(!dbAvailable)(
    "file delete detaches from representation; book and membership survive",
    async () => {
      const assoc = await ctx.books.associateFile(epubFileB, userId);
      expect(assoc.skipped).toBe(false);
      if (assoc.skipped) return;

      const storage = new StorageService();
      storage.register({
        id: storageId,
        name: "t",
        kind: "managed",
        rootPath: storageRoot,
      });
      const registry = new FileReferenceRegistry();
      const repService = new RepresentationService(createDb(pool));
      repService.registerDetachHandler(registry);
      const files = new FileService(createDb(pool), storage, registry);

      await files.deleteFile(epubFileB);

      const book = await ctx.db.query.books.findFirst({
        where: eq(schema.books.id, assoc.bookId),
      });
      expect(book).toBeTruthy();

      const membership = await ctx.db.query.libraryMemberships.findFirst({
        where: and(
          eq(schema.libraryMemberships.userId, userId),
          eq(schema.libraryMemberships.targetId, assoc.bookId),
        ),
      });
      expect(membership).toBeTruthy();

      const links = await ctx.db
        .select()
        .from(schema.representationFiles)
        .where(eq(schema.representationFiles.fileId, epubFileB));
      expect(links.length).toBe(0);

      const rep = await ctx.db.query.representations.findFirst({
        where: eq(schema.representations.id, assoc.representationId),
      });
      expect(rep?.unavailableAt).toBeTruthy();
    },
  );

  it.skipIf(!dbAvailable)(
    "representation with multiple files survives partial file delete",
    async () => {
      const file2 = generateId();
      await ctx.db.insert(schema.files).values({
        id: file2,
        storageLocationId: storageId,
        relativePath: "extra.epub",
        size: 10,
        mediaType: "application/epub+zip",
      });

      const bookId = await ctx.books.createBook({ title: "Multi File Book" });
      const expressionId = generateId();
      await ctx.db.insert(schema.creativeWorkExpressions).values({
        id: expressionId,
        workType: "book",
        workId: bookId,
      });
      const manifestationId = generateId();
      await ctx.db.insert(schema.creativeWorkManifestations).values({
        id: manifestationId,
        expressionId,
      });
      const repId = await ctx.representations.create({
        format: "epub",
        domainModule: "books",
        manifestationId,
      });

      const file1 = generateId();
      await ctx.db.insert(schema.files).values({
        id: file1,
        storageLocationId: storageId,
        relativePath: "part1.epub",
        size: 10,
      });
      await ctx.representations.linkFile(repId, file1, "content");
      await ctx.representations.linkFile(repId, file2, "content");

      await ctx.representations.detachFile(file1);

      const remaining = await ctx.representations.listFilesForRepresentation(
        repId,
      );
      expect(remaining.length).toBe(1);
      expect(remaining[0]?.fileId).toBe(file2);

      const rep = await ctx.representations.get(repId);
      expect(rep.unavailableAt).toBeNull();
    },
  );

  it.skipIf(!dbAvailable)("representation_files has no is_primary column", () => {
    const columns = Object.keys(schema.representationFiles);
    expect(columns).not.toContain("isPrimary");
    expect(columns).not.toContain("is_primary");
  });

  it.skipIf(!dbAvailable)(
    "library membership normally targets Work",
    async () => {
      const bookId = await ctx.books.createBook({ title: "Membership Test" });
      await ctx.libraryMembership.ensureWorkMembership(
        userId,
        "book",
        bookId,
      );

      const rows = await ctx.libraryMembership.listForUser(userId, "book");
      expect(rows.some((r) => r.targetId === bookId)).toBe(true);
    },
  );

  it.skipIf(!dbAvailable)(
    "progress record survives when representation file is detached",
    async () => {
      const bookId = await ctx.books.createBook({ title: "Progress Book" });
      const progressId = generateId();
      await ctx.db.insert(schema.userProgress).values({
        id: progressId,
        userId,
        subjectType: "book",
        subjectId: bookId,
        locatorJson: { href: "/chapter/1", progression: 0.5 },
      });

      const fileId = generateId();
      await ctx.db.insert(schema.files).values({
        id: fileId,
        storageLocationId: storageId,
        relativePath: "progress.epub",
        size: 10,
      });
      const repId = await ctx.representations.create({
        format: "epub",
        domainModule: "books",
      });
      await ctx.representations.linkFile(repId, fileId);
      await ctx.representations.detachFile(fileId);

      const progress = await ctx.db.query.userProgress.findFirst({
        where: eq(schema.userProgress.id, progressId),
      });
      expect(progress).toBeTruthy();
      expect(progress?.locatorJson).toEqual({
        href: "/chapter/1",
        progression: 0.5,
      });
    },
  );
});
