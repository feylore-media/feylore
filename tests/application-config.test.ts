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
import { ApplicationConfigService } from "../src/server/modules/settings/application-config-service.js";
import { FileService } from "../src/server/modules/files/service.js";
import { StorageService } from "../src/server/modules/storage/adapter.js";
import { FileReferenceRegistry } from "../src/server/modules/files/service.js";
import {
  DEFAULT_APPLICATION_CONFIG,
  DEFAULT_APPLICATION_GENERAL,
} from "../src/shared/application-config.js";

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

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("ApplicationConfigService", () => {
  const pool = createPool(DATABASE_URL);
  const db = createDb(pool);
  const storage = new StorageService();
  const files = new FileService(db, storage, new FileReferenceRegistry());
  const service = new ApplicationConfigService(db, files);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db
      .delete(schema.systemSettings)
      .where(eq(schema.systemSettings.key, "application"));
  });

  afterAll(async () => {
    await pool.end();
  });

  it.skipIf(!dbAvailable)("returns defaults when unset", async () => {
    const config = await service.getConfig();
    expect(config).toEqual(DEFAULT_APPLICATION_CONFIG);
  });

  it.skipIf(!dbAvailable)("persists and partially updates general settings", async () => {
    await service.updateGeneral({
      displayName: "My Library",
      defaultLocale: "fr",
    });
    const config = await service.getConfig();
    expect(config.general.displayName).toBe("My Library");
    expect(config.general.defaultLocale).toBe("fr");
    expect(config.general.defaultTheme).toBe(DEFAULT_APPLICATION_GENERAL.defaultTheme);

    await service.updateGeneral({ defaultTheme: "light" });
    const updated = await service.getConfig();
    expect(updated.general.defaultTheme).toBe("light");
  });

  it.skipIf(!dbAvailable)("public projection excludes file IDs", async () => {
    const pub = await service.getPublicConfig();
    expect(pub).toEqual({
      displayName: "My Library",
      defaultLocale: "fr",
      defaultTheme: "light",
      logoUrl: null,
      faviconUrl: null,
      profiles: { customCssEnabled: false },
    });
    expect(pub).not.toHaveProperty("logoFileId");
    expect(pub).not.toHaveProperty("faviconFileId");
  });

  it.skipIf(!dbAvailable)("profile policy defaults to closed and round-trips a toggle", async () => {
    expect(service.getProfiles(await service.getConfig())).toEqual({
      customCssEnabled: false,
    });
    await service.updateProfiles({ customCssEnabled: true });
    expect(service.getProfiles(await service.getConfig())).toEqual({
      customCssEnabled: true,
    });
    await service.updateProfiles({ customCssEnabled: false });
  });

  it.skipIf(!dbAvailable)("rejects invalid logo uploads", async () => {
    await expect(
      service.uploadLogo(Buffer.from("not an image"), "image/png"),
    ).rejects.toThrow("Logo must be a JPEG, PNG, or WebP image");
  });

  it.skipIf(!dbAvailable)("rejects oversized favicon uploads", async () => {
    const huge = Buffer.alloc(600 * 1024, 0x89);
    huge[1] = 0x50;
    huge[2] = 0x4e;
    huge[3] = 0x47;
    await expect(
      service.uploadFavicon(huge, "image/png"),
    ).rejects.toThrow("Favicon exceeds size limit");
  });
});

describe("Application config API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let adminCookie = "";
  let memberCookie = "";
  let existingUserId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-app-config-api-"),
    );

    pool = createPool(DATABASE_URL);
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    await db
      .delete(schema.systemSettings)
      .where(eq(schema.systemSettings.key, "application"));

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const adminId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "app-config-admin@test.local"));
    await db.insert(schema.users).values({
      id: adminId,
      email: "app-config-admin@test.local",
      username: "appconfigadmin",
      displayName: "App Config Admin",
      passwordHash: await hash("password123"),
      locale: "en-GB",
      theme: "light",
    });
    await db.insert(schema.userPreferences).values({ userId: adminId });

    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db
        .insert(schema.userRoles)
        .values({ userId: adminId, roleId: adminRole.id });
    }

    const memberId = generateId();
    existingUserId = memberId;
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "app-config-member@test.local"));
    await db.insert(schema.users).values({
      id: memberId,
      email: "app-config-member@test.local",
      username: "appconfigmember",
      displayName: "App Config Member",
      passwordHash: await hash("password123"),
      locale: "en-GB",
      theme: "light",
    });
    await db.insert(schema.userPreferences).values({ userId: memberId });

    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await db
        .insert(schema.userRoles)
        .values({ userId: memberId, roleId: memberRole.id });
    }

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "app-config-admin@test.local", password: "password123" },
    });
    adminCookie = adminLogin.headers["set-cookie"]?.toString() ?? "";

    const memberLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "app-config-member@test.local", password: "password123" },
    });
    memberCookie = memberLogin.headers["set-cookie"]?.toString() ?? "";
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("allows public instance read without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/instance",
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.displayName).toBe("Feylore");
    expect(data).not.toHaveProperty("logoFileId");
    expect(data.profiles).toEqual({ customCssEnabled: false });
  });

  it.skipIf(!dbAvailable)("requires auth for admin configuration read", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/system/configuration",
    });
    expect(res.statusCode).toBe(401);
  });

  it.skipIf(!dbAvailable)("forbids non-admin configuration write", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/system/configuration",
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { displayName: "Hacked" },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("allows admin configuration write", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/system/configuration",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        displayName: "Test Instance",
        defaultLocale: "de",
        defaultTheme: "system",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.displayName).toBe("Test Instance");

    const pub = await app.inject({ method: "GET", url: "/api/v1/instance" });
    expect(pub.json().data.displayName).toBe("Test Instance");
  });

  it.skipIf(!dbAvailable)("does not change existing user locale when defaults change", async () => {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, existingUserId),
    });
    expect(user?.locale).toBe("en-GB");
    expect(user?.theme).toBe("light");
  });

  it.skipIf(!dbAvailable)("uploads logo and serves it publicly", async () => {
    const boundary = "----feylore-test-boundary";
    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`,
      "utf8",
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const body = Buffer.concat([prefix, PNG_1X1, suffix]);

    const upload = await app.inject({
      method: "POST",
      url: "/api/v1/admin/system/appearance/logo",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().data.logoUrl).toBe("/api/v1/instance/logo");

    const logo = await app.inject({
      method: "GET",
      url: "/api/v1/instance/logo",
    });
    expect(logo.statusCode).toBe(200);
    expect(logo.headers["content-type"]).toContain("image/png");
  });

  it.skipIf(!dbAvailable)("forbids non-admin profile policy write", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/system/profiles",
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { customCssEnabled: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("admin reads and toggles the profile CSS policy", async () => {
    const read = await app.inject({
      method: "GET",
      url: "/api/v1/admin/system/profiles",
      headers: { cookie: adminCookie },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data).toEqual({ customCssEnabled: false });

    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/system/profiles",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { customCssEnabled: true },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data).toEqual({ customCssEnabled: true });

    const pub = await app.inject({ method: "GET", url: "/api/v1/instance" });
    expect(pub.json().data.profiles).toEqual({ customCssEnabled: true });

    // Restore the default so a reused test DB starts clean on the next run.
    await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/system/profiles",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { customCssEnabled: false },
    });
  });
});
