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

const headers = (cookie: string) => ({
  cookie,
  origin: "http://localhost:5173",
  "content-type": "application/json",
});

describe("Physical book ownership", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let cookieA = "";
  let cookieB = "";
  let bookId = "";
  let bookSlug = "";
  let manifestationId = "";
  let otherManifestationId = "";
  const isbn = "9781234567890";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-physical-holdings-"),
    );

    pool = createPool(DATABASE_URL);
    db = createDb(pool);
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
        await db
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
        payload: { email, password: "password123" },
      });
      return login.headers["set-cookie"]?.toString() ?? "";
    }

    cookieA = await setupUser("physical-a@test.local", "physicala");
    cookieB = await setupUser("physical-b@test.local", "physicalb");

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: headers(cookieA),
      payload: { title: "Physical Ownership Novel" },
    });
    expect(create.statusCode).toBe(201);
    bookId = create.json().data.id;
    bookSlug = create.json().data.slug;

    const other = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: headers(cookieA),
      payload: { title: "Unrelated Other Book" },
    });
    const otherDetail = await app.inject({
      method: "GET",
      url: `/api/v1/books/${other.json().data.slug}`,
      headers: { cookie: cookieA },
    });
    otherManifestationId = otherDetail.json().data.manifestations[0].id;

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}`,
      headers: { cookie: cookieA },
    });
    manifestationId = detail.json().data.manifestations[0].id;

    // Simulate ingest metadata: tag the default manifestation with an ISBN.
    await db
      .update(schema.creativeWorkManifestations)
      .set({ externalIdType: "isbn13", externalId: isbn })
      .where(eq(schema.creativeWorkManifestations.id, manifestationId));
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)(
    "marks a Work owned with unknown edition",
    async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: headers(cookieA),
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.workId).toBe(bookId);
      expect(res.json().data.manifestationId).toBeNull();

      const get = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: { cookie: cookieA },
      });
      expect(get.statusCode).toBe(200);
      expect(get.json().data.workId).toBe(bookId);

      const detail = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}`,
        headers: { cookie: cookieA },
      });
      expect(detail.json().data.physicalHolding.workId).toBe(bookId);
      expect(detail.json().data.physicalHolding.manifestationId).toBeNull();
    },
  );

  it.skipIf(!dbAvailable)(
    "repeated ownership requests are idempotent",
    async () => {
      const first = await app.inject({
        method: "POST",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: headers(cookieA),
        payload: {},
      });
      expect(first.statusCode).toBe(200);
      const rows = await db
        .select()
        .from(schema.physicalHoldings)
        .where(
          and(
            eq(schema.physicalHoldings.workType, "book"),
            eq(schema.physicalHoldings.workId, bookId),
          ),
        );
      // One holding per (user, work): user A only.
      expect(rows.filter((r) => r.manifestationId == null)).toHaveLength(1);
      expect(first.json().data.id).toBe(rows[0]!.id);
    },
  );

  it.skipIf(!dbAvailable)(
    "identifies an unknown holding with an edition",
    async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: headers(cookieA),
        payload: { manifestationId },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.manifestationId).toBe(manifestationId);

      const rows = await db
        .select()
        .from(schema.physicalHoldings)
        .where(
          and(
            eq(schema.physicalHoldings.workType, "book"),
            eq(schema.physicalHoldings.workId, bookId),
          ),
        );
      // Reconciled in place — no duplicate holding.
      expect(rows).toHaveLength(1);
    },
  );

  it.skipIf(!dbAvailable)(
    "rejects a manifestation from another book",
    async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: headers(cookieA),
        payload: { manifestationId: otherManifestationId },
      });
      expect(res.statusCode).toBe(422);
    },
  );

  it.skipIf(!dbAvailable)(
    "creates no Representation rows for physical copies",
    async () => {
      const detail = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}`,
        headers: { cookie: cookieA },
      });
      expect(detail.json().data.representations).toHaveLength(0);
    },
  );

  it.skipIf(!dbAvailable)(
    "ISBN scan reconciles and is idempotent",
    async () => {
      // Reset A to edition-unknown, then scan the ISBN twice.
      await app.inject({
        method: "DELETE",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: headers(cookieA),
      });
      const unknown = await app.inject({
        method: "POST",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: headers(cookieA),
        payload: {},
      });
      expect(unknown.statusCode).toBe(201);
      const unknownId = unknown.json().data.id;

      const scan = await app.inject({
        method: "POST",
        url: "/api/v1/books/physical-holdings/by-isbn",
        headers: headers(cookieA),
        payload: { isbn: "978-1-2345-6789-0" },
      });
      expect([200, 201]).toContain(scan.statusCode);
      expect(scan.json().data.id).toBe(unknownId);
      expect(scan.json().data.manifestationId).toBe(manifestationId);

      const rescan = await app.inject({
        method: "POST",
        url: "/api/v1/books/physical-holdings/by-isbn",
        headers: headers(cookieA),
        payload: { isbn },
      });
      expect(rescan.statusCode).toBe(200);
      expect(rescan.json().data.id).toBe(unknownId);
    },
  );

  it.skipIf(!dbAvailable)("unknown ISBN returns 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/books/physical-holdings/by-isbn",
      headers: headers(cookieA),
      payload: { isbn: "9780000000000" },
    });
    expect(res.statusCode).toBe(404);
  });

  it.skipIf(!dbAvailable)("holdings are user-scoped", async () => {
    const bGet = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}/physical-holding`,
      headers: { cookie: cookieB },
    });
    expect(bGet.json().data).toBeNull();

    const bMark = await app.inject({
      method: "POST",
      url: `/api/v1/books/${bookSlug}/physical-holding`,
      headers: headers(cookieB),
      payload: {},
    });
    expect(bMark.statusCode).toBe(201);

    const aGet = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}/physical-holding`,
      headers: { cookie: cookieA },
    });
    expect(aGet.json().data.manifestationId).toBe(manifestationId);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/books/physical-holdings",
      headers: { cookie: cookieB },
    });
    expect(list.json().data).toHaveLength(1);

    const filtered = await app.inject({
      method: "GET",
      url: "/api/v1/books/physical-holdings?withoutDigital=true",
      headers: { cookie: cookieB },
    });
    expect(filtered.statusCode).toBe(200);
    // No digital files exist for the book, so the holding qualifies.
    expect(filtered.json().data).toHaveLength(1);
  });

  it.skipIf(!dbAvailable)(
    "supports physical-ownership book filtering",
    async () => {
      const owned = await app.inject({
        method: "GET",
        url: "/api/v1/books?physicalOwned=true",
        headers: { cookie: cookieB },
      });
      expect(owned.statusCode).toBe(200);
      expect(owned.json().data.map((b: { id: string }) => b.id)).toContain(
        bookId,
      );

      const notOwned = await app.inject({
        method: "GET",
        url: "/api/v1/books?physicalOwned=false",
        headers: { cookie: cookieB },
      });
      expect(
        notOwned.json().data.map((b: { id: string }) => b.id),
      ).not.toContain(bookId);

      const withoutDigital = await app.inject({
        method: "GET",
        url: "/api/v1/books?physicalWithoutDigital=true",
        headers: { cookie: cookieB },
      });
      expect(
        withoutDigital.json().data.map((b: { id: string }) => b.id),
      ).toContain(bookId);
    },
  );

  it.skipIf(!dbAvailable)(
    "removing ownership only removes the current user holding",
    async () => {
      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: headers(cookieB),
      });
      expect(del.statusCode).toBe(200);

      const bGet = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: { cookie: cookieB },
      });
      expect(bGet.json().data).toBeNull();

      const aGet = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: { cookie: cookieA },
      });
      expect(aGet.json().data).not.toBeNull();
    },
  );

  it.skipIf(!dbAvailable)(
    "deletion preview reports physical holdings",
    async () => {
      // Re-add B's holding so two users hold the Work.
      await app.inject({
        method: "POST",
        url: `/api/v1/books/${bookSlug}/physical-holding`,
        headers: headers(cookieB),
        payload: {},
      });
      const preview = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/deletion-preview`,
        headers: { cookie: cookieA },
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().data.physicalHoldings).toEqual({
        holdings: 2,
        users: 2,
      });
      expect(preview.json().data.manifestations).toBe(1);
    },
  );

  it.skipIf(!dbAvailable)(
    "deleting a Work removes its physical holdings",
    async () => {
      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/books/${bookSlug}`,
        headers: headers(cookieA),
      });
      expect(del.statusCode).toBe(200);
      const rows = await db
        .select()
        .from(schema.physicalHoldings)
        .where(
          and(
            eq(schema.physicalHoldings.workType, "book"),
            eq(schema.physicalHoldings.workId, bookId),
          ),
        );
      expect(rows).toHaveLength(0);
    },
  );
});
