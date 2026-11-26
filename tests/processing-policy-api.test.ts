import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { buildApp } from "../src/server/http/app.js";
import { createPool, createDb } from "../src/server/db/client.js";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { ROLE_NAMES } from "../src/shared/permissions.js";
import { createDefaultPolicy } from "../src/shared/processing-policy.js";

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

describe("Processing policy API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-processing-api-"),
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
      .where(eq(schema.users.email, "processing-api@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "processing-api@test.local",
      username: "processingapi",
      displayName: "Processing API User",
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
      payload: { email: "processing-api@test.local", password: "password123" },
    });
    expect(login.statusCode).toBe(200);
    cookie = login.headers["set-cookie"]?.toString() ?? "";
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("lists enabled processing modules", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/processing/modules",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    const modules = res.json().data as Array<{ moduleId: string }>;
    expect(modules.some((m) => m.moduleId === "books")).toBe(true);
    const books = modules.find((m) => m.moduleId === "books");
    expect(books?.policy.conversion.enabled).toBe(true);
    expect(books?.policy.conversion.target).toBe("epub-3.3");
  });

  it.skipIf(!dbAvailable)("updates books readAlong policy", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/processing/policies/books",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        readAlong: { enabled: true },
      },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.readAlong?.enabled).toBe(true);
  });

  it.skipIf(!dbAvailable)("rejects readAlong for non-books modules", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/processing/policies/movies",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        readAlong: { enabled: true },
      },
    });
    expect(patch.statusCode).toBe(422);
  });

  it.skipIf(!dbAvailable)("comics default has conversion disabled", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/processing/policies",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    const comics = res
      .json()
      .data.find((m: { moduleId: string }) => m.moduleId === "comics");
    if (comics) {
      expect(comics.policy.conversion.enabled).toBe(false);
      expect(comics.policy.conversion.target).toBeNull();
    } else {
      const defaults = createDefaultPolicy("comics");
      expect(defaults.conversion.enabled).toBe(false);
    }
  });

  it.skipIf(!dbAvailable)("returns template preview for a module", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/processing/policies/books/preview",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBeTruthy();
    expect(res.json().data.path).toBeTruthy();
  });
});
