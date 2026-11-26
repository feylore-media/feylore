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

describe("Music API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookieA = "";
  let cookieB = "";
  let albumId = "";
  let albumSlug = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-music-api-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    async function setupUser(email: string, username: string) {
      const userId = generateId();
      await db.delete(schema.users).where(eq(schema.users.email, email));
      await db.insert(schema.users).values({
        id: userId,
        email,
        username,
        displayName: username,
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
        payload: { email, password: "password123" },
      });
      return login.headers["set-cookie"]?.toString() ?? "";
    }

    cookieA = await setupUser("music-api-a@test.local", "musicapi");
    cookieB = await setupUser("music-api-b@test.local", "musicapib");
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("creates and lists albums", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/music/albums",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Music API Test Album",
        artistNames: ["Test Artist"],
        genres: ["Rock"],
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json().data;
    albumId = created.id;
    albumSlug = created.slug;
    expect(albumSlug).toMatch(/^music-api-test-album(-\d+)?$/);
    expect(albumId).toMatch(/^[a-z0-9]{6}$/);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/music/albums",
      headers: { cookie: cookieA },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json().data.some((a: { id: string }) => a.id === albumId),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("updates album metadata", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/music/albums/${albumSlug}`,
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Updated Music Album", subtitle: "Deluxe" },
    });
    expect(res.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/music/albums/${albumSlug}`,
      headers: { cookie: cookieA },
    });
    expect(detail.json().data.title).toBe("Updated Music Album");
  });

  it.skipIf(!dbAvailable)("manages user state separately from metadata", async () => {
    await app.inject({
      method: "PUT",
      url: `/api/v1/music/albums/${albumSlug}/favorite`,
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { favorite: true },
    });

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/music/albums/${albumSlug}`,
      headers: { cookie: cookieA },
    });
    expect(detail.json().data.userState.favorite).toBe(true);
  });

  it.skipIf(!dbAvailable)("user B cannot see user A albums", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/music/albums",
      headers: { cookie: cookieB },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json().data.some((a: { id: string }) => a.id === albumId),
    ).toBe(false);
  });

  it.skipIf(!dbAvailable)("lists artists in library", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/music/artists",
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.some((a: { name: string }) => a.name === "Test Artist")).toBe(
      true,
    );
  });

  it.skipIf(!dbAvailable)("creates tracks on album", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/music/albums/${albumSlug}/tracks`,
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Opening Track", trackNumber: 1 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toBeTruthy();
  });
});
