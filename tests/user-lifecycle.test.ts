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
import {
  generateId,
  generateSessionToken,
  hashResetToken,
} from "../src/server/security/crypto.js";
import { AuthPolicyService } from "../src/server/modules/auth/auth-policy.js";
import { PasswordResetService } from "../src/server/modules/auth/password-reset.js";
import { AuthService } from "../src/server/modules/auth/service.js";
import { AuthorizationService } from "../src/server/modules/authorization/service.js";
import { DeviceService } from "../src/server/modules/downloads/service.js";
import { MailService } from "../src/server/modules/mail/service.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://feylore:feylore@localhost:5432/feylore_test";

const SESSION_SECRET = "test-session-secret-min-16-chars";

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

describe("AuthPolicyService password reset", () => {
  const policy = new AuthPolicyService({
    internalEnabled: true,
    oidcEnabled: true,
    internalRecoveryEnabled: true,
  });

  it("gates password reset on SMTP availability", () => {
    expect(policy.isPasswordResetAvailable(false)).toBe(false);
    expect(policy.isPasswordResetAvailable(true)).toBe(true);
  });

  it("allows reset request for users with passwords", () => {
    expect(policy.canRequestPasswordReset({ passwordHash: "x" })).toBe(true);
    expect(policy.canRequestPasswordReset({ passwordHash: null })).toBe(false);
  });

  it("delegates establish-password to canSetPassword for OIDC-only users", () => {
    expect(
      policy.canPasswordResetEstablishPassword({ passwordHash: null }),
    ).toBe(true);
    expect(
      policy.canPasswordResetEstablishPassword({ passwordHash: "x" }),
    ).toBe(false);
  });
});

describe("User lifecycle API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let userId = "";
  let otherUserId = "";
  let deviceId = "";
  let otherDeviceId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-user-lifecycle-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    userId = generateId();
    otherUserId = generateId();
    deviceId = generateId();
    otherDeviceId = generateId();

    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "lifecycle@test.local"));
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "lifecycle-other@test.local"));

    await db.insert(schema.users).values({
      id: userId,
      email: "lifecycle@test.local",
      username: "lifecycleuser",
      displayName: "Lifecycle User",
      passwordHash: await hash("password123"),
      theme: "dark",
    });
    await db.insert(schema.userPreferences).values({
      userId,
      privacyActivity: "private",
    });

    await db.insert(schema.users).values({
      id: otherUserId,
      email: "lifecycle-other@test.local",
      username: "lifecycleother",
      displayName: "Other User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: otherUserId });

    await db.insert(schema.devices).values({
      id: deviceId,
      userId,
      name: "Test Device",
    });
    await db.insert(schema.devices).values({
      id: otherDeviceId,
      userId: otherUserId,
      name: "Other Device",
    });

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
      payload: {
        email: "lifecycle@test.local",
        password: "password123",
        deviceId,
      },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("round-trips appearance settings", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/appearance",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { theme: "light" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.theme).toBe("light");

    const get = await app.inject({
      method: "GET",
      url: "/api/v1/settings/appearance",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(get.json().data.theme).toBe("light");
  });

  it.skipIf(!dbAvailable)("round-trips privacy settings", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/privacy",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { activityVisibility: "public" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.activityVisibility).toBe("public");
  });

  it.skipIf(!dbAvailable)("links session to owned device on login", async () => {
    const db = createDb(pool);
    const sessions = await db.query.sessions.findMany({
      where: eq(schema.sessions.userId, userId),
    });
    const linked = sessions.find((s) => s.deviceId === deviceId);
    expect(linked).toBeTruthy();
  });

  it.skipIf(!dbAvailable)("ignores foreign device id on login", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        email: "lifecycle@test.local",
        password: "password123",
        deviceId: otherDeviceId,
      },
    });
    expect(login.statusCode).toBe(200);
    const token = login.headers["set-cookie"]?.toString() ?? "";
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/sessions",
      headers: { cookie: token, origin: "http://localhost:5173" },
    });
    const foreignSession = me
      .json()
      .data.find((s: { deviceId: string | null }) => s.deviceId === otherDeviceId);
    expect(foreignSession).toBeUndefined();
  });

  it.skipIf(!dbAvailable)("lists and revokes sessions for current user only", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/auth/sessions",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.length).toBeGreaterThan(0);
    expect(list.json().data.some((s: { isCurrent: boolean }) => s.isCurrent)).toBe(
      true,
    );

    const other = list.json().data.find((s: { isCurrent: boolean }) => !s.isCurrent);
    if (!other) return;

    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/auth/sessions/${other.id}`,
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(revoke.statusCode).toBe(200);
  });
});

describe("PasswordResetService", () => {
  it.skipIf(!dbAvailable)("confirms reset, updates password, and revokes sessions", async () => {
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });

    const userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "reset@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "reset@test.local",
      username: "resetuser",
      displayName: "Reset User",
      passwordHash: await hash("oldpassword1"),
    });

    const authz = new AuthorizationService(db);
    const devices = new DeviceService(db);
    const auth = new AuthService(db, SESSION_SECRET, authz, devices);
    const authPolicy = new AuthPolicyService({
      internalEnabled: true,
      oidcEnabled: false,
      internalRecoveryEnabled: true,
    });
    const mail = {
      isConfigured: () => true,
      sendPasswordResetEmail: async () => {},
    } satisfies Pick<MailService, "isConfigured" | "sendPasswordResetEmail">;

    const service = new PasswordResetService(
      db,
      SESSION_SECRET,
      "http://localhost:5173",
      auth,
      authPolicy,
      mail as unknown as MailService,
    );

    await auth.createSession(userId, { userAgent: "test" });

    const token = generateSessionToken();
    await db.insert(schema.passwordResetTokens).values({
      id: generateId(),
      userId,
      tokenHash: hashResetToken(token, SESSION_SECRET),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await service.confirmReset(token, "newpassword9");

    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    expect(await verify(user!.passwordHash!, "newpassword9")).toBe(true);

    const sessions = await db.query.sessions.findMany({
      where: eq(schema.sessions.userId, userId),
    });
    expect(sessions).toHaveLength(0);

    await pool.end();
  });
});
