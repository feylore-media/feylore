import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/server/http/app.js";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
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

describe("TV API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let showSlug = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = "/tmp/feylore-tv-api-test";

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "tv-api@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "tv-api@test.local",
      username: "tvapi",
      displayName: "TV API",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });
    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db.insert(schema.userRoles).values({ userId, roleId: adminRole.id });
    }
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "tv-api@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("creates show, season, and episode hierarchy", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tv/shows",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "TV API Test Show" },
    });
    expect(create.statusCode).toBe(201);
    showSlug = create.json().data.slug;

    const season = await app.inject({
      method: "POST",
      url: `/api/v1/tv/shows/${showSlug}/seasons`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { seasonNumber: 1, title: "Season 1" },
    });
    expect(season.statusCode).toBe(201);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/tv/shows/${showSlug}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.title).toBe("TV API Test Show");
  });

  it.skipIf(!dbAvailable)("sets show favorite and rating only", async () => {
    const fav = await app.inject({
      method: "PUT",
      url: `/api/v1/tv/shows/${showSlug}/favorite`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { favorite: true },
    });
    expect(fav.statusCode).toBe(200);

    const rating = await app.inject({
      method: "PUT",
      url: `/api/v1/tv/shows/${showSlug}/rating`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { rating: 5 },
    });
    expect(rating.statusCode).toBe(200);
  });
});
