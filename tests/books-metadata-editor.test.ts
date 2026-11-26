import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq, and } from "drizzle-orm";
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
import { getBookEditorFieldOrder } from "../src/shared/book-metadata-field-kinds.js";

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

describe("Books metadata editor API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let bookSlug = "";
  let bookId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-books-editor-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const existingUser = await createDb(pool).query.users.findFirst({
      where: eq(schema.users.email, "books-editor@test.local"),
    });
    const userId = existingUser?.id ?? generateId();
    if (!existingUser) {
      await createDb(pool).insert(schema.users).values({
        id: userId,
        email: "books-editor@test.local",
        username: "bookseditor",
        displayName: "Books Editor User",
        passwordHash: await hash("password123"),
      });
      await createDb(pool).insert(schema.userPreferences).values({ userId });
    }

    const adminRole = await createDb(pool).query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      const existingRole = await createDb(pool).query.userRoles.findFirst({
        where: and(
          eq(schema.userRoles.userId, userId),
          eq(schema.userRoles.roleId, adminRole.id),
        ),
      });
      if (!existingRole) {
        await createDb(pool)
          .insert(schema.userRoles)
          .values({ userId, roleId: adminRole.id });
      }
    }

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "books-editor@test.local", password: "password123" },
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
        title: "Metadata Editor Test",
        authors: ["Editor Author"],
      },
    });
    bookSlug = create.json().data.slug;
    bookId = create.json().data.id;
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("returns metadata editor matrix", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}/metadata/editor`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Array.isArray(data.providerSources)).toBe(true);
    expect(Array.isArray(data.fields)).toBe(true);
    expect(Array.isArray(data.providerSpecificFields)).toBe(true);
    expect(data.fields.map((f: { id: string }) => f.id)).toEqual(
      getBookEditorFieldOrder(),
    );
    const titleField = data.fields.find(
      (f: { id: string }) => f.id === "title",
    );
    expect(titleField?.feyloreValue).toBe("Metadata Editor Test");
  });

  it.skipIf(!dbAvailable)("returns provider-specific field values from payloads", async () => {
    const db = createDb(pool);
    await db.insert(schema.metadataRecords).values({
      id: generateId(),
      providerKey: "hardcover",
      externalId: "123",
      subjectType: "book",
      subjectId: bookId,
      payload: { "hardcover.rating": 4.5 },
      fetchedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}/metadata/editor`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const ratingRow = res.json().data.providerSpecificFields.find(
      (f: { key: string }) => f.key === "hardcover.rating",
    );
    expect(ratingRow?.label).toBe("Hardcover rating");
    expect(ratingRow?.providerKey).toBe("hardcover");
    expect(ratingRow?.providerLabel).toBe("Hardcover");
    const hardcoverCell = ratingRow?.sources.find(
      (s: { key: string }) => s.key === "hardcover",
    );
    expect(hardcoverCell?.value).toBe("4.5");
  });

  it.skipIf(!dbAvailable)("returns open-library provider field identity from payloads", async () => {
    const db = createDb(pool);
    await db.insert(schema.metadataRecords).values({
      id: generateId(),
      providerKey: "open-library",
      externalId: "works/OL1W",
      subjectType: "book",
      subjectId: bookId,
      payload: { "open-library.series": '["Test Series", "1"]' },
      fetchedAt: new Date(),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}/metadata/editor`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const seriesRow = res.json().data.providerSpecificFields.find(
      (f: { key: string }) => f.key === "open-library.series",
    );
    expect(seriesRow?.label).toBe("Series (raw)");
    expect(seriesRow?.providerKey).toBe("open-library");
    const providerFieldKeys = res.json().data.providerSpecificFields.map(
      (f: { key: string }) => f.key,
    );
    expect(providerFieldKeys).toContain("open-library.series");
    expect(providerFieldKeys).not.toContain("open-library.physicalFormat");
    expect(providerFieldKeys).not.toContain("open-library.universe");
    expect(seriesRow?.providerLabel).toBe("Open Library");
    const openLibraryCell = seriesRow?.sources.find(
      (s: { key: string }) => s.key === "open-library",
    );
    expect(openLibraryCell?.value).toBe('["Test Series", "1"]');
  });

  it.skipIf(!dbAvailable)("locks and unlocks a metadata field", async () => {
    const lock = await app.inject({
      method: "PATCH",
      url: `/api/v1/books/${bookSlug}/metadata`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { field: "title", value: "Locked Title" },
    });
    expect(lock.statusCode).toBe(200);

    const editor = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}/metadata/editor`,
      headers: { cookie },
    });
    const titleField = editor.json().data.fields.find(
      (f: { id: string }) => f.id === "title",
    );
    expect(titleField?.isLocked).toBe(true);
    expect(titleField?.feyloreValue).toBe("Locked Title");

    const unlock = await app.inject({
      method: "DELETE",
      url: `/api/v1/books/${bookSlug}/metadata/title`,
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(unlock.statusCode).toBe(200);
  });

  it.skipIf(!dbAvailable)("bulk-edits canonical metadata fields", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/books/${bookSlug}/metadata/fields`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        fields: {
          publisher: "Test Publisher",
          description: "A test description",
        },
      },
    });
    expect(res.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}`,
      headers: { cookie },
    });
    const publisherField = detail.json().data.metadataFields.find(
      (f: { id: string }) => f.id === "publisher",
    );
    expect(publisherField?.value).toBe("Test Publisher");
  });

  it.skipIf(!dbAvailable)("metadata fetch returns 404 without representation", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/books/${bookSlug}/metadata/fetch`,
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(404);
  });

  it.skipIf(!dbAvailable)("rejects local cover URLs without attempting an import", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/books/${bookSlug}/metadata`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        field: "cover",
        value: "file:///C:/private/cover.jpg",
        sourceKey: "open-library",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("Invalid request");
  });
});
