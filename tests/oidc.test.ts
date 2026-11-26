import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq, inArray } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildApp } from "../src/server/http/app.js";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { AuthPolicyService } from "../src/server/modules/auth/auth-policy.js";
import { issuerBoundFetch } from "../src/server/modules/auth/oidc/issuer-fetch.js";
import { MockOidcServer } from "./helpers/mock-oidc-server.js";

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

describe("AuthPolicyService", () => {
  it("exposes recovery only when internal auth is disabled", () => {
    const policy = new AuthPolicyService(
      {
        internalEnabled: false,
        oidcEnabled: true,
        internalRecoveryEnabled: true,
      },
      {
        issuerUrl: "https://auth.example.com/",
        issuerOrigin: "https://auth.example.com",
        clientId: "feylore",
        scopes: ["openid"],
        autoProvision: false,
        allowPrivateIssuer: false,
        providerKey: "default",
        callbackUrl: "http://localhost:3000/api/v1/auth/oidc/callback",
      },
    );
    expect(policy.isInternalLoginEnabled()).toBe(false);
    expect(policy.isRecoveryLoginEnabled()).toBe(true);
    expect(policy.getMethodsResponse()).toEqual({
      internal: false,
      oidc: true,
      recovery: true,
      oidcLabel: undefined,
    });
  });

  it("does not expose recovery when internal auth is enabled", () => {
    const policy = new AuthPolicyService({
      internalEnabled: true,
      oidcEnabled: true,
      internalRecoveryEnabled: true,
    });
    expect(policy.isRecoveryLoginEnabled()).toBe(false);
    expect(policy.getMethodsResponse().recovery).toBe(false);
  });
});

describe("issuer-bound fetch", () => {
  it("rejects requests that escape the configured issuer origin", async () => {
    await expect(
      issuerBoundFetch("https://evil.example.com/token", {
        issuerOrigin: "https://auth.example.com",
        allowPrivateIssuer: false,
      }),
    ).rejects.toMatchObject({ code: "origin" });
  });
});

