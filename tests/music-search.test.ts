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

describe("Music search", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookieA = "";
  let cookieB = "";
  let albumId = "";
  let albumSlug = "";
  let trackId = "";
  let artistSlug = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-music-search-"),
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

    cookieA = await setupUser("music-search-a@test.local", "musicsearcha");
    cookieB = await setupUser("music-search-b@test.local", "musicsearchb");

    const createAlbum = await app.inject({
      method: "POST",
      url: "/api/v1/music/albums",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Alpha Searchable Album",
        artistNames: ["Searchable Artist"],
        genres: ["Electronic"],
      },
    });
    albumId = createAlbum.json().data.id;
    albumSlug = createAlbum.json().data.slug;

    const artistsRes = await app.inject({
      method: "GET",
      url: "/api/v1/music/artists",
      headers: { cookie: cookieA },
    });
    artistSlug = artistsRes.json().data.find(
      (a: { name: string }) => a.name === "Searchable Artist",
    )?.slug;

    const createTrack = await app.inject({
      method: "POST",
      url: `/api/v1/music/albums/${albumSlug}/tracks`,
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Alpha Searchable Track", trackNumber: 1 },
    });
    trackId = createTrack.json().data.id;

    await app.inject({
      method: "POST",
      url: "/api/v1/music/albums",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Beta Different Album",
        artistNames: ["Other Artist"],
        genres: ["Jazz"],
      },
    });
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("library-scoped search via GET /music/albums?q=", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/music/albums?q=Alpha",
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((a: { id: string }) => a.id);
    expect(ids).toContain(albumId);
  });

  it.skipIf(!dbAvailable)("user B cannot see user A albums in search", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/music/albums?q=Alpha",
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });

  it.skipIf(!dbAvailable)("global search finds indexed album with href", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Alpha&types=album",
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const hit = res.json().data.find((r: { id: string }) => r.id === albumId);
    expect(hit).toBeTruthy();
    expect(hit.href).toBe(`/music/albums/${albumSlug}`);
  });

  it.skipIf(!dbAvailable)("global search finds indexed track with href", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Alpha+Searchable+Track&types=track",
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const hit = res.json().data.find((r: { id: string }) => r.id === trackId);
    expect(hit).toBeTruthy();
    expect(hit.href).toBe(`/music/tracks/${trackId}`);
  });

  it.skipIf(!dbAvailable)("global search finds indexed artist with href", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Searchable+Artist&types=artist",
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const hit = res.json().data.find(
      (r: { href?: string }) => r.href === `/music/artists/${artistSlug}`,
    );
    expect(hit).toBeTruthy();
  });

  it.skipIf(!dbAvailable)("filters by artist and genre", async () => {
    const byArtist = await app.inject({
      method: "GET",
      url: "/api/v1/music/albums?artist=Other",
      headers: { cookie: cookieA },
    });
    expect(
      byArtist.json().data.some((a: { title: string }) => a.title.includes("Beta")),
    ).toBe(true);

    const byGenre = await app.inject({
      method: "GET",
      url: "/api/v1/music/albums?genre=Electronic",
      headers: { cookie: cookieA },
    });
    expect(
      byGenre.json().data.some((a: { id: string }) => a.id === albumId),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("delete removes album from search index", async () => {
    const temp = await app.inject({
      method: "POST",
      url: "/api/v1/music/albums",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Temporary Delete Album" },
    });
    const tempId = temp.json().data.id;
    const tempSlug = temp.json().data.slug;

    await app.inject({
      method: "DELETE",
      url: `/api/v1/music/albums/${tempSlug}`,
      headers: { cookie: cookieA, origin: "http://localhost:5173" },
    });

    const search = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Temporary+Delete+Album&types=album",
      headers: { cookie: cookieA },
    });
    expect(
      search.json().data.some((r: { id: string }) => r.id === tempId),
    ).toBe(false);
  });
});
