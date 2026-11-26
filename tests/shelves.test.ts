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

describe("Shelves API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let ownerCookie = "";
  let otherCookie = "";
  let editorCookie = "";
  let adminCookie = "";
  let ownerId = "";
  let otherId = "";
  let editorId = "";
  let shelfId = "";
  let sharedShelfId = "";
  let collaborativeShelfId = "";
  let booksScopeShelfId = "";
  let bookId = "";
  let movieId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-shelves-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    async function setupUser(
      email: string,
      username: string,
      roleName?: string,
    ) {
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
      if (roleName) {
        const role = await db.query.roles.findFirst({
          where: eq(schema.roles.name, roleName),
        });
        if (role) {
          await db.insert(schema.userRoles).values({ userId, roleId: role.id });
        }
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
      return { userId, cookie: login.headers["set-cookie"]?.toString() ?? "" };
    }

    const owner = await setupUser(
      "shelf-owner@test.local",
      "shelfowner",
      ROLE_NAMES.MEMBER,
    );
    ownerId = owner.userId;
    ownerCookie = owner.cookie;

    const other = await setupUser(
      "shelf-other@test.local",
      "shelfother",
      ROLE_NAMES.MEMBER,
    );
    otherId = other.userId;
    otherCookie = other.cookie;

    const editor = await setupUser(
      "shelf-editor@test.local",
      "shelfeditor",
      ROLE_NAMES.MEMBER,
    );
    editorId = editor.userId;
    editorCookie = editor.cookie;

    const admin = await setupUser(
      "shelf-admin@test.local",
      "shelfadmin",
      ROLE_NAMES.ADMIN,
    );
    adminCookie = admin.cookie;

    const createBook = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Shelf Test Book", authors: ["Test Author"] },
    });
    bookId = createBook.json().data.id;

    const createMovie = await app.inject({
      method: "POST",
      url: "/api/v1/movies",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Shelf Test Movie" },
    });
    movieId = createMovie.json().data.id;

    const createShelf = await app.inject({
      method: "POST",
      url: "/api/v1/shelves",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Private Shelf",
        icon: "books",
        scope: "global",
        visibility: "private",
      },
    });
    shelfId = createShelf.json().data.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/shelves/${shelfId}/items`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { subjectType: "book", subjectId: bookId },
    });

    const createShared = await app.inject({
      method: "POST",
      url: "/api/v1/shelves",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Shared Shelf",
        scope: "global",
        visibility: "shared",
      },
    });
    sharedShelfId = createShared.json().data.id;

    const createCollab = await app.inject({
      method: "POST",
      url: "/api/v1/shelves",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Collaborative Shelf",
        scope: "books",
        visibility: "collaborative",
        editors: [editorId],
        confirmEmptyEditors: false,
      },
    });
    collaborativeShelfId = createCollab.json().data.id;

    const createBooksScope = await app.inject({
      method: "POST",
      url: "/api/v1/shelves",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Books TBR",
        scope: "books",
        visibility: "private",
      },
    });
    booksScopeShelfId = createBooksScope.json().data.id;
  }, 120000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("lists shelves with scope filter", async () => {
    const booksList = await app.inject({
      method: "GET",
      url: "/api/v1/shelves?scope=books",
      headers: { cookie: ownerCookie },
    });
    expect(booksList.statusCode).toBe(200);
    const ids = booksList.json().data.map((s: { id: string }) => s.id);
    expect(ids).toContain(booksScopeShelfId);
    expect(ids).toContain(sharedShelfId);

    const moviesList = await app.inject({
      method: "GET",
      url: "/api/v1/shelves?scope=movies",
      headers: { cookie: ownerCookie },
    });
    const movieIds = moviesList.json().data.map((s: { id: string }) => s.id);
    expect(movieIds).not.toContain(booksScopeShelfId);
    expect(movieIds).toContain(sharedShelfId);
  });

  it.skipIf(!dbAvailable)("private shelf denied to non-owner", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/shelves/${shelfId}`,
      headers: { cookie: otherCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("shared shelf visible but not editable by other", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/shelves/${sharedShelfId}`,
      headers: { cookie: otherCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.shelf.visibility).toBe("shared");
    expect(res.json().data.canEdit).toBe(false);

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/shelves/${sharedShelfId}`,
      headers: {
        cookie: otherCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { name: "Hacked" },
    });
    expect(patch.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("collaborative editor can edit", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/shelves/${collaborativeShelfId}`,
      headers: { cookie: editorCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.canEdit).toBe(true);
    expect(res.json().data.shelf.isOwner).toBe(false);
  });

  it.skipIf(!dbAvailable)("non-editor cannot edit collaborative shelf", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/shelves/${collaborativeShelfId}`,
      headers: {
        cookie: otherCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { name: "Blocked" },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("owner manages editors", async () => {
    const put = await app.inject({
      method: "PUT",
      url: `/api/v1/shelves/${collaborativeShelfId}/grants`,
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { userIds: [editorId] },
    });
    expect(put.statusCode).toBe(200);

    const nonOwner = await app.inject({
      method: "PUT",
      url: `/api/v1/shelves/${collaborativeShelfId}/grants`,
      headers: {
        cookie: editorCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { userIds: [otherId] },
    });
    expect(nonOwner.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("scope change rejects incompatible items without confirm", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v1/shelves/${shelfId}/items`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { subjectType: "movie", subjectId: movieId },
    });

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/shelves/${shelfId}`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { scope: "books" },
    });
    expect(patch.statusCode).toBe(422);
  });

  it.skipIf(!dbAvailable)("rule-derived membership with nested expression", async () => {
    const ruleShelf = await app.inject({
      method: "POST",
      url: "/api/v1/shelves",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Favorite Books",
        scope: "books",
        visibility: "private",
        membershipExpression: {
          type: "group",
          operator: "and",
          children: [
            {
              type: "rule",
              field: "title",
              operator: "contains",
              value: "Shelf Test",
            },
          ],
        },
      },
    });
    const id = ruleShelf.json().data.id;

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/shelves/${id}`,
      headers: { cookie: ownerCookie },
    });
    expect(detail.statusCode).toBe(200);
    const items = detail.json().data.items;
    expect(
      items.some(
        (i: { subjectId: string; membershipSources: string[] }) =>
          i.subjectId === bookId && i.membershipSources.includes("rule"),
      ),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("combined manual and rule membership sources", async () => {
    const id = (
      await app.inject({
        method: "POST",
        url: "/api/v1/shelves",
        headers: {
          cookie: ownerCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: {
          name: "Combined",
          scope: "books",
          visibility: "private",
          membershipExpression: {
            type: "rule",
            field: "title",
            operator: "contains",
            value: "Shelf Test",
          },
        },
      })
    ).json().data.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/shelves/${id}/items`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { subjectType: "book", subjectId: bookId },
    });

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/shelves/${id}`,
      headers: { cookie: ownerCookie },
    });
    const item = detail.json().data.items.find(
      (i: { subjectId: string }) => i.subjectId === bookId,
    );
    expect(item.membershipSources).toContain("manual");
    expect(item.membershipSources).toContain("rule");
  });

  it.skipIf(!dbAvailable)("multi-level sort levels persist", async () => {
    const id = (
      await app.inject({
        method: "POST",
        url: "/api/v1/shelves",
        headers: {
          cookie: ownerCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: {
          name: "Sorted",
          scope: "books",
          visibility: "private",
          sortLevels: [
            { field: "title", order: "asc" },
            { field: "addedAt", order: "desc" },
          ],
        },
      })
    ).json().data.id;

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/shelves/${id}`,
      headers: { cookie: ownerCookie },
    });
    expect(detail.json().data.shelf.sortLevels).toHaveLength(2);
  });

  it.skipIf(!dbAvailable)("member cannot publish shared shelf", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/shelves",
      headers: {
        cookie: otherCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Blocked Shared",
        scope: "global",
        visibility: "shared",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("reorders items and enforces edit permission", async () => {
    const book2 = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Second Book" },
    });
    const book2Id = book2.json().data.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/shelves/${shelfId}/items`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { subjectType: "book", subjectId: book2Id },
    });

    const reorder = await app.inject({
      method: "PATCH",
      url: `/api/v1/shelves/${shelfId}/items/order`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        items: [
          { subjectType: "book", subjectId: book2Id, sortOrder: 0 },
          { subjectType: "book", subjectId: bookId, sortOrder: 1 },
        ],
      },
    });
    expect(reorder.statusCode).toBe(200);
  });

  it("rejects invalid shelf icon ids", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/shelves",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Bad Icon Shelf",
        icon: "not-a-valid-icon",
        scope: "global",
        visibility: "private",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