describe.skipIf(!dbAvailable)("OIDC authentication", () => {
  let mockIdp: MockOidcServer;
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let storageRoot = "";
  const clientId = "feylore-test";

  async function buildOidcApp(overrides: Record<string, string> = {}) {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = storageRoot;
    process.env.APP_URL = "http://localhost:5173";
    process.env.AUTH_INTERNAL_ENABLED = "true";
    process.env.AUTH_OIDC_ENABLED = "true";
    process.env.AUTH_INTERNAL_RECOVERY_ENABLED = "true";
    process.env.OIDC_ISSUER_URL = mockIdp.issuerUrl;
    process.env.OIDC_CLIENT_ID = clientId;
    process.env.OIDC_ALLOW_PRIVATE_ISSUER = "true";
    process.env.OIDC_AUTO_PROVISION = overrides.OIDC_AUTO_PROVISION ?? "true";
    for (const [key, value] of Object.entries(overrides)) {
      process.env[key] = value;
    }
    const built = await buildApp();
    app = built.app;
    pool = built.pool;
    await built.ctx.jobs.start();
    return built;
  }

  beforeAll(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-oidc-"));
    mockIdp = new MockOidcServer({ clientId });
    await mockIdp.start();

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);
    await pool.end();
  });

  afterAll(async () => {
    await mockIdp.stop();
    if (pool) await pool.end();
  });

  beforeEach(async () => {
    const cleanupPool = createPool(DATABASE_URL);
    const db = createDb(cleanupPool);
    const testEmails = [
      "oidc@test.local",
      "linked@test.local",
      "other@test.local",
      "recovery@test.local",
    ];
    const testUsers = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.email, testEmails));
    for (const row of testUsers) {
      await db
        .delete(schema.userOidcIdentities)
        .where(eq(schema.userOidcIdentities.userId, row.id));
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, row.id));
      await db
        .delete(schema.userRoles)
        .where(eq(schema.userRoles.userId, row.id));
      await db
        .delete(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, row.id));
      await db.delete(schema.users).where(eq(schema.users.id, row.id));
    }
    await db.delete(schema.oidcAuthStates);
    await cleanupPool.end();
  });

  it("completes authorization code flow and creates a session", async () => {
    await buildOidcApp();

    const loginRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/oidc/login",
    });
    expect(loginRes.statusCode).toBe(302);
    const idpLocation = loginRes.headers.location;
    expect(idpLocation).toContain("/authorize");

    const idpRes = await fetch(idpLocation!, { redirect: "manual" });
    expect(idpRes.status).toBe(302);
    const callbackUrl = idpRes.headers.get("location");
    expect(callbackUrl).toContain("/api/v1/auth/oidc/callback");

    const callbackRes = await app.inject({
      method: "GET",
      url: callbackUrl!.replace("http://localhost:5173", ""),
    });
    expect(callbackRes.statusCode).toBe(302);
    const cookie = callbackRes.headers["set-cookie"]?.toString() ?? "";
    expect(cookie).toContain("feylore_session");

    const meRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(200);
    const me = meRes.json() as { data: { user: { email: string } } };
    expect(me.data.user.email).toBe("oidc@test.local");
  });

  it("rejects login when auto-provision is disabled and no identity exists", async () => {
    await buildOidcApp({ OIDC_AUTO_PROVISION: "false" });

    const loginRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/oidc/login",
    });
    const idpRes = await fetch(loginRes.headers.location!, { redirect: "manual" });
    const callbackUrl = idpRes.headers.get("location")!;

    const callbackRes = await app.inject({
      method: "GET",
      url: callbackUrl.replace("http://localhost:5173", ""),
    });
    expect(callbackRes.statusCode).toBe(302);
    expect(callbackRes.headers.location).toContain("auth_error=");
  });

  it("links OIDC identity to an existing account", async () => {
    await buildOidcApp({ OIDC_AUTO_PROVISION: "false" });

    const db = createDb(createPool(DATABASE_URL));
    const userId = generateId();
    await db.insert(schema.users).values({
      id: userId,
      email: "linked@test.local",
      username: "linkeduser",
      displayName: "Linked User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "linked@test.local", password: "password123" },
    });
    const cookie = login.headers["set-cookie"]?.toString() ?? "";

    const linkRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/oidc/link",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(linkRes.statusCode).toBe(200);
    const linkUrl = (linkRes.json() as { data: { url: string } }).data.url;

    const idpRes = await fetch(linkUrl, { redirect: "manual" });
    const callbackUrl = idpRes.headers.get("location")!;
    const callbackRes = await app.inject({
      method: "GET",
      url: callbackUrl.replace("http://localhost:5173", ""),
      headers: { cookie },
    });
    expect(callbackRes.statusCode).toBe(302);

    const identities = await app.inject({
      method: "GET",
      url: "/api/v1/auth/identities",
      headers: { cookie },
    });
    const rows = (identities.json() as { data: unknown[] }).data;
    expect(rows).toHaveLength(1);
  });

  it("returns conflict when linking identity already owned by another user", async () => {
    await buildOidcApp({ OIDC_AUTO_PROVISION: "true" });

    const firstFlow = await app.inject({
      method: "GET",
      url: "/api/v1/auth/oidc/login",
    });
    const firstCallback = await fetch(firstFlow.headers.location!, {
      redirect: "manual",
    });
    await app.inject({
      method: "GET",
      url: firstCallback.headers.get("location")!.replace("http://localhost:5173", ""),
    });

    const db = createDb(createPool(DATABASE_URL));
    const otherId = generateId();
    await db.insert(schema.users).values({
      id: otherId,
      email: "other@test.local",
      username: "otheruser",
      displayName: "Other User",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: otherId });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "other@test.local", password: "password123" },
    });
    const cookie = login.headers["set-cookie"]?.toString() ?? "";

    const linkRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/oidc/link",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {},
    });
    const linkUrl = (linkRes.json() as { data: { url: string } }).data.url;
    const idpRes = await fetch(linkUrl, { redirect: "manual" });
    const callbackRes = await app.inject({
      method: "GET",
      url: idpRes.headers.get("location")!.replace("http://localhost:5173", ""),
      headers: { cookie },
    });
    expect(callbackRes.statusCode).toBe(302);
    expect(callbackRes.headers.location).toContain("auth_error=");
  });

  it("allows recovery password login when internal auth is disabled", async () => {
    await buildOidcApp({
      AUTH_INTERNAL_ENABLED: "false",
      AUTH_INTERNAL_RECOVERY_ENABLED: "true",
      OIDC_AUTO_PROVISION: "false",
    });

    const methods = await app.inject({
      method: "GET",
      url: "/api/v1/auth/methods",
    });
    const body = (methods.json() as { data: { internal: boolean; recovery: boolean } }).data;
    expect(body.internal).toBe(false);
    expect(body.recovery).toBe(true);

    const db = createDb(createPool(DATABASE_URL));
    const userId = generateId();
    await db.insert(schema.users).values({
      id: userId,
      email: "recovery@test.local",
      username: "recoveryuser",
      displayName: "Recovery User",
      passwordHash: await hash("password123"),
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "recovery@test.local", password: "password123" },
    });
    expect(login.statusCode).toBe(200);
  });

  it("allows OIDC-only user to set a local password when internal auth is enabled", async () => {
    await buildOidcApp();

    const loginRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/oidc/login",
    });
    const idpRes = await fetch(loginRes.headers.location!, { redirect: "manual" });
    const callbackRes = await app.inject({
      method: "GET",
      url: idpRes.headers.get("location")!.replace("http://localhost:5173", ""),
    });
    const cookie = callbackRes.headers["set-cookie"]?.toString() ?? "";

    const passwordRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { newPassword: "localpass123" },
    });
    expect(passwordRes.statusCode).toBe(200);

    const meRes = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie },
    });
    const me = meRes.json() as { data: { user: { hasPassword: boolean } } };
    expect(me.data.user.hasPassword).toBe(true);
  });
});
