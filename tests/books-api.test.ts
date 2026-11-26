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

describe("Books API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let bookId = "";
  let bookSlug = "";
  let representationId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-books-api-"),
    );

    try {
      pool = createPool(DATABASE_URL);
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: "./drizzle" });
      await seed(db);

      const built = await buildApp();
      app = built.app;
      ctx = built.ctx;
      pool = built.pool;

      const userId = generateId();
      await createDb(pool)
        .delete(schema.users)
        .where(eq(schema.users.email, "books-api@test.local"));
      await createDb(pool).insert(schema.users).values({
        id: userId,
        email: "books-api@test.local",
        username: "booksapi",
        displayName: "Books API User",
        passwordHash: await hash("password123"),
      });
      await createDb(pool).insert(schema.userPreferences).values({ userId });

      const adminRole = await createDb(pool).query.roles.findFirst({
        where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
      });
      if (adminRole) {
        await createDb(pool)
          .insert(schema.userRoles)
          .values({ userId, roleId: adminRole.id });
      }

      const login = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: {
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { email: "books-api@test.local", password: "password123" },
      });
      expect(login.statusCode).toBe(200);
      cookie = login.headers["set-cookie"]?.toString() ?? "";
    } catch (e) {
      console.error("Books API test setup failed:", e);
      throw e;
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("creates and lists books", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: { cookie, origin: "http://localhost:5173", "content-type": "application/json" },
      payload: {
        title: "Books API Test Book",
        authors: ["Jane Author"],
        genres: ["Fiction"],
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json().data;
    bookId = created.id;
    bookSlug = created.slug;
    expect(bookSlug).toMatch(/^books-api-test-book(-\d+)?$/);
    expect(created.slugStatus).toBe("canonical");
    expect(bookId).toMatch(/^[a-z0-9]{6}$/);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/books",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.some((b: { id: string }) => b.id === bookId)).toBe(
      true,
    );
  });

  it.skipIf(!dbAvailable)("updates book metadata", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/books/${bookSlug}`,
      headers: { cookie, origin: "http://localhost:5173", "content-type": "application/json" },
      payload: { title: "Updated Title", subtitle: "Part 1" },
    });
    expect(res.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}`,
      headers: { cookie },
    });
    expect(detail.json().data.title).toBe("Updated Title");
  });

  it.skipIf(!dbAvailable)("manages user state separately from metadata", async () => {
    const expressionId = generateId();
    const manifestationId = generateId();
    representationId = generateId();
    await ctx.db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "book",
      workId: bookId,
      label: "default",
    });
    await ctx.db.insert(schema.creativeWorkManifestations).values({
      id: manifestationId,
      expressionId,
      label: "default",
    });
    await ctx.db.insert(schema.representations).values({
      id: representationId,
      manifestationId,
      format: "epub",
      domainModule: "books",
    });

    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/favorite`,
      headers: { cookie, origin: "http://localhost:5173", "content-type": "application/json" },
      payload: { favorite: true },
    });
    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/rating`,
      headers: { cookie, origin: "http://localhost:5173", "content-type": "application/json" },
      payload: { rating: 5 },
    });
    await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/progress`,
      headers: { cookie, origin: "http://localhost:5173", "content-type": "application/json" },
      payload: {
        locator: {
          type: "epub-cfi",
          cfi: "epubcfi(/6/4!/4/2)",
          progression: 0.25,
          totalProgression: 0.1,
        },
        representationId,
      },
    });

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}`,
      headers: { cookie },
    });
    const data = detail.json().data;
    expect(data.userState.favorite).toBe(true);
    expect(data.userState.rating).toBe(5);
    expect(data.userState.progress?.cfi).toBe("epubcfi(/6/4!/4/2)");
    expect(data.title).toBe("Updated Title");
  });

  it.skipIf(!dbAvailable)("indexes books for search", async () => {
    const search = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Updated&types=book",
      headers: { cookie },
    });
    expect(search.statusCode).toBe(200);
    expect(
      search.json().data.some((r: { id: string }) => r.id === bookId),
    ).toBe(true);
  });
});
