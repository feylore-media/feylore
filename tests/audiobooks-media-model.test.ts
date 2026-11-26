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

describe("Audiobook WEM media model", () => {
  let pool: ReturnType<typeof createPool>;
  let storageRoot = "";
  let storageId = "";
  let userId = "";
  let ctx: ReturnType<typeof createContext>;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-ab-wem-"));

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const config = loadConfig();
    ctx = createContext(config, db);
    await ctx.jobs.start();

    userId = await ensureTestUser(ctx.db, "ab-wem@test.local", {
      username: "abwem",
      displayName: "AB WEM User",
    });
    await ctx.db.insert(schema.userPreferences).values({ userId });

    storageId = generateId();
    await ctx.db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Audiobook WEM Test",
      kind: "managed",
      rootPath: storageRoot,
    });
  }, 60000);

  afterAll(async () => {
    if (!dbAvailable) return;
    await ctx?.jobs.stop();
    await pool?.end();
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it.skipIf(!dbAvailable)(
    "stores ASIN on manifestation, not on audiobook Work",
    async () => {
      const fileId = generateId();
      await fs.writeFile(path.join(storageRoot, "asin-test.mp3"), "audio");
      await ctx.db.insert(schema.files).values({
        id: fileId,
        storageLocationId: storageId,
        relativePath: "asin-test.mp3",
        size: 5,
        mediaType: "audio/mpeg",
      });

      const result = await ctx.audiobooks.associateFile(fileId, userId);
      expect(result.skipped).toBe(false);
      if (result.skipped) return;

      const work = await ctx.db.query.audiobooks.findFirst({
        where: eq(schema.audiobooks.id, result.audiobookId),
      });
      expect(work).toBeTruthy();
      const workColumns = Object.keys(schema.audiobooks);
      expect(workColumns).not.toContain("runtimeSeconds");
      expect(workColumns).not.toContain("asin");

      const manifestation =
        await ctx.db.query.creativeWorkManifestations.findFirst({
          where: eq(schema.creativeWorkManifestations.id, result.manifestationId!),
        });
      expect(manifestation).toBeTruthy();

      await ctx.db
        .update(schema.creativeWorkManifestations)
        .set({ externalIdType: "asin", externalId: "B012345678" })
        .where(eq(schema.creativeWorkManifestations.id, result.manifestationId!));

      const detail = await ctx.audiobooks.getAudiobookDetail(
        result.audiobookId,
        userId,
      );
      expect(
        detail.manifestations.some((m) => m.externalId === "B012345678"),
      ).toBe(true);
    },
  );

  it.skipIf(!dbAvailable)(
    "derives representation runtime from file technical metadata",
    async () => {
      const audiobookId = await ctx.audiobooks.createAudiobook({
        title: "Runtime Test",
      });
      const expressionId = generateId();
      await ctx.db.insert(schema.creativeWorkExpressions).values({
        id: expressionId,
        workType: "audiobook",
        workId: audiobookId,
      });
      const manifestationId = generateId();
      await ctx.db.insert(schema.creativeWorkManifestations).values({
        id: manifestationId,
        expressionId,
      });
      const repId = await ctx.representations.create({
        format: "mp3",
        domainModule: "audiobooks",
        manifestationId,
      });

      const file1 = generateId();
      const file2 = generateId();
      await ctx.db.insert(schema.files).values([
        {
          id: file1,
          storageLocationId: storageId,
          relativePath: "part1.mp3",
          size: 10,
        },
        {
          id: file2,
          storageLocationId: storageId,
          relativePath: "part2.mp3",
          size: 10,
        },
      ]);
      await ctx.representations.linkFile(repId, file1, "content", 0);
      await ctx.representations.linkFile(repId, file2, "content", 1);

      await ctx.db.insert(schema.fileTechnicalMetadata).values([
        {
          id: generateId(),
          fileId: file1,
          extractor: "test",
          payload: { durationSeconds: 120 },
        },
        {
          id: generateId(),
          fileId: file2,
          extractor: "test",
          payload: { durationSeconds: 180 },
        },
      ]);

      const runtime = await ctx.audiobooks.deriveRepresentationRuntime(repId);
      expect(runtime).toBe(300);
    },
  );

  it.skipIf(!dbAvailable)(
    "deleting audiobook file does not delete related book Work",
    async () => {
      const bookId = await ctx.books.createBook({ title: "Related Book" });
      const audioFileId = generateId();
      await fs.writeFile(path.join(storageRoot, "related.mp3"), "audio");
      await ctx.db.insert(schema.files).values({
        id: audioFileId,
        storageLocationId: storageId,
        relativePath: "related.mp3",
        size: 5,
        mediaType: "audio/mpeg",
      });

      const assoc = await ctx.audiobooks.associateFile(audioFileId, userId);
      expect(assoc.skipped).toBe(false);
      if (assoc.skipped) return;

      await ctx.relationships.create({
        sourceType: "audiobook",
        sourceId: assoc.audiobookId,
        targetType: "book",
        targetId: bookId,
        relationshipType: "related_edition",
      });

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

      await files.deleteFile(audioFileId);

      const book = await ctx.db.query.books.findFirst({
        where: eq(schema.books.id, bookId),
      });
      expect(book).toBeTruthy();

      const audiobook = await ctx.db.query.audiobooks.findFirst({
        where: eq(schema.audiobooks.id, assoc.audiobookId),
      });
      expect(audiobook).toBeTruthy();

      const rels = await ctx.relationships.listForSource(
        "audiobook",
        assoc.audiobookId,
      );
      expect(rels.some((r) => r.targetId === bookId)).toBe(true);
    },
  );

  it.skipIf(!dbAvailable)(
    "representation_files preserves explicit sortOrder",
    async () => {
      const repId = await ctx.representations.create({
        format: "mp3",
        domainModule: "audiobooks",
      });
      const ordered = ["c.mp3", "a.mp3", "b.mp3"];
      const fileIds: string[] = [];
      for (let i = 0; i < ordered.length; i++) {
        const id = generateId();
        fileIds.push(id);
        await ctx.db.insert(schema.files).values({
          id,
          storageLocationId: storageId,
          relativePath: ordered[i]!,
          size: 10,
        });
        await ctx.representations.linkFile(repId, id, "content", i);
      }

      const links = await ctx.representations.listFilesForRepresentation(repId);
      expect(links.map((l) => l.sortOrder)).toEqual([0, 1, 2]);
      expect(links.map((l) => l.fileId)).toEqual(fileIds);
    },
  );

  it.skipIf(!dbAvailable)("library membership targets audiobook Work", async () => {
    const audiobookId = await ctx.audiobooks.createAudiobook({
      title: "Membership Audiobook",
    });
    await ctx.libraryMembership.ensureWorkMembership(
      userId,
      "audiobook",
      audiobookId,
    );

    const rows = await ctx.libraryMembership.listForUser(userId, "audiobook");
    expect(rows.some((r) => r.targetId === audiobookId)).toBe(true);

    const membership = await ctx.db.query.libraryMemberships.findFirst({
      where: and(
        eq(schema.libraryMemberships.userId, userId),
        eq(schema.libraryMemberships.targetType, "audiobook"),
        eq(schema.libraryMemberships.targetId, audiobookId),
      ),
    });
    expect(membership).toBeTruthy();
  });
});
