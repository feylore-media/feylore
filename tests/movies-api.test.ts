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

describe("Movies API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let movieId = "";
  let movieSlug = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-movies-api-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "movies-api@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "movies-api@test.local",
      username: "moviesapi",
      displayName: "Movies API",
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
      payload: { email: "movies-api@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("creates and lists movies", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/movies",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Movies API Test Film",
        genres: ["Drama"],
        studio: "Test Studio",
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json().data;
    movieId = created.id;
    movieSlug = created.slug;
    expect(movieId).toMatch(/^[a-z0-9]{6}$/);
    expect(movieSlug).toMatch(/^movies-api-test-film(-\d+)?$/);

    await app.inject({
      method: "POST",
      url: `/api/v1/movies/${movieSlug}/membership`,
      headers: { cookie, origin: "http://localhost:5173" },
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/movies",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().data;
    expect(items.some((m: { id: string }) => m.id === movieId)).toBe(true);
  });

  it.skipIf(!dbAvailable)("updates favorite and rating", async () => {
    const fav = await app.inject({
      method: "PUT",
      url: `/api/v1/movies/${movieSlug}/favorite`,
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
      url: `/api/v1/movies/${movieSlug}/rating`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { rating: 4 },
    });
    expect(rating.statusCode).toBe(200);
  });

  it.skipIf(!dbAvailable)("creates a collection and adds the movie", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/movies/collections",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Test Franchise" },
    });
    expect(create.statusCode).toBe(201);
    const collection = create.json().data;

    const add = await app.inject({
      method: "POST",
      url: `/api/v1/movies/collections/${collection.slug}/movies`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { movieId },
    });
    expect(add.statusCode).toBe(201);
  });
});
