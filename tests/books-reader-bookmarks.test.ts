import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { generateId } from "../src/server/security/crypto.js";
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

describe("Reader bookmarks API", () => {
  let pool: ReturnType<typeof createPool>;
  let ctx: ReturnType<typeof createContext>;
  let userId = "";
  let bookId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-bm-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });

    ctx = createContext(loadConfig(), db);
    userId = generateId();
    await ctx.db
      .delete(schema.users)
      .where(eq(schema.users.email, "bookmarks@test.local"));
    await ctx.db.insert(schema.users).values({
      id: userId,
      email: "bookmarks@test.local",
      username: "bmuser",
      displayName: "BM",
      passwordHash: await hash("password123"),
    });
    await ctx.db.insert(schema.userPreferences).values({ userId });

    bookId = await ctx.books.createBook({
      title: "Bookmark Test",
      authors: ["Author"],
    });
    await ctx.libraryMembership.ensureWorkMembership(userId, "book", bookId);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("creates, lists, and deletes bookmarks", async () => {
    const locator = {
      type: "epub-cfi" as const,
      cfi: "epubcfi(/6/4!/4/2/1:0)",
      href: "chapter.xhtml",
      title: "Chapter 1",
    };
    const created = await ctx.userState.createBookmark(userId, "book", bookId, {
      locator,
      label: "My place",
    });
    expect(created.label).toBe("My place");

    const list = await ctx.userState.listBookmarks(userId, "book", bookId);
    expect(list.some((b) => b.id === created.id)).toBe(true);

    await ctx.userState.deleteBookmark(userId, created.id);
    const after = await ctx.userState.listBookmarks(userId, "book", bookId);
    expect(after.some((b) => b.id === created.id)).toBe(false);
  });
});

describe("Reader settings API", () => {
  let pool: ReturnType<typeof createPool>;
  let ctx: ReturnType<typeof createContext>;
  let userId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-set-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });

    ctx = createContext(loadConfig(), db);
    userId = generateId();
    await ctx.db
      .delete(schema.users)
      .where(eq(schema.users.email, "settings@test.local"));
    await ctx.db.insert(schema.users).values({
      id: userId,
      email: "settings@test.local",
      username: "setuser",
      displayName: "Set",
      passwordHash: await hash("password123"),
    });
    await ctx.db.insert(schema.userPreferences).values({
      userId,
      progressSyncEnabled: true,
    });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("reads and updates progressSyncEnabled", async () => {
    const initial = await ctx.settings.getReaderSettings(userId);
    expect(initial.progressSyncEnabled).toBe(true);

    const updated = await ctx.settings.updateReaderSettings(userId, {
      progressSyncEnabled: false,
    });
    expect(updated.progressSyncEnabled).toBe(false);

    const again = await ctx.settings.getReaderSettings(userId);
    expect(again.progressSyncEnabled).toBe(false);
  });
});
