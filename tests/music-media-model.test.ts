import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { ensureTestUser } from "./helpers/test-user.js";
import { createContext } from "../src/server/context.js";
import { loadConfig } from "../src/server/config.js";

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

describe("Music media model", () => {
  let pool: ReturnType<typeof createPool>;
  let storageRoot = "";
  let storageId = "";
  let userId = "";
  let ctx: ReturnType<typeof createContext>;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-music-wem-"));

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const config = loadConfig();
    ctx = createContext(config, db);
    await ctx.jobs.start();

    userId = await ensureTestUser(ctx.db, "music-wem@test.local", {
      username: "musicwem",
      displayName: "Music WEM User",
    });
    await ctx.db.insert(schema.userPreferences).values({ userId });

    storageId = generateId();
    await ctx.db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Music WEM Test",
      kind: "managed",
      rootPath: storageRoot,
    });
    await ctx.files.loadStorageLocations();
  }, 60000);

  afterAll(async () => {
    if (!dbAvailable) return;
    await ctx?.jobs.stop();
    await pool?.end();
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it.skipIf(!dbAvailable)(
    "stores music on albums and tracks, not creative work WEM",
    async () => {
      const fileId = generateId();
      const nestedDir = path.join(storageRoot, "Artist Name", "Album Title");
      await fs.mkdir(nestedDir, { recursive: true });
      await fs.writeFile(path.join(nestedDir, "track.mp3"), "audio");
      await ctx.db.insert(schema.files).values({
        id: fileId,
        storageLocationId: storageId,
        relativePath: "Artist Name/Album Title/track.mp3",
        size: 5,
        mediaType: "audio/mpeg",
      });

      const result = await ctx.music.associateFile(fileId, userId);
      expect(result.skipped).toBe(false);
      if (result.skipped) return;

      const album = await ctx.db.query.albums.findFirst({
        where: eq(schema.albums.id, result.albumId),
      });
      expect(album).toBeTruthy();

      const track = await ctx.db.query.musicTracks.findFirst({
        where: eq(schema.musicTracks.id, result.trackId),
      });
      expect(track?.representationId).toBe(result.representationId);

      const rep = await ctx.representations.get(result.representationId);
      expect(rep.domainModule).toBe("music");
      expect(["mp3", "audio"]).toContain(rep.format);
    },
  );

  it.skipIf(!dbAvailable)(
    "deleting one track does not delete the album or sibling tracks",
    async () => {
      const albumId = await ctx.music.createAlbum({
        title: "Multi Track Album",
        artistNames: ["Band"],
      });
      const track1 = await ctx.music.createTrackForAlbum(albumId, {
        title: "Track One",
        trackNumber: 1,
      });
      const track2 = await ctx.music.createTrackForAlbum(albumId, {
        title: "Track Two",
        trackNumber: 2,
      });

      await ctx.music.deleteTrack(track1);

      const album = await ctx.db.query.albums.findFirst({
        where: eq(schema.albums.id, albumId),
      });
      expect(album).toBeTruthy();

      const remaining = await ctx.db.query.musicTracks.findFirst({
        where: eq(schema.musicTracks.id, track2),
      });
      expect(remaining).toBeTruthy();
    },
  );
});
