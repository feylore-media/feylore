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
import { PERMISSIONS, ROLE_NAMES } from "../src/shared/permissions.js";
import { MetadataProviderRegistry } from "../src/server/modules/metadata/registry.js";
import { MetadataService } from "../src/server/modules/metadata/service.js";
import { stubProvider } from "../src/providers/stub/provider.js";

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

describe("Feylore foundation integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let adminCookie = "";
  let memberCookie = "";
  let storageRoot = "";
  let storageId = "";
  let fileA = "";
  let fileB = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-test-"));
    process.env.STORAGE_ROOT = storageRoot;

    try {
      pool = createPool(DATABASE_URL);
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: "./drizzle" });
      await seed(db);
    } catch {
      console.warn(
        "PostgreSQL unavailable — skipping integration tests. Run: docker compose -f docker-compose.dev.yml up -d",
      );
      return;
    }

    const built = await buildApp();
    app = built.app;
    ctx = built.ctx;
    pool = built.pool;
    await ctx.jobs.start();

    const db2 = createDb(pool);

    const adminId = generateId();
    await db2.delete(schema.users).where(eq(schema.users.email, "admin@test.local"));
    await db2.insert(schema.users).values({
      id: adminId,
      email: "admin@test.local",
      username: "admin",
      displayName: "Admin",
      passwordHash: await hash("password123"),
    });
    const adminRole = await db2.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db2
        .insert(schema.userRoles)
        .values({ userId: adminId, roleId: adminRole.id });
    }

    const memberId = generateId();
    await db2.delete(schema.users).where(eq(schema.users.email, "member@test.local"));
    await db2.insert(schema.users).values({
      id: memberId,
      email: "member@test.local",
      username: "member",
      displayName: "Member",
      passwordHash: await hash("password123"),
    });
    const memberRole = await db2.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await db2
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
      payload: { email: "admin@test.local", password: "password123" },
    });
    adminCookie = adminLogin.headers["set-cookie"]?.toString() ?? "";

    const memberLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "member@test.local", password: "password123" },
    });
    memberCookie = memberLogin.headers["set-cookie"]?.toString() ?? "";

    storageId = generateId();
    await db2.insert(schema.storageLocations).values({
      id: storageId,
      name: "Test",
      kind: "managed",
      rootPath: storageRoot,
    });
    await fs.writeFile(path.join(storageRoot, "a.txt"), "file a content");
    await fs.writeFile(path.join(storageRoot, "b.txt"), "file b content");

    fileA = generateId();
    fileB = generateId();
    await db2.insert(schema.files).values([
      {
        id: fileA,
        storageLocationId: storageId,
        relativePath: "a.txt",
        size: 14,
        mediaType: "text/plain",
        checksum: "aaa",
      },
      {
        id: fileB,
        storageLocationId: storageId,
        relativePath: "b.txt",
        size: 14,
        mediaType: "text/plain",
        checksum: "aaa",
      },
    ]);
  }, 60000);

  afterAll(async () => {
    if (!dbAvailable) return;
    if (ctx) await ctx.jobs.stop();
    await app?.close();
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it.skipIf(!dbAvailable)("rejects unauthorized file access", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/files/${fileA}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it.skipIf(!dbAvailable)(
    "allows authorized file metadata without path leakage",
    async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/files/${fileA}`,
        headers: { cookie: memberCookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.json())).not.toContain(storageRoot);
    },
  );

  it.skipIf(!dbAvailable)("member cannot publish public shelf", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/shelves",
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Public",
        scope: "global",
        visibility: "shared",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)(
    "metadata refresh skips overrides and preserves ratings",
    async () => {
      const registry = new MetadataProviderRegistry();
      registry.register({
        key: "stub",
        contractVersion: stubProvider.contractVersion,
        provider: stubProvider,
      });
      const db = createDb(pool);
      const metadata = new MetadataService(db, registry, "test-secret-key-16chars");
      const subjectId = generateId();

      await metadata.upsertProvider({
        key: "stub",
        contractVersion: "feylore.metadata.provider.v1",
        enabled: true,
      });
      await metadata.setOverride({
        subjectType: "test",
        subjectId,
        field: "title",
        value: "User title",
        userId: (await db.query.users.findFirst())!.id,
      });
      await metadata.refreshMetadata("test", subjectId, {});
      expect((await metadata.getOverrides("test", subjectId))[0]?.value).toBe(
        "User title",
      );

      const memberUser = await db.query.users.findFirst({
        where: eq(schema.users.email, "member@test.local"),
      });
      await db.insert(schema.userRatings).values({
        userId: memberUser!.id,
        subjectType: "test",
        subjectId,
        rating: 5,
      });
      await metadata.refreshMetadata("test", subjectId, {});
      const rating = await db.query.userRatings.findFirst({
        where: eq(schema.userRatings.subjectId, subjectId),
      });
      expect(rating?.rating).toBe(5);
    },
  );

  it.skipIf(!dbAvailable)("disabled providers are not invoked", async () => {
    const registry = new MetadataProviderRegistry();
    let called = false;
    registry.register({
      key: "disabled-test",
      contractVersion: stubProvider.contractVersion,
      provider: {
        ...stubProvider,
        key: "disabled-test",
        async fetch() {
          called = true;
          return { payload: {} };
        },
      },
    });
    const db = createDb(pool);
    const metadata = new MetadataService(db, registry, "test-secret-key-16chars");
    await metadata.upsertProvider({
      key: "disabled-test",
      contractVersion: "feylore.metadata.provider.v1",
      enabled: false,
    });
    await metadata.refreshMetadata("test", generateId(), {});
    expect(called).toBe(false);
  });

  it.skipIf(!dbAvailable)("metadata APIs do not return secrets", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/v1/metadata/providers/secret-test",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { enabled: true, config: { apiKey: "super-secret" } },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/metadata/providers",
      headers: { cookie: adminCookie, origin: "http://localhost:5173" },
    });
    expect(JSON.stringify(res.json())).not.toContain("super-secret");
  });

  it.skipIf(!dbAvailable)(
    "download removal does not delete source file",
    async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/downloads",
        headers: {
          cookie: memberCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { fileId: fileA },
      });
      const downloadId = createRes.json().data.id;
      await app.inject({
        method: "DELETE",
        url: `/api/v1/downloads/${downloadId}`,
        headers: { cookie: memberCookie, origin: "http://localhost:5173" },
      });
      const fileRes = await app.inject({
        method: "GET",
        url: `/api/v1/files/${fileA}`,
        headers: { cookie: memberCookie, origin: "http://localhost:5173" },
      });
      expect(fileRes.statusCode).toBe(200);
    },
  );

  it.skipIf(!dbAvailable)("job cancel is distinct from failed", async () => {
    const db = createDb(pool);
    const jobId = generateId();
    await db
      .insert(schema.jobRuns)
      .values({ id: jobId, type: "library.scan", taskKey: jobId, status: "queued" });
    const cancelRes = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${jobId}/cancel`,
      headers: { cookie: adminCookie, origin: "http://localhost:5173" },
    });
    expect(cancelRes.json().data.cancelled).toBe(true);
    const job = await db.query.jobRuns.findFirst({
      where: eq(schema.jobRuns.id, jobId),
    });
    expect(job?.status).toBe("cancelled");
  });

  it.skipIf(!dbAvailable)(
    "member can read own job status but not others",
    async () => {
      const db = createDb(pool);
      const memberMe = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { cookie: memberCookie, origin: "http://localhost:5173" },
      });
      const memberId = memberMe.json().data.user.id as string;

      const ownJobId = generateId();
      await db.insert(schema.jobRuns).values({
        id: ownJobId,
        type: "library.associate",
        taskKey: ownJobId,
        status: "completed",
        payload: { userId: memberId, fileIds: [] },
      });

      const ownRes = await app.inject({
        method: "GET",
        url: `/api/v1/jobs/${ownJobId}`,
        headers: { cookie: memberCookie, origin: "http://localhost:5173" },
      });
      expect(ownRes.statusCode).toBe(200);
      expect(ownRes.json().data.status).toBe("completed");

      const otherJobId = generateId();
      await db.insert(schema.jobRuns).values({
        id: otherJobId,
        type: "library.associate",
        taskKey: otherJobId,
        status: "completed",
        payload: { userId: generateId(), fileIds: [] },
      });

      const otherRes = await app.inject({
        method: "GET",
        url: `/api/v1/jobs/${otherJobId}`,
        headers: { cookie: memberCookie, origin: "http://localhost:5173" },
      });
      expect(otherRes.statusCode).toBe(403);
    },
  );

  it.skipIf(!dbAvailable || process.env.NODE_ENV !== "production")(
    "rejects CSRF without origin",
    async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/shelves",
        headers: { cookie: memberCookie, "content-type": "application/json" },
        payload: { name: "Test", kind: "basic", visibility: "private" },
      });
      expect(res.statusCode).toBe(403);
    },
  );

  it.skipIf(!dbAvailable)(
    "authorization uses permissions not role names",
    async () => {
      const adminMe = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { cookie: adminCookie, origin: "http://localhost:5173" },
      });
      expect(adminMe.json().data.user.permissions).toContain(
        PERMISSIONS.USERS_READ,
      );
      const memberMe = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { cookie: memberCookie, origin: "http://localhost:5173" },
      });
      expect(memberMe.json().data.user.permissions).not.toContain(
        PERMISSIONS.USERS_READ,
      );
    },
  );

  it.skipIf(!dbAvailable)(
    "file delete does not remove unrelated file",
    async () => {
      const { FileService, FileReferenceRegistry } =
        await import("../src/server/modules/files/service.js");
      const { StorageService } =
        await import("../src/server/modules/storage/adapter.js");
      const db = createDb(pool);
      const storage = new StorageService();
      storage.register({
        id: storageId,
        name: "t",
        kind: "managed",
        rootPath: storageRoot,
      });
      const files = new FileService(db, storage, new FileReferenceRegistry());
      await files.deleteFile(fileA);
      const remaining = await db.query.files.findFirst({
        where: eq(schema.files.id, fileB),
      });
      expect(remaining).toBeTruthy();
    },
  );
});
