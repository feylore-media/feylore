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

describe("Activity API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let otherCookie = "";
  let bookSlug = "";
  let bookId = "";
  let representationId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-activity-"),
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
    await db.delete(schema.users).where(eq(schema.users.email, "activity@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "activity@test.local",
      username: "activityuser",
      displayName: "Activity User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    const otherId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "other@test.local"));
    await db.insert(schema.users).values({
      id: otherId,
      email: "other@test.local",
      username: "otheruser",
      displayName: "Other User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: otherId });

    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db.insert(schema.userRoles).values({ userId, roleId: adminRole.id });
    }

    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await db
        .insert(schema.userRoles)
        .values({ userId: otherId, roleId: memberRole.id });
    }

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "activity@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const otherLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "other@test.local", password: "password123" },
    });
    otherCookie = otherLogin.headers["set-cookie"]?.toString() ?? "";

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Activity Test Book", authors: ["Author"] },
    });
    bookSlug = create.json().data.slug;
    bookId = create.json().data.id;

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

  it.skipIf(!dbAvailable)("records activity on favorite and lists own events", async () => {
    const fav = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/favorite`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { favorite: true },
    });
    expect(fav.statusCode).toBe(200);

    const activity = await app.inject({
      method: "GET",
      url: "/api/v1/activity",
      headers: { cookie },
    });
    expect(activity.statusCode).toBe(200);
    const events = activity.json().data;
    expect(
      events.some(
        (e: { type: string }) => e.type === ACTIVITY_TYPES.BOOK_FAVORITED,
      ),
    ).toBe(true);
    expect(events[0].visibility).toBe("private");
  });

  it.skipIf(!dbAvailable)("does not expose another user's activity", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/activity",
      headers: { cookie: otherCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it.skipIf(!dbAvailable)("records rating and progress activity", async () => {
    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/rating`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { rating: 4 },
    });
    const progressRes = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/progress`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: {
          type: "epub-cfi",
          progression: 0.5,
          totalProgression: 0.5,
        },
        representationId,
      },
    });
    expect(progressRes.statusCode).toBe(200);

    const activity = await app.inject({
      method: "GET",
      url: "/api/v1/activity",
      headers: { cookie },
    });
    const types = activity.json().data.map((e: { type: string }) => e.type);
    expect(types).toContain(ACTIVITY_TYPES.BOOK_RATED);
    expect(types).toContain(ACTIVITY_TYPES.BOOK_PROGRESS_UPDATED);
  });
});
