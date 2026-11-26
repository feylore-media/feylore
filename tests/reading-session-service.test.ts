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

describe("ReadingSessionService", () => {
  let pool: ReturnType<typeof createPool>;
  let ctx: ReturnType<typeof createContext>;
  let userId = "";
  let representationId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-reading-sessions-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);
    ctx = createContext(loadConfig(), db);

    userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "reading-sessions@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "reading-sessions@test.local",
      username: "readingsessions",
      displayName: "Sessions",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    const bookId = await ctx.books.createBook({
      title: "Session Book",
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

  it.skipIf(!dbAvailable)("short session does not qualify", async () => {
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/short)",
      progression: 0.05,
    };
    const result = await ctx.readingActivity.recordActivity(
      userId,
      representationId,
      {
        locator,
        duration: 30,
        visibility: "active",
        clientId: "short-session",
        idempotencyKey: "short-only",
        startedAt: new Date(Date.now() - 30_000).toISOString(),
      },
    );
    expect(result.sessionStatus).toBe("pending");

    const session = await ctx.readingSessions.getSession(
      userId,
      result.sessionId,
    );
    expect(session?.activeDuration).toBe(30);
    expect(session?.status).toBe("pending");
  });

  it.skipIf(!dbAvailable)("multiple activities sum to qualify session", async () => {
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/qualify)",
      progression: 0.5,
    };
    for (let i = 0; i < 5; i++) {
      await ctx.readingActivity.recordActivity(userId, representationId, {
        locator: { ...locator, progression: 0.1 * (i + 1) },
        duration: 60,
        visibility: "active",
        clientId: "multi-qualify",
        idempotencyKey: `multi-qualify-${i}`,
        startedAt: new Date(Date.now() - (5 - i) * 60_000).toISOString(),
      });
    }
    const sessions = await ctx.readingSessions.listSessions(userId, {
      representationId,
    });
    const qualified = sessions.find((s) => s.clientId === "multi-qualify");
    expect(qualified?.status).toBe("qualified");
    expect(qualified!.activeDuration).toBeGreaterThanOrEqual(300);
  });

  it.skipIf(!dbAvailable)("progress sync works without qualified session", async () => {
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/progress-only)",
      progression: 0.12,
    };
    await ctx.readingActivity.recordActivity(userId, representationId, {
      locator,
      duration: 20,
      visibility: "active",
      clientId: "progress-only",
      idempotencyKey: "progress-only-activity",
      startedAt: new Date(Date.now() - 20_000).toISOString(),
    });
    const progressResult = await ctx.readingProgress.setProgress(
      userId,
      representationId,
      { locator },
    );
    expect(progressResult.accepted).toBe(true);

    const sessions = await ctx.readingSessions.listSessions(userId, {
      representationId,
    });
    const pending = sessions.find((s) => s.clientId === "progress-only");
    expect(pending?.status).toBe("pending");
    expect(
      await ctx.readingProgress.getProgress(userId, representationId),
    ).toBeTruthy();
  });

  it.skipIf(!dbAvailable)("ending session sets ended status", async () => {
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/end)",
      progression: 0.8,
    };
    const activity = await ctx.readingActivity.recordActivity(
      userId,
      representationId,
      {
        locator,
        duration: 10,
        visibility: "active",
        clientId: "end-session",
        idempotencyKey: "end-session-activity",
        startedAt: new Date(Date.now() - 10_000).toISOString(),
      },
    );
    const ended = await ctx.readingSessions.endSession(
      userId,
      activity.sessionId,
      { endingLocator: locator },
    );
    expect(ended?.status).toBe("ended");
    expect(ended?.endedAt).toBeTruthy();
    expect(ended?.endingLocator?.cfi).toBe(locator.cfi);
  });
});
