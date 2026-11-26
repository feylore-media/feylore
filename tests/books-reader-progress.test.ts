import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
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

async function linkRepresentation(
  ctx: ReturnType<typeof createContext>,
  db: ReturnType<typeof createDb>,
  bookId: string,
  fileId?: string,
) {
  const expressionId = generateId();
  const manifestationId = generateId();
  const repId = generateId();
  await db.insert(schema.creativeWorkExpressions).values({
    id: expressionId,
    workType: "book",
    workId: bookId,
    label: "default",
  });
  await db.insert(schema.creativeWorkManifestations).values({
    id: manifestationId,
    expressionId,
    label: "default",
  });
  await db.insert(schema.representations).values({
    id: repId,
    manifestationId,
    format: "epub",
    domainModule: "books",
  });
  if (fileId) {
    await ctx.representations.linkFile(repId, fileId);
  }
  return repId;
}

describe("Books reader progress", () => {
  let pool: ReturnType<typeof createPool>;
  let ctx: ReturnType<typeof createContext>;
  let userId = "";
  let bookId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-reader-"),
    );

    try {
      pool = createPool(DATABASE_URL);
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: "./drizzle" });
      await seed(db);
    } catch (e) {
      console.error("Reader progress test setup failed:", e);
      throw e;
    }

    ctx = createContext(loadConfig(), createDb(pool));
    userId = generateId();
    await ctx.db
      .delete(schema.users)
      .where(eq(schema.users.email, "reader@test.local"));
    await ctx.db.insert(schema.users).values({
      id: userId,
      email: "reader@test.local",
      username: "readeruser",
      displayName: "Reader",
      passwordHash: await hash("password123"),
    });

    bookId = await ctx.books.createBook({
      title: "Progress Test",
      authors: ["Author"],
    });
    await ctx.libraryMembership.ensureWorkMembership(userId, "book", bookId);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("round-trips CFI locator", async () => {
    const repId = await linkRepresentation(ctx, ctx.db, bookId);
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/4!/4/2/1:0)",
      progression: 0.5,
      totalProgression: 0.2,
    };
    await ctx.readingProgress.setProgress(userId, repId, { locator });
    const primary = await ctx.readingProgress.getPrimaryProgressForWork(
      userId,
      "book",
      bookId,
    );
    expect(primary?.progress.locator.cfi).toBe(locator.cfi);
    expect(primary?.progress.locator.progression).toBe(0.5);
  });

  it.skipIf(!dbAvailable)("progress survives representation file detach", async () => {
    const storageId = generateId();
    await ctx.db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Reader Test Storage",
      kind: "managed",
      rootPath: process.env.STORAGE_ROOT!,
    });
    const fileId = generateId();
    await ctx.db.insert(schema.files).values({
      id: fileId,
      storageLocationId: storageId,
      relativePath: "detach-test.epub",
      size: 10,
    });
    const repId = await linkRepresentation(ctx, ctx.db, bookId, fileId);
    await ctx.readingProgress.setProgress(userId, repId, {
      locator: { type: "epub-cfi", cfi: "epubcfi(/6/2)" },
    });

    await ctx.representations.detachFile(fileId);

    const progress = await ctx.readingProgress.getProgress(userId, repId);
    expect(progress?.locator.cfi).toBe("epubcfi(/6/2)");
  });

  it.skipIf(!dbAvailable)("progress uses saved representation on resume", async () => {
    const storageId = generateId();
    await ctx.db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Rep Resume Storage",
      kind: "managed",
      rootPath: process.env.STORAGE_ROOT!,
    });
    const fileId = generateId();
    await ctx.db.insert(schema.files).values({
      id: fileId,
      storageLocationId: storageId,
      relativePath: "rep-resume.epub",
      size: 10,
    });
    const repId = await linkRepresentation(ctx, ctx.db, bookId, fileId);
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/8!/4/2/1:0)",
      href: "chapter2.xhtml",
      totalProgression: 0.42,
    };
    await ctx.readingProgress.setProgress(userId, repId, { locator });

    const primary = await ctx.readingProgress.getPrimaryProgressForWork(
      userId,
      "book",
      bookId,
    );
    expect(primary?.representationId).toBe(repId);
    expect(primary?.progress.locator.href).toBe("chapter2.xhtml");
    expect(primary?.progress.locator.totalProgression).toBe(0.42);
  });
});
