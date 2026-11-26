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
import { validateActivityDuration } from "../src/server/modules/reading-activity/validate-duration.js";
import { getReadingSessionPolicy } from "../src/server/modules/reading-sessions/policy.js";

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

describe("Reading activity duration validation", () => {
  const policy = getReadingSessionPolicy(loadConfig());

  it("caps burst duration", () => {
    expect(validateActivityDuration(120, policy, "active")).toBe(
      policy.maxActiveBurstSeconds,
    );
  });

  it("returns zero for hidden visibility", () => {
    expect(validateActivityDuration(30, policy, "hidden")).toBe(0);
  });
});

describe("ReadingActivityService", () => {
  let pool: ReturnType<typeof createPool>;
  let ctx: ReturnType<typeof createContext>;
  let userId = "";
  let representationId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-reading-activity-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);
    ctx = createContext(loadConfig(), db);

    userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "reading-activity@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "reading-activity@test.local",
      username: "readingactivity",
      displayName: "Reading Activity",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    const bookId = await ctx.books.createBook({
      title: "Activity Book",
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

  it.skipIf(!dbAvailable)("records activity and groups into session", async () => {
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/2)",
      progression: 0.1,
    };
    const result = await ctx.readingActivity.recordActivity(
      userId,
      representationId,
      {
        locator,
        duration: 30,
        visibility: "active",
        clientId: "client-1",
        startedAt: new Date(Date.now() - 30_000).toISOString(),
      },
    );
    expect(result.sessionId).toBeTruthy();
    expect(result.sessionStatus).toBe("pending");
    expect(result.sessionActiveDuration).toBe(30);

    const sessions = await ctx.readingSessions.listSessions(userId, {
      representationId,
    });
    expect(sessions.length).toBeGreaterThan(0);
  });

  it.skipIf(!dbAvailable)("qualifies session after threshold", async () => {
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/4)",
      progression: 0.2,
    };
    for (let i = 0; i < 5; i++) {
      await ctx.readingActivity.recordActivity(userId, representationId, {
        locator,
        duration: 60,
        visibility: "active",
        clientId: "client-qualify",
        idempotencyKey: `qualify-activity-${i}`,
        startedAt: new Date(Date.now() - (5 - i) * 60_000).toISOString(),
      });
    }
    const sessions = await ctx.readingSessions.listSessions(userId, {
      representationId,
      qualifiedOnly: true,
    });
    expect(sessions.some((s) => s.status === "qualified")).toBe(true);
  });
});
