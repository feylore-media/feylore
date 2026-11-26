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

describe("Audiobooks API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookieA = "";
  let cookieB = "";
  let audiobookId = "";
  let audiobookSlug = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-audiobooks-api-"),
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

    cookieA = await setupUser("audiobooks-api-a@test.local", "audiobooksa");
    cookieB = await setupUser("audiobooks-api-b@test.local", "audiobooksb");
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("creates and lists audiobooks", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/audiobooks",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Audiobooks API Test Title",
        authors: ["Jane Narrator"],
        narrators: ["Voice Actor"],
        genres: ["Fiction"],
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json().data;
    audiobookId = created.id;
    audiobookSlug = created.slug;
    expect(audiobookSlug).toMatch(/^audiobooks-api-test-title(-\d+)?$/);
    expect(created.slugStatus).toBe("canonical");
    expect(audiobookId).toMatch(/^[a-z0-9]{6}$/);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/audiobooks",
      headers: { cookie: cookieA },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json().data.some((b: { id: string }) => b.id === audiobookId),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("updates audiobook metadata", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/audiobooks/${audiobookSlug}`,
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Updated Audiobook Title", subtitle: "Part 1" },
    });
    expect(res.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/audiobooks/${audiobookSlug}`,
      headers: { cookie: cookieA },
    });
    expect(detail.json().data.title).toBe("Updated Audiobook Title");
  });

  it.skipIf(!dbAvailable)("manages user state separately from metadata", async () => {
    await app.inject({
      method: "PUT",
      url: `/api/v1/audiobooks/${audiobookSlug}/favorite`,
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { favorite: true },
    });
    await app.inject({
      method: "PUT",
      url: `/api/v1/audiobooks/${audiobookSlug}/rating`,
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { rating: 4 },
    });

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/audiobooks/${audiobookSlug}`,
      headers: { cookie: cookieA },
    });
    const data = detail.json().data;
    expect(data.userState.favorite).toBe(true);
    expect(data.userState.rating).toBe(4);
    expect(data.title).toBe("Updated Audiobook Title");
  });

  it.skipIf(!dbAvailable)("user B cannot see user A audiobooks", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/audiobooks",
      headers: { cookie: cookieB },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json().data.some((b: { id: string }) => b.id === audiobookId),
    ).toBe(false);

    const favorite = await app.inject({
      method: "GET",
      url: `/api/v1/audiobooks/${audiobookSlug}/favorite`,
      headers: { cookie: cookieB },
    });
    expect(favorite.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("indexes audiobooks for search", async () => {
    const search = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Updated+Audiobook&types=audiobook",
      headers: { cookie: cookieA },
    });
    expect(search.statusCode).toBe(200);
    const hit = search.json().data.find((r: { id: string }) => r.id === audiobookId);
    expect(hit).toBeTruthy();
    expect(hit.href).toBe(`/audiobooks/${audiobookSlug}`);
  });
});
