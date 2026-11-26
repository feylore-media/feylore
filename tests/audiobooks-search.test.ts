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

describe("Audiobooks search", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookieA = "";
  let cookieB = "";
  let audiobookAlphaId = "";
  let audiobookAlphaSlug = "";
  let audiobookBetaId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-ab-search-"),
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

    cookieA = await setupUser("ab-search-a@test.local", "absearcha");
    cookieB = await setupUser("ab-search-b@test.local", "absearchb");

    const createAlpha = await app.inject({
      method: "POST",
      url: "/api/v1/audiobooks",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Alpha Searchable Audiobook",
        authors: ["Alice Author"],
        narrators: ["Nora Narrator"],
        genres: ["Mystery"],
      },
    });
    audiobookAlphaId = createAlpha.json().data.id;
    audiobookAlphaSlug = createAlpha.json().data.slug;

    const createBeta = await app.inject({
      method: "POST",
      url: "/api/v1/audiobooks",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Beta Different Audiobook",
        authors: ["Bob Writer"],
        narrators: ["Victor Voice"],
        genres: ["Romance"],
      },
    });
    audiobookBetaId = createBeta.json().data.id;

    await app.inject({
      method: "PUT",
      url: `/api/v1/audiobooks/${audiobookAlphaSlug}/favorite`,
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { favorite: true },
    });

    await app.inject({
      method: "PUT",
      url: "/api/v1/playback/progress",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        subjectType: "audiobook",
        subjectId: audiobookAlphaId,
        locator: {
          kind: "playback",
          positionSeconds: 30,
          durationSeconds: 100,
        },
      },
    });
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("library-scoped search via GET /audiobooks?q=", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audiobooks?q=Alpha",
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((b: { id: string }) => b.id);
    expect(ids).toContain(audiobookAlphaId);
    expect(ids).not.toContain(audiobookBetaId);
  });

  it.skipIf(!dbAvailable)("user B cannot see user A audiobooks in search", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audiobooks?q=Alpha",
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });

  it.skipIf(!dbAvailable)("global search finds indexed audiobook", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Alpha&types=audiobook",
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const hit = res.json().data.find((r: { id: string }) => r.id === audiobookAlphaId);
    expect(hit).toBeTruthy();
    expect(hit.href).toBe(`/audiobooks/${audiobookAlphaSlug}`);
  });

  it.skipIf(!dbAvailable)("filters by author, narrator, and genre", async () => {
    const byAuthor = await app.inject({
      method: "GET",
      url: "/api/v1/audiobooks?author=Alice",
      headers: { cookie: cookieA },
    });
    expect(
      byAuthor.json().data.some((b: { id: string }) => b.id === audiobookAlphaId),
    ).toBe(true);

    const byNarrator = await app.inject({
      method: "GET",
      url: "/api/v1/audiobooks?narrator=Victor",
      headers: { cookie: cookieA },
    });
    expect(
      byNarrator.json().data.some((b: { id: string }) => b.id === audiobookBetaId),
    ).toBe(true);

    const byGenre = await app.inject({
      method: "GET",
      url: "/api/v1/audiobooks?genre=Romance",
      headers: { cookie: cookieA },
    });
    expect(
      byGenre.json().data.some((b: { id: string }) => b.id === audiobookBetaId),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("filters by favorite", async () => {
    const favorites = await app.inject({
      method: "GET",
      url: "/api/v1/audiobooks?favorite=true",
      headers: { cookie: cookieA },
    });
    expect(
      favorites.json().data.every((b: { favorite: boolean }) => b.favorite),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("continue view returns in-progress audiobooks", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audiobooks?view=continue",
      headers: { cookie: cookieA },
    });
    expect(
      res.json().data.some((b: { id: string }) => b.id === audiobookAlphaId),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("delete removes audiobook from search index", async () => {
    const temp = await app.inject({
      method: "POST",
      url: "/api/v1/audiobooks",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Temporary Delete Audiobook" },
    });
    const tempId = temp.json().data.id;
    const tempSlug = temp.json().data.slug;

    await app.inject({
      method: "DELETE",
      url: `/api/v1/audiobooks/${tempSlug}`,
      headers: { cookie: cookieA, origin: "http://localhost:5173" },
    });

    const search = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Temporary+Delete+Audiobook&types=audiobook",
      headers: { cookie: cookieA },
    });
    expect(
      search.json().data.some((r: { id: string }) => r.id === tempId),
    ).toBe(false);
  });
});
