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

describe("Audiobook playback progress", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let audiobookId = "";
  let audiobookSlug = "";
  let representationId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-ab-progress-"),
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
      .where(eq(schema.users.email, "ab-progress@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "ab-progress@test.local",
      username: "abprogress",
      displayName: "AB Progress",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });
    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db.insert(schema.userRoles).values({ userId, roleId: adminRole.id });
    }

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "ab-progress@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/audiobooks",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Progress Test Audiobook" },
    });
    audiobookId = create.json().data.id;
    audiobookSlug = create.json().data.slug;

    const storageId = generateId();
    const fileId = generateId();
    representationId = generateId();
    const expressionId = generateId();
    const manifestationId = generateId();

    await db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Progress Storage",
      kind: "managed",
      rootPath: process.env.STORAGE_ROOT!,
    });
    await fs.writeFile(
      path.join(process.env.STORAGE_ROOT!, "progress.mp3"),
      "audio",
    );
    await db.insert(schema.files).values({
      id: fileId,
      storageLocationId: storageId,
      relativePath: "progress.mp3",
      size: 5,
      mediaType: "audio/mpeg",
    });
    await db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "audiobook",
      workId: audiobookId,
    });
    await db.insert(schema.creativeWorkManifestations).values({
      id: manifestationId,
      expressionId,
    });
    await db.insert(schema.representations).values({
      id: representationId,
      manifestationId,
      format: "mp3",
      domainModule: "audiobooks",
    });
    await db.insert(schema.representationFiles).values({
      representationId,
      fileId,
      role: "content",
      sortOrder: 0,
    });
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("manifest is available for audiobook representation", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/representations/${representationId}/playback`,
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.subject.type).toBe("audiobook");
    expect(res.json().data.subject.id).toBe(audiobookId);
  });

  it.skipIf(!dbAvailable)("round-trips playback progress and surfaces on detail", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/api/v1/playback/progress",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        subjectType: "audiobook",
        subjectId: audiobookId,
        representationId,
        locator: {
          kind: "playback",
          positionSeconds: 55,
          durationSeconds: 200,
        },
      },
    });
    expect(put.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/audiobooks/${audiobookSlug}`,
      headers: { cookie },
    });
    expect(detail.json().data.userState.progress?.positionSeconds).toBe(55);
    expect(detail.json().data.userState.progressRepresentationId).toBe(
      representationId,
    );

    const history = await app.inject({
      method: "GET",
      url: `/api/v1/audiobooks/${audiobookSlug}/history`,
      headers: { cookie },
    });
    expect(history.statusCode).toBe(200);
  });

  it.skipIf(!dbAvailable)("continue view includes audiobook with progress", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audiobooks?view=continue",
      headers: { cookie },
    });
    expect(
      res.json().data.some((b: { id: string }) => b.id === audiobookId),
    ).toBe(true);
  });
});
