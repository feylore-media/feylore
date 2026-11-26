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

describe("Music playlists", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let albumSlug = "";
  let trackId = "";
  let playlistSlug = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-music-playlists-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "music-playlists@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "music-playlists@test.local",
      username: "musicplaylists",
      displayName: "Music Playlists",
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
      payload: { email: "music-playlists@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const album = await app.inject({
      method: "POST",
      url: "/api/v1/music/albums",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Playlist Source Album" },
    });
    albumSlug = album.json().data.slug;

    const track = await app.inject({
      method: "POST",
      url: `/api/v1/music/albums/${albumSlug}/tracks`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Playlist Track", trackNumber: 1 },
    });
    trackId = track.json().data.id;
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("creates and lists playlists", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/music/playlists",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { name: "My Test Playlist", description: "Favorites" },
    });
    expect(create.statusCode).toBe(201);
    playlistSlug = create.json().data.slug;

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/music/playlists",
      headers: { cookie },
    });
    expect(
      list.json().data.some((p: { slug: string }) => p.slug === playlistSlug),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("adds tracks and returns playlist detail", async () => {
    const add = await app.inject({
      method: "POST",
      url: `/api/v1/music/playlists/${playlistSlug}/tracks`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { trackId },
    });
    expect(add.statusCode).toBe(201);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/music/playlists/${playlistSlug}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.tracks).toHaveLength(1);
    expect(detail.json().data.tracks[0].id).toBe(trackId);
  });

  it.skipIf(!dbAvailable)("removes track from playlist", async () => {
    const remove = await app.inject({
      method: "DELETE",
      url: `/api/v1/music/playlists/${playlistSlug}/tracks/${trackId}`,
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(remove.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/music/playlists/${playlistSlug}`,
      headers: { cookie },
    });
    expect(detail.json().data.tracks).toHaveLength(0);
  });

  it.skipIf(!dbAvailable)("reorders playlist tracks", async () => {
    const track2 = await app.inject({
      method: "POST",
      url: `/api/v1/music/albums/${albumSlug}/tracks`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Second Track", trackNumber: 2 },
    });
    const track2Id = track2.json().data.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/music/playlists/${playlistSlug}/tracks`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { trackId },
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/music/playlists/${playlistSlug}/tracks`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { trackId: track2Id },
    });

    const reorder = await app.inject({
      method: "PUT",
      url: `/api/v1/music/playlists/${playlistSlug}/reorder`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { trackIds: [track2Id, trackId] },
    });
    expect(reorder.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/music/playlists/${playlistSlug}`,
      headers: { cookie },
    });
    expect(detail.json().data.tracks.map((t: { id: string }) => t.id)).toEqual([
      track2Id,
      trackId,
    ]);
  });
});
