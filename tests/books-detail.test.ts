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

describe("Books detail enrichment", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let bookSlug = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-books-detail-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const userId = generateId();
    await createDb(pool)
      .delete(schema.users)
      .where(eq(schema.users.email, "books-detail@test.local"));
    await createDb(pool).insert(schema.users).values({
      id: userId,
      email: "books-detail@test.local",
      username: "booksdetail",
      displayName: "Books Detail User",
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
      payload: { email: "books-detail@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Detail Enrichment Test",
        authors: ["Test Author"],
        genres: ["Sci-Fi"],
      },
    });
    bookSlug = create.json().data.slug;
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("returns enriched detail fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const detail = res.json().data;
    expect(Array.isArray(detail.metadataFields)).toBe(true);
    const titleField = detail.metadataFields.find(
      (f: { id: string }) => f.id === "title",
    );
    expect(titleField?.value).toBe("Detail Enrichment Test");
    expect(titleField?.group).toBe("identity");
    const authorsField = detail.metadataFields.find(
      (f: { id: string }) => f.id === "authors",
    );
    expect(authorsField?.value).toBe("Test Author");
    expect(authorsField?.group).toBe("identity");
    const genresField = detail.metadataFields.find(
      (f: { id: string }) => f.id === "genres",
    );
    expect(genresField?.value).toBe("Sci-Fi");
    expect(genresField?.group).toBe("content");
    expect(Array.isArray(detail.seriesBooks)).toBe(true);
    expect(detail.journalSummary).toMatchObject({
      bookmarkCount: expect.any(Number),
      annotationCount: expect.any(Number),
      journalEntryCount: 0,
      recent: expect.any(Array),
    });
    expect(detail.readingState).toMatchObject({
      canContinueInReader: expect.any(Boolean),
      started: expect.any(Boolean),
      finished: expect.any(Boolean),
    });
  });
});
