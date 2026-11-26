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
import { resolveProgressConflict } from "../src/server/modules/reading-progress/conflict.js";

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

describe("Reading progress conflict resolver", () => {
  it("rejects stale clientUpdatedAt", () => {
    const result = resolveProgressConflict({
      storedClientUpdatedAt: new Date("2026-01-02T00:00:00Z"),
      storedVersion: 2,
      storedLocator: { type: "epub-cfi", cfi: "a", progression: 0.5 },
      storedIdempotencyKey: null,
      incomingClientUpdatedAt: new Date("2026-01-01T00:00:00Z"),
      incomingIdempotencyKey: null,
      incomingLocator: { type: "epub-cfi", cfi: "b", progression: 0.6 },
    });
    expect(result.action).toBe("reject_stale");
  });

  it("returns idempotent for matching idempotency key", () => {
    const result = resolveProgressConflict({
      storedClientUpdatedAt: new Date("2026-01-02T00:00:00Z"),
      storedVersion: 2,
      storedLocator: { type: "epub-cfi", cfi: "a" },
      storedIdempotencyKey: "key-1",
      incomingClientUpdatedAt: new Date("2026-01-03T00:00:00Z"),
      incomingIdempotencyKey: "key-1",
      incomingLocator: { type: "epub-cfi", cfi: "b" },
    });
    expect(result.action).toBe("idempotent");
  });

  it("merges locators on accept", () => {
    const result = resolveProgressConflict({
      storedClientUpdatedAt: null,
      storedVersion: 1,
      storedLocator: { type: "epub-cfi", cfi: "stored", href: "ch1.xhtml" },
      storedIdempotencyKey: null,
      incomingClientUpdatedAt: new Date("2026-01-03T00:00:00Z"),
      incomingIdempotencyKey: null,
      incomingLocator: {
        type: "epub-cfi",
        cfi: "incoming",
        progression: 0.4,
      },
    });
    expect(result.action).toBe("accept");
    if (result.action === "accept") {
      expect(result.locator.cfi).toBe("incoming");
      expect(result.locator.href).toBe("ch1.xhtml");
    }
  });
});

describe("ReadingProgressService", () => {
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
      path.join(os.tmpdir(), "feylore-reading-progress-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);
    ctx = createContext(loadConfig(), db);

    userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "reading-progress@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "reading-progress@test.local",
      username: "readingprogress",
      displayName: "Reading Progress",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    bookId = await ctx.books.createBook({
      title: "Reading Progress Book",
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

  it.skipIf(!dbAvailable)("stores representation-scoped progress", async () => {
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/4!/4/2/1:0)",
      progression: 0.25,
      totalProgression: 0.1,
    };
    const result = await ctx.readingProgress.setProgress(
      userId,
      representationId,
      { locator },
    );
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.progress.representationId).toBe(representationId);
      expect(result.progress.locator.cfi).toBe(locator.cfi);
    }

    const saved = await ctx.readingProgress.getProgress(userId, representationId);
    expect(saved?.locator.cfi).toBe(locator.cfi);
  });

  it.skipIf(!dbAvailable)("derives primary work progress", async () => {
    const primary = await ctx.readingProgress.getPrimaryProgressForWork(
      userId,
      "book",
      bookId,
    );
    expect(primary?.representationId).toBe(representationId);
    expect(primary?.progress.locator.cfi).toBeDefined();
  });

  it.skipIf(!dbAvailable)("rejects stale updates", async () => {
    await ctx.readingProgress.setProgress(userId, representationId, {
      locator: { type: "epub-cfi", cfi: "current", progression: 0.5 },
      clientUpdatedAt: "2026-06-01T12:00:00Z",
    });
    const stale = await ctx.readingProgress.setProgress(
      userId,
      representationId,
      {
        locator: { type: "epub-cfi", cfi: "stale", progression: 0.1 },
        clientUpdatedAt: "2020-01-01T00:00:00Z",
      },
    );
    expect(stale.accepted).toBe(false);
    if (!stale.accepted) {
      expect(stale.reason).toBe("stale");
    }
  });
});
