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

describe("Music playback progress", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let trackId = "";
  let albumSlug = "";
  let representationId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-music-progress-"),
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
      .where(eq(schema.users.email, "music-progress@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "music-progress@test.local",
      username: "musicprogress",
      displayName: "Music Progress",
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
      payload: { email: "music-progress@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const createAlbum = await app.inject({
      method: "POST",
      url: "/api/v1/music/albums",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Playback Test Album", artistNames: ["Playback Artist"] },
    });
    albumSlug = createAlbum.json().data.slug;

    const storageId = generateId();
    const fileId = generateId();
    representationId = generateId();

    await db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Music Progress Storage",
      kind: "managed",
      rootPath: process.env.STORAGE_ROOT!,
    });
    await fs.writeFile(
      path.join(process.env.STORAGE_ROOT!, "track.mp3"),
      "audio",
    );
    await db.insert(schema.files).values({
      id: fileId,
      storageLocationId: storageId,
      relativePath: "track.mp3",
      size: 5,
      mediaType: "audio/mpeg",
    });
    await db.insert(schema.representations).values({
      id: representationId,
      format: "mp3",
      domainModule: "music",
    });
    await db.insert(schema.representationFiles).values({
      representationId,
      fileId,
      role: "content",
      sortOrder: 0,
    });

    const createTrack = await app.inject({
      method: "POST",
      url: `/api/v1/music/albums/${albumSlug}/tracks`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Playback Track", trackNumber: 1 },
    });
    trackId = createTrack.json().data.id;

    await db
      .update(schema.musicTracks)
      .set({ representationId })
      .where(eq(schema.musicTracks.id, trackId));
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("persists track playback progress", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/api/v1/playback/progress",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        subjectType: "track",
        subjectId: trackId,
        representationId,
        locator: {
          kind: "playback",
          positionSeconds: 45,
          durationSeconds: 200,
        },
      },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({
      method: "GET",
      url: `/api/v1/playback/progress?subjectType=track&subjectId=${trackId}`,
      headers: { cookie },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.locator.positionSeconds).toBe(45);
  });

  it.skipIf(!dbAvailable)("returns playback manifests for album", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/music/albums/${albumSlug}/playback`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(
      res.json().data.some(
        (m: { subject: { id: string } }) => m.subject.id === trackId,
      ),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("surfaces recently played tracks on home", async () => {
    const home = await app.inject({
      method: "GET",
      url: "/api/v1/home",
      headers: { cookie },
    });
    expect(home.statusCode).toBe(200);
    expect(
      home.json().data.sections.recentlyPlayedMusic.some(
        (t: { id: string }) => t.id === trackId,
      ),
    ).toBe(true);
  });
});
