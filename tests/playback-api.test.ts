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
import {
  registerMediaProcessor,
  clearMediaProcessors,
} from "../src/server/modules/playback/processors/registry.js";
import type { MediaDomainProcessor } from "../src/server/modules/playback/domain-processor.js";
import { runMediaProcess } from "../src/server/modules/jobs/handlers/media-process.js";

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

describe("Playback API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let representationId = "";
  let workId = generateId();

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-playback-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    ctx = built.ctx;
    pool = built.pool;

    const userId = generateId();
    await db
      .delete(schema.users)
      .where(eq(schema.users.email, "playback@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "playback@test.local",
      username: "playbackuser",
      displayName: "Playback",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await db.insert(schema.userRoles).values({ userId, roleId: memberRole.id });
    }

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "playback@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    workId = generateId();
    const expressionId = generateId();
    const manifestationId = generateId();
    representationId = generateId();
    const storageId = generateId();
    const fileId = generateId();

    await db.insert(schema.storageLocations).values({
      id: storageId,
      name: "Playback Test Storage",
      kind: "managed",
      rootPath: process.env.STORAGE_ROOT!,
    });
    await db.insert(schema.files).values({
      id: fileId,
      storageLocationId: storageId,
      relativePath: "sample-book.mp3",
      size: 4096,
      mediaType: "audio/mpeg",
    });
    await db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "audiobook",
      workId,
    });
    await db.insert(schema.creativeWorkManifestations).values({
      id: manifestationId,
      expressionId,
      label: "audio",
    });
    await db.insert(schema.representations).values({
      id: representationId,
      manifestationId,
      format: "audio",
      domainModule: "audiobooks",
    });
    await db.insert(schema.representationFiles).values({
      representationId,
      fileId,
      role: "content",
    });
    await db.insert(schema.libraryMemberships).values({
      userId,
      targetType: "audiobook",
      targetId: workId,
    });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("returns authorized manifest with server URLs", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/representations/${representationId}/playback`,
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.sources[0].url).toBe(
      `/api/v1/files/${body.data.sources[0].fileId}/content`,
    );
    expect(body.data.subject.type).toBe("audiobook");
  });

  it.skipIf(!dbAvailable)("denies manifest without library membership", async () => {
    const outsiderId = generateId();
    await ctx.db
      .delete(schema.users)
      .where(eq(schema.users.email, "playback-outsider@test.local"));
    await ctx.db.insert(schema.users).values({
      id: outsiderId,
      email: "playback-outsider@test.local",
      username: "playbackoutsider",
      displayName: "Outsider",
      passwordHash: await hash("password123"),
    });
    const memberRole = await ctx.db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await ctx.db.insert(schema.userRoles).values({
        userId: outsiderId,
        roleId: memberRole.id,
      });
    }
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "playback-outsider@test.local", password: "password123" },
    });
    const outsiderCookie = login.headers["set-cookie"]?.toString() ?? "";

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/representations/${representationId}/playback`,
      headers: { cookie: outsiderCookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("round-trips playback progress with last-write-wins", async () => {
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
        subjectId: workId,
        representationId,
        locator: {
          kind: "playback",
          positionSeconds: 45,
          durationSeconds: 100,
        },
      },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({
      method: "GET",
      url: `/api/v1/playback/progress?subjectType=audiobook&subjectId=${workId}`,
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(get.json().data.locator.positionSeconds).toBe(45);

    const overwrite = await app.inject({
      method: "PUT",
      url: "/api/v1/playback/progress",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        subjectType: "audiobook",
        subjectId: workId,
        representationId,
        locator: {
          kind: "playback",
          positionSeconds: 80,
          durationSeconds: 100,
        },
      },
    });
    expect(overwrite.statusCode).toBe(200);

    const latest = await app.inject({
      method: "GET",
      url: `/api/v1/playback/progress?subjectType=audiobook&subjectId=${workId}`,
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(latest.json().data.locator.positionSeconds).toBe(80);
  });

  it.skipIf(!dbAvailable)("stores completion and history events", async () => {
    await app.inject({
      method: "PUT",
      url: "/api/v1/playback/progress",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        subjectType: "audiobook",
        subjectId: workId,
        representationId,
        locator: {
          kind: "playback",
          positionSeconds: 100,
          durationSeconds: 100,
        },
      },
    });

    const progress = await app.inject({
      method: "GET",
      url: `/api/v1/playback/progress?subjectType=audiobook&subjectId=${workId}`,
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(progress.json().data.locator.completed).toBe(true);

    const history = await app.inject({
      method: "GET",
      url: "/api/v1/playback/history",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().data.length).toBeGreaterThan(0);
  });
});

describe("media.process registry", () => {
  it.skipIf(!dbAvailable)("fails explicitly when no processor is registered", async () => {
    clearMediaProcessors();
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const built = await buildApp();
    const jobId = generateId();
    await db.insert(schema.jobRuns).values({
      id: jobId,
      type: "media.process",
      taskKey: jobId,
      status: "queued",
      payload: { domain: "audiobooks" },
    });
    await runMediaProcess(built.ctx.jobs, db, {
      feyloreJobId: jobId,
      domain: "audiobooks",
    });
    const job = await built.ctx.jobs.getJob(jobId);
    expect(job?.status).toBe("failed");
    await pool.end();
  });

  it.skipIf(!dbAvailable)("completes when a processor is registered", async () => {
    clearMediaProcessors();
    const testProcessor: MediaDomainProcessor = {
      domain: "audiobooks",
      canProcess: (input) =>
        input.domain === "audiobooks" ||
        input.representationDomainModule === "audiobooks",
      process: async () => ({ logExcerpt: "Processed audiobook" }),
    };
    registerMediaProcessor(testProcessor);

    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const built = await buildApp();
    const jobId = generateId();
    await db.insert(schema.jobRuns).values({
      id: jobId,
      type: "media.process",
      taskKey: jobId,
      status: "queued",
      payload: { domain: "audiobooks" },
    });
    await runMediaProcess(built.ctx.jobs, db, {
      feyloreJobId: jobId,
      domain: "audiobooks",
    });
    const job = await built.ctx.jobs.getJob(jobId);
    expect(job?.status).toBe("completed");
    clearMediaProcessors();
    await pool.end();
  });
});
