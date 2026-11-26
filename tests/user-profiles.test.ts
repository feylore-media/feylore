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
import { PROFILE_VISIBILITY } from "../src/shared/profile.js";

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

describe("User profiles API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookieA = "";
  let cookieB = "";
  let userAId = "";
  let userBId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-user-profiles-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    userAId = generateId();
    userBId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "profilea@test.local"));
    await db.delete(schema.users).where(eq(schema.users.email, "profileb@test.local"));

    await db.insert(schema.users).values({
      id: userAId,
      email: "profilea@test.local",
      username: "profilealice",
      displayName: "Alice",
      passwordHash: await hash("password123"),
      bio: "Reader",
      profileVisibility: PROFILE_VISIBILITY.PUBLIC,
    });
    await db.insert(schema.userPreferences).values({ userId: userAId });

    await db.insert(schema.users).values({
      id: userBId,
      email: "profileb@test.local",
      username: "profilebob",
      displayName: "Bob",
      passwordHash: await hash("password123"),
      profileVisibility: PROFILE_VISIBILITY.PRIVATE,
    });
    await db.insert(schema.userPreferences).values({ userId: userBId });

    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, "member"),
    });
    if (memberRole) {
      await db.insert(schema.userRoles).values({
        userId: userAId,
        roleId: memberRole.id,
      });
      await db.insert(schema.userRoles).values({
        userId: userBId,
        roleId: memberRole.id,
      });
    }

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const loginA = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "profilea@test.local", password: "password123" },
    });
    cookieA = loginA.headers["set-cookie"]?.toString() ?? "";

    const loginB = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "profileb@test.local", password: "password123" },
    });
    cookieB = loginB.headers["set-cookie"]?.toString() ?? "";
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("returns public profile to authenticated viewer", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/profilealice",
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.username).toBe("profilealice");
    expect(res.json().data.bio).toBe("Reader");
  });

  it.skipIf(!dbAvailable)("hides private profile from other users", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/profilebob",
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(404);
  });

  it.skipIf(!dbAvailable)("updates profile fields via PATCH /auth/me", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/me",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        bio: "Updated bio",
        profileVisibility: PROFILE_VISIBILITY.MEMBERS,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.profile.bio).toBe("Updated bio");
    expect(res.json().data.profile.profileVisibility).toBe(PROFILE_VISIBILITY.MEMBERS);
  });

  it.skipIf(!dbAvailable)("changes username via PATCH /auth/me/username", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/me/username",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { username: "alice-profile" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.username).toBe("alice-profile");
  });

  it.skipIf(!dbAvailable)("manages device settings separately from user preferences", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/devices",
      headers: {
        cookie: cookieB,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { name: "Tablet" },
    });
    expect(create.statusCode).toBe(201);
    const deviceId = create.json().data.id as string;

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/v1/devices/${deviceId}`,
      headers: {
        cookie: cookieB,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Bedroom Tablet",
        settingsJson: { readerFontScale: 1.1 },
      },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.name).toBe("Bedroom Tablet");
    expect(patch.json().data.settingsJson.readerFontScale).toBe(1.1);

    const state = await app.inject({
      method: "PUT",
      url: `/api/v1/devices/${deviceId}/state`,
      headers: {
        cookie: cookieB,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { stateJson: { lastRoute: "/books" } },
    });
    expect(state.statusCode).toBe(200);
    expect(state.json().data.stateJson.lastRoute).toBe("/books");
  });
});
