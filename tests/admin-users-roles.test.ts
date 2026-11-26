import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/server/http/app.js";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { PERMISSIONS, ROLE_NAMES } from "../src/shared/permissions.js";

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

const originHeaders = {
  origin: "http://localhost:5173",
  "content-type": "application/json",
};

function testUsername(prefix: string): string {
  return `${prefix}${generateId().slice(0, 10)}`;
}

describe("admin users and roles", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let adminCookie = "";
  let memberCookie = "";
  let adminId = "";
  let memberId = "";

  beforeAll(async () => {
    if (!dbAvailable) return;

    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";

    const setupPool = createPool(DATABASE_URL);
    const db = createDb(setupPool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);
    await setupPool.end();

    const built = await buildApp();
    app = built.app;
    ctx = built.ctx;
    pool = built.pool;
    await ctx.jobs.start();

    const db2 = createDb(pool);

    adminId = generateId();
    await db2.delete(schema.users).where(eq(schema.users.email, "admin-users@test.local"));
    await db2.insert(schema.users).values({
      id: adminId,
      email: "admin-users@test.local",
      username: "adminusers",
      displayName: "Admin Users",
      passwordHash: await hash("password123"),
    });
    const adminRole = await db2.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db2.insert(schema.userRoles).values({ userId: adminId, roleId: adminRole.id });
    }

    memberId = generateId();
    await db2.delete(schema.users).where(eq(schema.users.email, "member-users@test.local"));
    await db2.insert(schema.users).values({
      id: memberId,
      email: "member-users@test.local",
      username: "memberusers",
      displayName: "Member Users",
      passwordHash: await hash("password123"),
    });
    const memberRole = await db2.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await db2.insert(schema.userRoles).values({ userId: memberId, roleId: memberRole.id });
    }

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: originHeaders,
      payload: { email: "admin-users@test.local", password: "password123" },
    });
    adminCookie = adminLogin.headers["set-cookie"]?.toString() ?? "";

    const memberLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: originHeaders,
      payload: { email: "member-users@test.local", password: "password123" },
    });
    memberCookie = memberLogin.headers["set-cookie"]?.toString() ?? "";
  }, 60000);

  afterAll(async () => {
    if (!dbAvailable) return;
    const db2 = createDb(pool);
    const adminRole = await db2.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db2.delete(schema.userRoles).where(eq(schema.userRoles.userId, adminId));
      await db2.insert(schema.userRoles).values({ userId: adminId, roleId: adminRole.id });
    }
    if (ctx) await ctx.jobs.stop();
    await app?.close();
  });

  it.skipIf(!dbAvailable)("member cannot list users", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("admin can list and create users", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { cookie: adminCookie },
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json();
    expect(Array.isArray(listBody.data)).toBe(true);

    const email = `newuser-${generateId()}@test.local`;
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { ...originHeaders, cookie: adminCookie },
      payload: {
        email,
        username: testUsername("user"),
        displayName: "New User",
        password: "password123",
        roleNames: ["member"],
      },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json().data;
    expect(created.id).toBeTruthy();

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/users/${created.id}`,
      headers: { cookie: adminCookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.email).toBe(email);
  });

  it.skipIf(!dbAvailable)("role assignment requires users.roles.assign", async () => {
    const email = `norole-${generateId()}@test.local`;
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { ...originHeaders, cookie: adminCookie },
      payload: {
        email,
        username: testUsername("cur"),
        displayName: "Curator User",
        password: "password123",
        roleNames: ["curator"],
      },
    });
    expect(create.statusCode).toBe(200);

    const userId = create.json().data.id as string;
    const rolesRes = await app.inject({
      method: "PUT",
      url: `/api/v1/users/${userId}/roles`,
      headers: { ...originHeaders, cookie: memberCookie },
      payload: { roleNames: ["member"] },
    });
    expect(rolesRes.statusCode).toBe(403);

    await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${userId}`,
      headers: { ...originHeaders, cookie: adminCookie },
      payload: { confirm: true },
    });
  });

  it.skipIf(!dbAvailable)("disable blocks login and invalidates session", async () => {
    const email = `disable-${generateId()}@test.local`;
    const username = testUsername("dis");
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { ...originHeaders, cookie: adminCookie },
      payload: {
        email,
        username,
        displayName: "Disable Me",
        password: "password123",
      },
    });
    expect(create.statusCode).toBe(200);
    const userId = create.json().data.id as string;

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: originHeaders,
      payload: { email, password: "password123" },
    });
    expect(login.statusCode).toBe(200);
    const userCookie = login.headers["set-cookie"]?.toString() ?? "";

    const meBefore = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: userCookie },
    });
    expect(meBefore.statusCode).toBe(200);

    const disable = await app.inject({
      method: "POST",
      url: `/api/v1/users/${userId}/disable`,
      headers: { ...originHeaders, cookie: adminCookie },
      payload: { disabled: true },
    });
    expect(disable.statusCode).toBe(200);

    const meAfter = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: userCookie },
    });
    expect(meAfter.json().data.user).toBeNull();

    const loginAgain = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: originHeaders,
      payload: { email, password: "password123" },
    });
    expect(loginAgain.statusCode).toBe(401);
  });

  it.skipIf(!dbAvailable)("cannot disable or delete self", async () => {
    const disableSelf = await app.inject({
      method: "POST",
      url: `/api/v1/users/${adminId}/disable`,
      headers: { ...originHeaders, cookie: adminCookie },
      payload: { disabled: true },
    });
    expect(disableSelf.statusCode).toBe(403);

    const deleteSelf = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${adminId}`,
      headers: { ...originHeaders, cookie: adminCookie },
      payload: { confirm: true },
    });
    expect(deleteSelf.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("cannot delete last admin", async () => {
    const email = `solo-admin-${generateId()}@test.local`;
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { ...originHeaders, cookie: adminCookie },
      payload: {
        email,
        username: testUsername("solo"),
        displayName: "Solo Admin",
        password: "password123",
        roleNames: ["member"],
      },
    });
    expect(create.statusCode).toBe(200);
    const soloAdminId = create.json().data.id as string;

    const promote = await app.inject({
      method: "PUT",
      url: `/api/v1/users/${soloAdminId}/roles`,
      headers: { ...originHeaders, cookie: adminCookie },
      payload: { roleNames: ["admin"] },
    });
    expect(promote.statusCode).toBe(200);

    const demoteTestAdmin = await app.inject({
      method: "PUT",
      url: `/api/v1/users/${adminId}/roles`,
      headers: { ...originHeaders, cookie: adminCookie },
      payload: { roleNames: ["member"] },
    });
    expect(demoteTestAdmin.statusCode).toBe(200);

    try {
      const deleteLast = await app.inject({
        method: "DELETE",
        url: `/api/v1/users/${soloAdminId}`,
        headers: { ...originHeaders, cookie: adminCookie },
        payload: { confirm: true },
      });
      expect(deleteLast.statusCode).toBe(403);
    } finally {
      const db2 = createDb(pool);
      const adminRole = await db2.query.roles.findFirst({
        where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
      });
      if (adminRole) {
        await db2
          .delete(schema.userRoles)
          .where(eq(schema.userRoles.userId, adminId));
        await db2
          .insert(schema.userRoles)
          .values({ userId: adminId, roleId: adminRole.id });
      }
      await app.inject({
        method: "DELETE",
        url: `/api/v1/users/${soloAdminId}`,
        headers: { ...originHeaders, cookie: adminCookie },
        payload: { confirm: true },
      });
    }
  });

  it.skipIf(!dbAvailable)("role permission update affects grants on next request", async () => {
    const email = `curator-perms-${generateId()}@test.local`;
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { ...originHeaders, cookie: adminCookie },
      payload: {
        email,
        username: testUsername("cperm"),
        displayName: "Curator Test",
        password: "password123",
        roleNames: ["curator"],
      },
    });
    expect(create.statusCode).toBe(200);
    const userId = create.json().data.id as string;

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: originHeaders,
      payload: { email, password: "password123" },
    });
    const curatorCookie = login.headers["set-cookie"]?.toString() ?? "";

    const meBefore = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: curatorCookie },
    });
    expect(meBefore.json().data.user.permissions).toContain(
      PERMISSIONS.LIBRARIES_READ,
    );

    const curatorRole = await app.inject({
      method: "GET",
      url: `/api/v1/roles/${ROLE_NAMES.CURATOR}`,
      headers: { cookie: adminCookie },
    });
    const currentPerms = curatorRole.json().data.permissions as string[];
    const withoutLibraries = currentPerms.filter(
      (p) => p !== PERMISSIONS.LIBRARIES_READ,
    );

    const update = await app.inject({
      method: "PUT",
      url: `/api/v1/roles/${ROLE_NAMES.CURATOR}/permissions`,
      headers: { ...originHeaders, cookie: adminCookie },
      payload: { permissions: withoutLibraries },
    });
    expect(update.statusCode).toBe(200);

    const meAfter = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: curatorCookie },
    });
    expect(meAfter.json().data.user.permissions).not.toContain(
      PERMISSIONS.LIBRARIES_READ,
    );

    await app.inject({
      method: "PUT",
      url: `/api/v1/roles/${ROLE_NAMES.CURATOR}/permissions`,
      headers: { ...originHeaders, cookie: adminCookie },
      payload: { permissions: currentPerms },
    });

    await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${userId}`,
      headers: { ...originHeaders, cookie: adminCookie },
      payload: { confirm: true },
    });
  });

  it.skipIf(!dbAvailable)("admin role permissions cannot be modified", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/roles/${ROLE_NAMES.ADMIN}/permissions`,
      headers: { ...originHeaders, cookie: adminCookie },
      payload: { permissions: [PERMISSIONS.USERS_READ] },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("GET roles includes permission keys", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/roles",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const roles = res.json().data as { name: string; permissions: string[] }[];
    const admin = roles.find((r) => r.name === ROLE_NAMES.ADMIN);
    expect(admin?.permissions.length).toBeGreaterThan(0);
    expect(admin?.permissions).toContain(PERMISSIONS.USERS_WRITE);
  });
});
