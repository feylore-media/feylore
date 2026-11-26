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

describe.skipIf(!dbAvailable)("Club overview API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: ReturnType<typeof createPool>;
  let ownerCookie = "";
  let bookClubId = "";
  let videoClubId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-club-overview-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;

    const userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "overview-owner@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "overview-owner@test.local",
      username: "overviewowner",
      displayName: "Overview Owner",
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
      payload: { email: "overview-owner@test.local", password: "password123" },
    });
    ownerCookie = login.headers["set-cookie"]?.toString() ?? "";

    const bookClub = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Overview Book Club",
        visibility: "private",
        context: "book",
      },
    });
    bookClubId = bookClub.json().data.id;

    const videoClub = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Overview Video Club",
        visibility: "private",
        context: "video",
      },
    });
    videoClubId = videoClub.json().data.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns aggregated overview for a book club", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${bookClubId}/overview`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
      },
    });

    expect(res.statusCode).toBe(200);
    const overview = res.json().data;
    expect(overview).toMatchObject({
      work: null,
      activePoll: null,
      viewerProgress: null,
    });
    expect(overview.checkIn).toBeDefined();
    expect(Array.isArray(overview.discussionAnchors)).toBe(true);
    expect(Array.isArray(overview.quotes)).toBe(true);
  });

  it("omits quotes for non-book clubs", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${videoClubId}/overview`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.quotes).toEqual([]);
  });
});
