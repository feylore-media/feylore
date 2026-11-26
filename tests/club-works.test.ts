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

async function createBook(
  app: Awaited<ReturnType<typeof buildApp>>["app"],
  cookie: string,
  title: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/books",
    headers: {
      cookie,
      origin: "http://localhost:5173",
      "content-type": "application/json",
    },
    payload: { title, authors: ["Author"] },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data.id as string;
}

describe("Club works API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let ownerCookie = "";
  let memberCookie = "";
  let outsiderCookie = "";
  let clubId = "";
  let bookId = "";
  let book2Id = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-club-works-"),
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
      const role = await db.query.roles.findFirst({
        where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
      });
      if (role) {
        await db.insert(schema.userRoles).values({ userId, roleId: role.id });
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

    ownerCookie = await setupUser("club-works-owner@test.local", "worksowner");
    memberCookie = await setupUser("club-works-member@test.local", "worksmember");
    outsiderCookie = await setupUser("club-works-out@test.local", "worksout");

    bookId = await createBook(app, ownerCookie, "Club Test Book");
    book2Id = await createBook(app, ownerCookie, "Second Book");

    const createClub = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Book Club Works",
        visibility: "private",
        context: "book",
      },
    });
    clubId = createClub.json().data.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/invites`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { username: "worksmember" },
    });
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("owner can add work and set current", async () => {
    const add = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/works`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        workSubjectType: "book",
        workSubjectId: bookId,
        status: "current",
      },
    });
    expect(add.statusCode).toBe(201);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}`,
      headers: { cookie: ownerCookie },
    });
    expect(detail.json().data.currentWork?.workSubjectId).toBe(bookId);
  });

  it.skipIf(!dbAvailable)("only one current work allowed", async () => {
    const add = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/works`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        workSubjectType: "book",
        workSubjectId: book2Id,
        status: "current",
      },
    });
    expect(add.statusCode).toBe(201);

    const works = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/works`,
      headers: { cookie: ownerCookie },
    });
    const current = works
      .json()
      .data.filter((w: { status: string }) => w.status === "current");
    expect(current).toHaveLength(1);
    expect(current[0].workSubjectId).toBe(book2Id);
  });

  it.skipIf(!dbAvailable)("rejects wrong work type for club context", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/works`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        workSubjectType: "show",
        workSubjectId: generateId(),
        status: "associated",
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it.skipIf(!dbAvailable)("outsider cannot list works", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/works`,
      headers: { cookie: outsiderCookie },
    });
    expect(res.statusCode).toBe(403);
  });
});
