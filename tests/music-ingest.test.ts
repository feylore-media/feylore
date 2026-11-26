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

describe("Music ingest", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let cookie = "";
  let userId = "";
  let storageRoot = "";
  let storageId = "";
  let mp3FileId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-music-ingest-"));
    process.env.STORAGE_ROOT = storageRoot;

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    storageId = generateId();
    await db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Music Import Test",
      kind: "managed",
      rootPath: storageRoot,
    });

    const built = await buildApp();
    app = built.app;
    pool = built.pool;
    ctx = built.ctx;
    await ctx.files.loadStorageLocations();

    userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "music-import@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "music-import@test.local",
      username: "musicimport",
      displayName: "Music Import User",
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
      payload: { email: "music-import@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    mp3FileId = generateId();
    const nestedDir = path.join(storageRoot, "Ingest Artist", "Ingest Album");
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(nestedDir, "song.mp3"), "audio");
    await db.insert(schema.files).values({
      id: mp3FileId,
      storageLocationId: storageId,
      relativePath: "Ingest Artist/Ingest Album/song.mp3",
      size: 5,
      mediaType: "audio/mpeg",
    });
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("associates music file to album and track", async () => {
    const result = await ctx.music.associateFile(mp3FileId, userId);
    expect(result.skipped).toBe(false);
    if (result.skipped) return;

    const detail = await ctx.music.getAlbumDetail(result.albumId, userId);
    expect(detail.title).toContain("Ingest Album");
    expect(detail.tracks.length).toBeGreaterThan(0);
  });

  it.skipIf(!dbAvailable)("skips re-associating the same file", async () => {
    const again = await ctx.music.associateFile(mp3FileId, userId);
    expect(again.skipped).toBe(true);
    expect(again.reason).toBe("already_associated");
  });

  it.skipIf(!dbAvailable)("enqueues album import via API", async () => {
    const fileId = generateId();
    await fs.writeFile(path.join(storageRoot, "api-import.mp3"), "audio");
    await ctx.db.insert(schema.files).values({
      id: fileId,
      storageLocationId: storageId,
      relativePath: "api-import.mp3",
      size: 5,
      mediaType: "audio/mpeg",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/music/albums/import",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { fileIds: [fileId] },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().data.ingestItemIds).toHaveLength(1);
  });
});
