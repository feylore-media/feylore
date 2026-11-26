import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildApp } from "../src/server/http/app.js";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { ROLE_NAMES } from "../src/shared/permissions.js";
import { runStatsBackfill } from "../src/server/modules/stats/backfill.js";

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

const OWNER_EMAIL = "stats-owner@test.local";
const VIEWER_EMAIL = "stats-viewer@test.local";
const OWNER_USERNAME = "statsowner";
const VIEWER_USERNAME = "statsviewer";
// Wide range so facts recorded "now" are always inside, whenever tests run.
const RANGE_QUERY = "?from=2000-01-01&to=2100-12-31";

describe.skipIf(!dbAvailable)("Stats API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let ownerCookie = "";
  let viewerCookie = "";
  let ownerId = "";
  let bookSlug = "";

  async function login(email: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email, password: "password123" },
    });
    expect(res.statusCode).toBe(200);
    return res.headers["set-cookie"]?.toString() ?? "";
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-stats-"),
    );

    const setupPool = createPool(DATABASE_URL);
    const db = createDb(setupPool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    for (const email of [OWNER_EMAIL, VIEWER_EMAIL]) {
      const existing = await db.query.users.findFirst({
        where: eq(schema.users.email, email),
      });
      if (existing) {
        await db
          .delete(schema.userStatFacts)
          .where(eq(schema.userStatFacts.userId, existing.id));
        await db
          .delete(schema.userRatings)
          .where(eq(schema.userRatings.userId, existing.id));
        await db
          .delete(schema.userRoles)
          .where(eq(schema.userRoles.userId, existing.id));
        await db.delete(schema.users).where(eq(schema.users.id, existing.id));
      }
    }

    ownerId = generateId();
    const viewerId = generateId();
    await db.insert(schema.users).values({
      id: ownerId,
      email: OWNER_EMAIL,
      username: OWNER_USERNAME,
      displayName: "Stats Owner",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.users).values({
      id: viewerId,
      email: VIEWER_EMAIL,
      username: VIEWER_USERNAME,
      displayName: "Stats Viewer",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: ownerId });
    await db.insert(schema.userPreferences).values({ userId: viewerId });
    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db
        .insert(schema.userRoles)
        .values({ userId: ownerId, roleId: adminRole.id });
    }
    await setupPool.end();

    const built = await buildApp();
    app = built.app;
    ctx = built.ctx;
    pool = built.pool;

    ownerCookie = await login(OWNER_EMAIL);
    viewerCookie = await login(VIEWER_EMAIL);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Stats Rating Test Book",
        authors: ["Stats Author"],
        genres: ["Fiction"],
      },
    });
    expect(create.statusCode).toBe(201);
    bookSlug = create.json().data.slug;

    const rating = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/rating`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { rating: 5 },
    });
    expect(rating.statusCode).toBe(200);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("requires authentication", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${OWNER_USERNAME}/stats${RANGE_QUERY}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it.skipIf(!dbAvailable)("rejects unknown stats domains", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${OWNER_USERNAME}/stats/nope${RANGE_QUERY.replace("?", "&")}`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(422);
  });

  it.skipIf(!dbAvailable)("records a book rating as a stats fact", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${OWNER_USERNAME}/stats${RANGE_QUERY}`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.profile.username).toBe(OWNER_USERNAME);
    expect(data.rating.count).toBe(1);
    expect(data.rating.avg).toBe(5);
    expect(data.highlights).toHaveLength(1);
    expect(data.highlights[0].title).toContain("Stats Rating Test Book");
    // A rating is not a completion.
    expect(data.headline.totalCompleted).toBe(0);
  });

  it.skipIf(!dbAvailable)("filters facts by domain", async () => {
    const books = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${OWNER_USERNAME}/stats/books${RANGE_QUERY}`,
      headers: { cookie: ownerCookie },
    });
    expect(books.statusCode).toBe(200);
    expect(books.json().data.rating.count).toBe(1);

    const movies = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${OWNER_USERNAME}/stats/movies${RANGE_QUERY}`,
      headers: { cookie: ownerCookie },
    });
    expect(movies.statusCode).toBe(200);
    expect(movies.json().data.rating.count).toBe(0);
    expect(movies.json().data.highlights).toEqual([]);
  });

  it.skipIf(!dbAvailable)("hides private facts from other viewers", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${OWNER_USERNAME}/stats${RANGE_QUERY}`,
      headers: { cookie: viewerCookie },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.profile.username).toBe(OWNER_USERNAME);
    expect(data.rating.count).toBe(0);
    expect(data.highlights).toEqual([]);
  });

  it.skipIf(!dbAvailable)("returns 404 for private profiles to other viewers", async () => {
    await ctx.db
      .update(schema.users)
      .set({ profileVisibility: "private" })
      .where(eq(schema.users.id, ownerId));

    try {
      const denied = await app.inject({
        method: "GET",
        url: `/api/v1/profiles/${OWNER_USERNAME}/stats${RANGE_QUERY}`,
        headers: { cookie: viewerCookie },
      });
      expect(denied.statusCode).toBe(404);

      const own = await app.inject({
        method: "GET",
        url: `/api/v1/profiles/${OWNER_USERNAME}/stats${RANGE_QUERY}`,
        headers: { cookie: ownerCookie },
      });
      expect(own.statusCode).toBe(200);
      expect(own.json().data.rating.count).toBe(1);
    } finally {
      await ctx.db
        .update(schema.users)
        .set({ profileVisibility: "public" })
        .where(eq(schema.users.id, ownerId));
    }
  });

  it.skipIf(!dbAvailable)("backfill never duplicates facts", async () => {
    async function factCount(): Promise<number> {
      const rows = await ctx.db
        .select({ id: schema.userStatFacts.id })
        .from(schema.userStatFacts)
        .where(
          and(
            eq(schema.userStatFacts.userId, ownerId),
            eq(schema.userStatFacts.kind, "rated"),
          ),
        );
      return rows.length;
    }

    const before = await factCount();
    expect(before).toBe(1);

    await runStatsBackfill(ctx.db, ctx.statsRecorder, ownerId);
    const afterFirst = await factCount();
    expect(afterFirst).toBe(1);

    const second = await runStatsBackfill(ctx.db, ctx.statsRecorder, ownerId);
    expect(second.completions).toBe(0);
    expect(second.sessions).toBe(0);
    expect(second.plays).toBe(0);
    expect(await factCount()).toBe(1);
  });

  it.skipIf(!dbAvailable)("clearing a rating removes its stats fact", async () => {
    const clear = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/rating`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { rating: null },
    });
    expect(clear.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/profiles/${OWNER_USERNAME}/stats${RANGE_QUERY}`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.rating.count).toBe(0);
    expect(res.json().data.highlights).toEqual([]);
  });
});
