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

describe("Reading progress API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let representationId = "";
  let bookId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-reading-api-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "reading-api@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "reading-api@test.local",
      username: "readingapi",
      displayName: "Reading API",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await db.insert(schema.userRoles).values({ userId, roleId: memberRole.id });
    }

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "reading-api@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    bookId = await built.ctx.books.createBook({
      title: "API Reading Book",
      authors: ["Author"],
    });
    await built.ctx.libraryMembership.ensureWorkMembership(userId, "book", bookId);

    const expressionId = generateId();
    const manifestationId = generateId();
    representationId = generateId();
    await db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "book",
      workId: bookId,
      label: "default",
    });
    await db.insert(schema.creativeWorkManifestations).values({
      id: manifestationId,
      expressionId,
      label: "default",
    });
    await db.insert(schema.representations).values({
      id: representationId,
      manifestationId,
      format: "epub",
      domainModule: "books",
    });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("PUT and GET representation reading progress", async () => {
    const put = await app.inject({
      method: "PUT",
      url: `/api/v1/representations/${representationId}/reading-progress`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: {
          type: "epub-cfi",
          cfi: "epubcfi(/6/8)",
          progression: 0.33,
        },
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data.accepted).toBe(true);

    const get = await app.inject({
      method: "GET",
      url: `/api/v1/representations/${representationId}/reading-progress`,
      headers: { cookie },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.locator.cfi).toBe("epubcfi(/6/8)");
  });

  it.skipIf(!dbAvailable)("records reading activity", async () => {
    const post = await app.inject({
      method: "POST",
      url: `/api/v1/representations/${representationId}/reading-activity`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: { type: "epub-cfi", cfi: "epubcfi(/6/10)", progression: 0.4 },
        duration: 15,
        visibility: "active",
        clientId: "api-test-client",
      },
    });
    expect(post.statusCode).toBe(201);
    expect(post.json().data.sessionId).toBeTruthy();
  });
});
