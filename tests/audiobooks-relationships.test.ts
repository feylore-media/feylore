import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
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
import { RELATED_EDITION_RELATIONSHIP } from "../src/shared/audiobooks.js";

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

describe("Audiobook relationships", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let userId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-ab-rel-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    ctx = built.ctx;
    pool = built.pool;

    userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "ab-rel@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "ab-rel@test.local",
      username: "abrel",
      displayName: "AB Rel",
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
      payload: { email: "ab-rel@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)(
    "links audiobook to book and deleting representation does not delete book",
    async () => {
      const book = await app.inject({
        method: "POST",
        url: "/api/v1/books",
        headers: {
          cookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { title: "Related Print Book" },
      });
      const bookId = book.json().data.id;
      const bookSlug = book.json().data.slug;

      const audiobook = await app.inject({
        method: "POST",
        url: "/api/v1/audiobooks",
        headers: {
          cookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { title: "Related Audiobook Edition" },
      });
      const audiobookSlug = audiobook.json().data.slug;

      const rel = await app.inject({
        method: "POST",
        url: `/api/v1/audiobooks/${audiobookSlug}/relationships`,
        headers: {
          cookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: {
          targetType: "book",
          targetId: bookId,
          relationshipType: RELATED_EDITION_RELATIONSHIP,
        },
      });
      expect(rel.statusCode).toBe(201);
      const relId = rel.json().data.id;

      const list = await app.inject({
        method: "GET",
        url: `/api/v1/audiobooks/${audiobookSlug}/relationships`,
        headers: { cookie },
      });
      expect(list.statusCode).toBe(200);
      expect(
        list.json().data.some(
          (r: { targetId: string; targetHref?: string }) =>
            r.targetId === bookId && r.targetHref === `/books/${bookSlug}`,
        ),
      ).toBe(true);

      const relatedFromAudiobook = await app.inject({
        method: "GET",
        url: `/api/v1/audiobooks/${audiobookSlug}/related?groups=semantic`,
        headers: { cookie },
      });
      expect(relatedFromAudiobook.statusCode).toBe(200);
      expect(relatedFromAudiobook.json().data.semantic.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: bookId,
            type: "book",
            relationshipType: RELATED_EDITION_RELATIONSHIP,
          }),
        ]),
      );

      const relatedFromBook = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/related?groups=semantic`,
        headers: { cookie },
      });
      expect(relatedFromBook.statusCode).toBe(200);
      expect(relatedFromBook.json().data.semantic.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "audiobook",
            relationshipType: RELATED_EDITION_RELATIONSHIP,
          }),
        ]),
      );

      const db = createDb(pool);
      const audiobookId = audiobook.json().data.id;
      await db
        .delete(schema.libraryMemberships)
        .where(
          and(
            eq(schema.libraryMemberships.userId, userId),
            eq(schema.libraryMemberships.targetType, "audiobook"),
            eq(schema.libraryMemberships.targetId, audiobookId),
          ),
        );
      const hiddenTarget = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/related?groups=semantic`,
        headers: { cookie },
      });
      expect(hiddenTarget.statusCode).toBe(200);
      expect(hiddenTarget.json().data.semantic).toMatchObject({
        count: 0,
        items: [],
      });
      await db.insert(schema.libraryMemberships).values({
        userId,
        targetType: "audiobook",
        targetId: audiobookId,
      });

      const detail = await app.inject({
        method: "GET",
        url: `/api/v1/audiobooks/${audiobookSlug}`,
        headers: { cookie },
      });
      expect(
        detail.json().data.relationships.some(
          (r: { targetId: string }) => r.targetId === bookId,
        ),
      ).toBe(true);

      await app.inject({
        method: "DELETE",
        url: `/api/v1/audiobooks/${audiobookSlug}`,
        headers: { cookie, origin: "http://localhost:5173" },
      });

      const bookDetail = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}`,
        headers: { cookie },
      });
      expect(bookDetail.statusCode).toBe(200);
      expect(bookDetail.json().data.id).toBe(bookId);

      const removed = await app.inject({
        method: "DELETE",
        url: `/api/v1/audiobooks/${audiobookSlug}/relationships/${relId}`,
        headers: { cookie, origin: "http://localhost:5173" },
      });
      expect([200, 404]).toContain(removed.statusCode);
    },
  );

  it.skipIf(!dbAvailable)(
    "paginates a high-connectivity related group without loading other groups",
    async () => {
      const audiobook = await app.inject({
        method: "POST",
        url: "/api/v1/audiobooks",
        headers: {
          cookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { title: "Relationship hub" },
      });
      const audiobookSlug = audiobook.json().data.slug;

      for (let index = 0; index < 25; index += 1) {
        const book = await app.inject({
          method: "POST",
          url: "/api/v1/books",
          headers: {
            cookie,
            origin: "http://localhost:5173",
            "content-type": "application/json",
          },
          payload: { title: `Related book ${index}` },
        });
        const relation = await app.inject({
          method: "POST",
          url: `/api/v1/audiobooks/${audiobookSlug}/relationships`,
          headers: {
            cookie,
            origin: "http://localhost:5173",
            "content-type": "application/json",
          },
          payload: {
            targetType: "book",
            targetId: book.json().data.id,
            relationshipType: "related_to",
          },
        });
        expect(relation.statusCode).toBe(201);
      }

      const startedAt = performance.now();
      const firstPage = await app.inject({
        method: "GET",
        url: `/api/v1/audiobooks/${audiobookSlug}/related?groups=semantic&limit=10`,
        headers: { cookie },
      });
      expect(performance.now() - startedAt).toBeLessThan(250);
      expect(firstPage.statusCode).toBe(200);
      expect(firstPage.json().data).toEqual({
        semantic: expect.objectContaining({
          count: 25,
          items: expect.any(Array),
          nextCursor: 10,
        }),
      });
      expect(firstPage.json().data.semantic.items).toHaveLength(10);

      const secondPage = await app.inject({
        method: "GET",
        url: `/api/v1/audiobooks/${audiobookSlug}/related?groups=semantic&limit=10&cursor=10`,
        headers: { cookie },
      });
      expect(secondPage.statusCode).toBe(200);
      expect(secondPage.json().data.semantic.items).toHaveLength(10);
      expect(secondPage.json().data.semantic.items[0].id).not.toBe(
        firstPage.json().data.semantic.items[0].id,
      );

      const instrumentedPool = pool as unknown as {
        query: (...args: unknown[]) => Promise<unknown>;
      };
      const originalQuery = instrumentedPool.query.bind(pool);
      let queryCount = 0;
      instrumentedPool.query = (...args) => {
        queryCount += 1;
        return originalQuery(...args);
      };
      try {
        const projection = await ctx.relationships.getRelated(
          userId,
          { type: "audiobook", id: audiobook.json().data.id },
          ["semantic"],
          { limit: 10, cursor: 0 },
        );
        expect((projection.semantic as { items: unknown[] }).items).toHaveLength(
          10,
        );
      } finally {
        instrumentedPool.query = originalQuery;
      }
      expect(queryCount).toBeLessThanOrEqual(5);

      queryCount = 0;
      instrumentedPool.query = (...args) => {
        queryCount += 1;
        return originalQuery(...args);
      };
      try {
        await ctx.relationships.getRelated(
          userId,
          { type: "audiobook", id: audiobook.json().data.id },
          ["semantic", "people", "series", "representations"],
          { limit: 10, cursor: 0 },
        );
      } finally {
        instrumentedPool.query = originalQuery;
      }
      expect(queryCount).toBeLessThanOrEqual(11);
    },
  );
});
