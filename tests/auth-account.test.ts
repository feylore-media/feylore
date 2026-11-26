import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash, verify } from "@node-rs/argon2";
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

describe("Auth account API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let userId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-auth-account-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "account@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "account@test.local",
      username: "accountuser",
      displayName: "Account User",
      passwordHash: await hash("password123"),
      locale: "en",
    });
    await db.insert(schema.userPreferences).values({ userId });

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "account@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("updates profile via PATCH /auth/me", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/me",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { displayName: "Renamed User", locale: "en-GB" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.displayName).toBe("Renamed User");
    expect(res.json().data.user.locale).toBe("en-GB");
  });

  it.skipIf(!dbAvailable)("changes password via POST /auth/password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        currentPassword: "password123",
        newPassword: "newpassword456",
      },
    });
    expect(res.statusCode).toBe(200);

    const db = createDb(pool);
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    expect(await verify(user!.passwordHash!, "newpassword456")).toBe(true);
  });

  it.skipIf(!dbAvailable)("rejects wrong current password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        currentPassword: "wrong-password",
        newPassword: "anotherpassword",
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
