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
import { ROLE_NAMES } from "../src/shared/permissions.js";
import { ACTIVITY_TYPES } from "../src/shared/activity.js";
import { HOME_LIMITS } from "../src/shared/home.js";

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

async function loginUser(
  app: Awaited<ReturnType<typeof buildApp>>["app"],
  email: string,
  password: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: {
      origin: "http://localhost:5173",
      "content-type": "application/json",
    },
    payload: { email, password },
  });
  return res.headers["set-cookie"]?.toString() ?? "";
}

async function createBook(
  app: Awaited<ReturnType<typeof buildApp>>["app"],
  cookie: string,
  title: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/books",
    headers: {
      cookie,
      origin: "http://localhost:5173",
      "content-type": "application/json",
    },
    payload: { title, authors: ["Author"] },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as { id: string; slug: string };
}

describe("Home API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let cookie = "";
  let userId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-home-"),
    );

    pool = createPool(DATABASE_URL);
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "home@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "home@test.local",
      username: "homeuser",
      displayName: "Home User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db.insert(schema.userRoles).values({ userId, roleId: adminRole.id });
    }

    cookie = await loginUser(app, "home@test.local", "password123");
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("returns stable HomeResponse contract shape", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/home",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toMatchObject({
      isEmpty: expect.any(Boolean),
      sections: {
        continueReading: expect.any(Array),
        continueListening: expect.any(Array),
        recentlyPlayedMusic: expect.any(Array),
        recentlyAddedAlbums: expect.any(Array),
        recentlyAdded: expect.any(Array),
        recentlyFinished: expect.any(Array),
        favorites: expect.any(Array),
        recentActivity: expect.any(Array),
        shelves: expect.any(Array),
        shortcuts: expect.any(Array),
        recommendations: [],
      },
    });
  });

  it.skipIf(!dbAvailable)("isEmpty true for user with no library or activity", async () => {
    const emptyUserId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "home-empty@test.local"));
    await db.insert(schema.users).values({
      id: emptyUserId,
      email: "home-empty@test.local",
      username: "homeempty",
      displayName: "Empty User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: emptyUserId });

    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await db
        .insert(schema.userRoles)
        .values({ userId: emptyUserId, roleId: memberRole.id });
    }

    const emptyCookie = await loginUser(
      app,
      "home-empty@test.local",
      "password123",
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/home",
      headers: { cookie: emptyCookie },
    });
    expect(res.json().data.isEmpty).toBe(true);
    expect(res.json().data.sections.recommendations).toEqual([]);
  });

  it.skipIf(!dbAvailable)(
    "isEmpty false when user has activity but no memberships",
    async () => {
      const orphanUserId = generateId();
      await db
        .delete(schema.users)
        .where(eq(schema.users.email, "home-orphan@test.local"));
      await db.insert(schema.users).values({
        id: orphanUserId,
        email: "home-orphan@test.local",
        username: "homeorphan",
        displayName: "Orphan User",
        passwordHash: await hash("password123"),
      });
      await db.insert(schema.userPreferences).values({ userId: orphanUserId });

      const memberRole = await db.query.roles.findFirst({
        where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
      });
      if (memberRole) {
        await db
          .insert(schema.userRoles)
          .values({ userId: orphanUserId, roleId: memberRole.id });
      }

      await db.insert(schema.activityEvents).values({
        id: generateId(),
        actorUserId: orphanUserId,
        type: ACTIVITY_TYPES.BOOK_FAVORITED,
        subjectType: "book",
        subjectId: "orphan1",
        visibility: "private",
        payload: { title: "Ghost Book" },
      });

      const orphanCookie = await loginUser(
        app,
        "home-orphan@test.local",
        "password123",
      );

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/home",
        headers: { cookie: orphanCookie },
      });
      expect(res.json().data.isEmpty).toBe(false);
      expect(res.json().data.sections.recentActivity.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(!dbAvailable)("orders continue reading by most recent progress", async () => {
    const user2Id = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "home-continue@test.local"));
    await db.insert(schema.users).values({
      id: user2Id,
      email: "home-continue@test.local",
      username: "homecontinue",
      displayName: "Continue User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: user2Id });
    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db
        .insert(schema.userRoles)
        .values({ userId: user2Id, roleId: adminRole.id });
    }
    const user2Cookie = await loginUser(
      app,
      "home-continue@test.local",
      "password123",
    );

    const bookA = await createBook(app, user2Cookie, "Continue Alpha");
    const bookB = await createBook(app, user2Cookie, "Continue Beta");

    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookA.slug}/progress`,
      headers: {
        cookie: user2Cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: { type: "epub-cfi", progression: 0.2, totalProgression: 0.2 },
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookB.slug}/progress`,
      headers: {
        cookie: user2Cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: { type: "epub-cfi", progression: 0.3, totalProgression: 0.3 },
      },
    });

    const home = await app.inject({
      method: "GET",
      url: "/api/v1/home",
      headers: { cookie: user2Cookie },
    });
    const continueReading = home.json().data.sections.continueReading;
    expect(continueReading.length).toBe(2);
    expect(continueReading[0].id).toBe(bookB.id);
    expect(continueReading[1].id).toBe(bookA.id);
  });

  it.skipIf(!dbAvailable)("recently finished preserves event order after dedup", async () => {
    const user3Id = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "home-finished@test.local"));
    await db.insert(schema.users).values({
      id: user3Id,
      email: "home-finished@test.local",
      username: "homefinished",
      displayName: "Finished User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: user3Id });
    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db
        .insert(schema.userRoles)
        .values({ userId: user3Id, roleId: adminRole.id });
    }
    const user3Cookie = await loginUser(
      app,
      "home-finished@test.local",
      "password123",
    );

    const older = await createBook(app, user3Cookie, "Finished Older");
    const newer = await createBook(app, user3Cookie, "Finished Newer");

    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${older.slug}/progress`,
      headers: {
        cookie: user3Cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: { type: "epub-cfi", progression: 1, totalProgression: 1 },
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${newer.slug}/progress`,
      headers: {
        cookie: user3Cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: { type: "epub-cfi", progression: 1, totalProgression: 1 },
      },
    });

    const home = await app.inject({
      method: "GET",
      url: "/api/v1/home",
      headers: { cookie: user3Cookie },
    });
    const finished = home.json().data.sections.recentlyFinished;
    expect(finished.length).toBeGreaterThanOrEqual(2);
    expect(finished[0].item.id).toBe(newer.id);
    expect(finished[1].item.id).toBe(older.id);
  });

  it.skipIf(!dbAvailable)("recently added sorts by membership addedAt", async () => {
    const user4Id = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "home-recent@test.local"));
    await db.insert(schema.users).values({
      id: user4Id,
      email: "home-recent@test.local",
      username: "homerecent",
      displayName: "Recent User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: user4Id });
    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db
        .insert(schema.userRoles)
        .values({ userId: user4Id, roleId: adminRole.id });
    }
    const user4Cookie = await loginUser(
      app,
      "home-recent@test.local",
      "password123",
    );

    const first = await createBook(app, user4Cookie, "Recent First Added");
    await new Promise((r) => setTimeout(r, 50));
    const second = await createBook(app, user4Cookie, "Recent Second Added");

    await db
      .update(schema.books)
      .set({ title: "ZZZ Should Not Sort First" })
      .where(eq(schema.books.id, first.id));

    const home = await app.inject({
      method: "GET",
      url: "/api/v1/home",
      headers: { cookie: user4Cookie },
    });
    const recent = home.json().data.sections.recentlyAdded;
    expect(recent.length).toBe(2);
    expect(recent[0].item.id).toBe(second.id);
    expect(recent[1].item.id).toBe(first.id);
  });

  it.skipIf(!dbAvailable)("enforces section limits", async () => {
    const user5Id = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "home-limits@test.local"));
    await db.insert(schema.users).values({
      id: user5Id,
      email: "home-limits@test.local",
      username: "homelimits",
      displayName: "Limits User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: user5Id });
    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db
        .insert(schema.userRoles)
        .values({ userId: user5Id, roleId: adminRole.id });
    }
    const user5Cookie = await loginUser(
      app,
      "home-limits@test.local",
      "password123",
    );

    for (let i = 0; i < HOME_LIMITS.recentlyAdded + 3; i++) {
      await createBook(app, user5Cookie, `Limit Book ${i}`);
    }

    const home = await app.inject({
      method: "GET",
      url: "/api/v1/home",
      headers: { cookie: user5Cookie },
    });
    const sections = home.json().data.sections;
    expect(sections.recentlyAdded.length).toBeLessThanOrEqual(
      HOME_LIMITS.recentlyAdded,
    );
    expect(sections.recentActivity.length).toBeLessThanOrEqual(
      HOME_LIMITS.activity,
    );
    expect(sections.recommendations).toEqual([]);
  });

  it.skipIf(!dbAvailable)("returns empty arrays for sections with no data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/home",
      headers: { cookie },
    });
    const sections = res.json().data.sections;
    for (const key of [
      "continueReading",
      "continueListening",
      "recentlyPlayedMusic",
      "recentlyAddedAlbums",
      "recentlyAdded",
      "recentlyFinished",
      "favorites",
      "recentActivity",
      "shelves",
    ] as const) {
      expect(Array.isArray(sections[key])).toBe(true);
    }
  });
});
