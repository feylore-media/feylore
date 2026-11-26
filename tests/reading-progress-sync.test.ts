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
import { createContext } from "../src/server/context.js";
import { loadConfig } from "../src/server/config.js";
import { ROLE_NAMES } from "../src/shared/permissions.js";

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

describe("Reading progress sync preference", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let representationId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-reading-sync-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    ctx = built.ctx;
    pool = built.pool;

    const userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "reading-sync@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "reading-sync@test.local",
      username: "readingsync",
      displayName: "Reading Sync",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({
      userId,
      progressSyncEnabled: false,
    });

    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await db.insert(schema.userRoles).values({ userId, roleId: memberRole.id });
    }

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "reading-sync@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const bookId = await ctx.books.createBook({
      title: "Sync Gate Book",
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

  it.skipIf(!dbAvailable)("blocks progress PUT when sync disabled", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/representations/${representationId}/reading-progress`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: { type: "epub-cfi", cfi: "epubcfi(/6/2)", progression: 0.1 },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("blocks activity POST when sync disabled", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/representations/${representationId}/reading-activity`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: { type: "epub-cfi", cfi: "epubcfi(/6/2)", progression: 0.1 },
        duration: 10,
        visibility: "active",
      },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("Reading progress idempotency", () => {
  let ctx: ReturnType<typeof createContext>;
  let pool: ReturnType<typeof createPool>;
  let userId = "";
  let representationId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-reading-idem-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);
    ctx = createContext(loadConfig(), db);

    userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "reading-idem@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "reading-idem@test.local",
      username: "readingidem",
      displayName: "Reading Idem",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    const bookId = await ctx.books.createBook({
      title: "Idempotency Book",
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

  it.skipIf(!dbAvailable)("returns idempotent progress on duplicate key", async () => {
    const update = {
      locator: { type: "epub-cfi" as const, cfi: "epubcfi(/6/2)", progression: 0.2 },
      idempotencyKey: "progress-key-1",
    };
    const first = await ctx.readingProgress.setProgress(
      userId,
      representationId,
      update,
    );
    const second = await ctx.readingProgress.setProgress(
      userId,
      representationId,
      update,
    );
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    if (first.accepted && second.accepted) {
      expect(second.idempotent).toBe(true);
      expect(second.progress.version).toBe(first.progress.version);
    }
  });

  it.skipIf(!dbAvailable)("activity idempotency does not duplicate records", async () => {
    const input = {
      locator: { type: "epub-cfi" as const, cfi: "epubcfi(/6/4)", progression: 0.3 },
      duration: 15,
      visibility: "active" as const,
      clientId: "idem-client",
      idempotencyKey: "activity-key-1",
      startedAt: new Date(Date.now() - 15_000).toISOString(),
    };
    const first = await ctx.readingActivity.recordActivity(
      userId,
      representationId,
      input,
    );
    const second = await ctx.readingActivity.recordActivity(
      userId,
      representationId,
      input,
    );
    expect(first.activityId).toBe(second.activityId);
    expect(first.sessionId).toBe(second.sessionId);

    const activities = await ctx.readingActivity.listActivity(userId, {
      representationId,
    });
    const matches = activities.filter((a) => a.id === first.activityId);
    expect(matches).toHaveLength(1);
  });
});
