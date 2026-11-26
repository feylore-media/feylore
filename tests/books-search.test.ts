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
import { createBookRepresentation } from "./helpers/book-representation.js";

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

describe("Books search", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookieA = "";
  let cookieB = "";
  let bookAlphaId = "";
  let bookAlphaSlug = "";
  let bookBetaId = "";
  let seriesId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-books-search-"),
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

    cookieA = await setupUser("search-a@test.local", "searcha");
    cookieB = await setupUser("search-b@test.local", "searchb");

    const createAlpha = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Alpha Searchable Novel",
        authors: ["Alice Author"],
        genres: ["Mystery"],
      },
    });
    bookAlphaId = createAlpha.json().data.id;
    bookAlphaSlug = createAlpha.json().data.slug;

    const createBeta = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Beta Different Book",
        authors: ["Bob Writer"],
        genres: ["Romance"],
      },
    });
    bookBetaId = createBeta.json().data.id;

    seriesId = generateId();
    await db.insert(schema.bookSeries).values({
      id: seriesId,
      name: "Search Series",
    });
    await db.insert(schema.bookSeriesMembers).values({
      id: generateId(),
      seriesId,
      bookId: bookAlphaId,
      position: 1,
    });

    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookAlphaSlug}/favorite`,
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { favorite: true },
    });

    const progressRepresentationId = await createBookRepresentation(db, bookAlphaId);
    const progressResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookAlphaSlug}/progress`,
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        representationId: progressRepresentationId,
        locator: { type: "epub-cfi", progression: 0.5 },
      },
    });
    expect(progressResponse.statusCode).toBe(200);
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("library-scoped search via GET /books?q=", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/books?q=Alpha",
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((b: { id: string }) => b.id);
    expect(ids).toContain(bookAlphaId);
    expect(ids).not.toContain(bookBetaId);
  });

  it.skipIf(!dbAvailable)("user B cannot see user A books in search", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/books?q=Alpha",
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });

  it.skipIf(!dbAvailable)("global search finds indexed book", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Alpha&types=book",
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    expect(
      res.json().data.some((r: { id: string }) => r.id === bookAlphaId),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("filters by author and genre", async () => {
    const byAuthor = await app.inject({
      method: "GET",
      url: "/api/v1/books?author=Alice",
      headers: { cookie: cookieA },
    });
    expect(byAuthor.json().data.some((b: { id: string }) => b.id === bookAlphaId)).toBe(
      true,
    );

    const byGenre = await app.inject({
      method: "GET",
      url: "/api/v1/books?genre=Romance",
      headers: { cookie: cookieA },
    });
    expect(byGenre.json().data.some((b: { id: string }) => b.id === bookBetaId)).toBe(
      true,
    );
  });

  it.skipIf(!dbAvailable)("filters by series and favorite", async () => {
    const bySeries = await app.inject({
      method: "GET",
      url: `/api/v1/books?series=${seriesId}`,
      headers: { cookie: cookieA },
    });
    expect(bySeries.json().data).toHaveLength(1);
    expect(bySeries.json().data[0].id).toBe(bookAlphaId);

    const favorites = await app.inject({
      method: "GET",
      url: "/api/v1/books?favorite=true",
      headers: { cookie: cookieA },
    });
    expect(
      favorites.json().data.every((b: { favorite: boolean }) => b.favorite),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("continue view returns in-progress books", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/books?view=continue",
      headers: { cookie: cookieA },
    });
    expect(res.json().data.some((b: { id: string }) => b.id === bookAlphaId)).toBe(
      true,
    );
  });

  it.skipIf(!dbAvailable)("sort and pagination", async () => {
    const sorted = await app.inject({
      method: "GET",
      url: "/api/v1/books?sort=title&order=asc&limit=1",
      headers: { cookie: cookieA },
    });
    expect(sorted.statusCode).toBe(200);
    expect(sorted.json().data).toHaveLength(1);
    expect(sorted.json().page.nextCursor).toBeTruthy();

    const page2 = await app.inject({
      method: "GET",
      url: `/api/v1/books?sort=title&order=asc&limit=1&cursor=${sorted.json().page.nextCursor}`,
      headers: { cookie: cookieA },
    });
    expect(page2.json().data).toHaveLength(1);
    expect(page2.json().data[0].id).not.toBe(sorted.json().data[0].id);
  });

  it.skipIf(!dbAvailable)("delete removes book from search index", async () => {
    const temp = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Temporary Delete Me" },
    });
    const tempId = temp.json().data.id;
    const tempSlug = temp.json().data.slug;

    await app.inject({
      method: "DELETE",
      url: `/api/v1/books/${tempSlug}`,
      headers: { cookie: cookieA, origin: "http://localhost:5173" },
    });

    const search = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Temporary+Delete+Me&types=book",
      headers: { cookie: cookieA },
    });
    expect(
      search.json().data.some((r: { id: string }) => r.id === tempId),
    ).toBe(false);
  });
});
