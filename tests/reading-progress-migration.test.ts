import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq, and } from "drizzle-orm";
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
import { toStoredReadingLocator } from "../src/shared/progress-locator.js";

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

describe("Reading progress migration", () => {
  let pool: ReturnType<typeof createPool>;
  let ctx: ReturnType<typeof createContext>;
  let userId = "";
  let bookId = "";
  let representationId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-reading-migration-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);
    ctx = createContext(loadConfig(), db);

    userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "reading-migration@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "reading-migration@test.local",
      username: "readingmigration",
      displayName: "Migration",
      passwordHash: await hash("password123"),
    });

    bookId = await ctx.books.createBook({
      title: "Migration Book",
      authors: ["Author"],
    });
    await ctx.libraryMembership.ensureWorkMembership(userId, "book", bookId);

    const expressionId = generateId();
    const manifestationId = generateId();
    representationId = generateId();
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
      id: representationId,
      manifestationId,
      format: "epub",
      domainModule: "books",
    });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("reading_progress table accepts representation-scoped rows", async () => {
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/2)",
      progression: 0.15,
    };
    await ctx.db.insert(schema.readingProgress).values({
      id: generateId(),
      userId,
      representationId,
      workType: "book",
      workId: bookId,
      locatorJson: toStoredReadingLocator(locator) as Record<string, unknown>,
    });

    const row = await ctx.db.query.readingProgress.findFirst({
      where: and(
        eq(schema.readingProgress.userId, userId),
        eq(schema.readingProgress.representationId, representationId),
      ),
    });
    expect(row?.workId).toBe(bookId);
    expect((row?.locatorJson as { cfi?: string }).cfi).toBe(locator.cfi);
  });

  it.skipIf(!dbAvailable)("user_progress book reading rows use reading_progress after migration path", async () => {
    const legacyLocator = toStoredReadingLocator({
      type: "epub-cfi",
      cfi: "epubcfi(/6/legacy)",
      progression: 0.05,
    });
    const legacyId = generateId();
    await ctx.db.insert(schema.userProgress).values({
      id: legacyId,
      userId,
      subjectType: "book",
      subjectId: bookId,
      locatorJson: legacyLocator,
      representationId,
    });

    const migrated = await ctx.readingProgress.setProgress(
      userId,
      representationId,
      {
        locator: { type: "epub-cfi", cfi: "epubcfi(/6/new)", progression: 0.1 },
      },
    );
    expect(migrated.accepted).toBe(true);

    const legacyStill = await ctx.db.query.userProgress.findFirst({
      where: eq(schema.userProgress.id, legacyId),
    });
    expect(legacyStill).toBeTruthy();
  });
});
