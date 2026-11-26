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

describe.skipIf(!dbAvailable)("Admin storage and jobs APIs", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let cookie = "";
  let storageLocationId = "";
  let ingestRootId = "";

  async function insertJobRun(values: {
    type: string;
    taskKey: string;
    status: (typeof schema.jobStatusEnum.enumValues)[number];
    attempts?: number;
    error?: string;
    payload?: Record<string, unknown>;
    createdAt?: Date;
  }) {
    const id = generateId();
    const now = values.createdAt ?? new Date();
    await db.insert(schema.jobRuns).values({
      id,
      type: values.type,
      taskKey: values.taskKey,
      status: values.status,
      attempts: values.attempts ?? 1,
      error: values.error ?? null,
      payload: values.payload ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: ["completed", "failed", "cancelled"].includes(values.status)
        ? now
        : null,
    });
    return id;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-admin-"));
    process.env.STORAGE_ROOT = storageRoot;

    pool = createPool(DATABASE_URL);
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "storage-admin@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "storage-admin@test.local",
      username: "storageadmin",
      displayName: "Storage Admin",
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
      payload: { email: "storage-admin@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const locRes = await app.inject({
      method: "GET",
      url: "/api/v1/storage/locations",
      headers: { cookie },
    });
    expect(locRes.statusCode).toBe(200);
    const locations = locRes.json().data as Array<{
      id: string;
      rootPath: string;
      health: { exists: boolean; readable: boolean };
    }>;
    expect(locations.length).toBeGreaterThan(0);
    expect(locations[0]!.rootPath).toBeTruthy();
    expect(locations[0]!.health.exists).toBe(true);
    expect(locations[0]!.health.readable).toBe(true);
    storageLocationId = locations[0]!.id;
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("patches storage location metadata", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/storage/locations/${storageLocationId}`,
      headers: { cookie },
      payload: { name: "Application Storage (test)", watchEnabled: true },
    });
    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: "/api/v1/storage/locations",
      headers: { cookie },
    });
    const row = (getRes.json().data as Array<{ id: string; name: string }>).find(
      (l) => l.id === storageLocationId,
    );
    expect(row?.name).toBe("Application Storage (test)");
  });

  it("creates, lists, and deletes ingest roots", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/roots",
      headers: { cookie },
      payload: {
        name: "Test ingest source",
        storageLocationId,
        enabled: true,
        recursive: true,
      },
    });
    expect(createRes.statusCode).toBe(201);
    ingestRootId = createRes.json().data.id as string;

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/ingest/roots",
      headers: { cookie },
    });
    expect(
      (listRes.json().data as Array<{ id: string }>).some((r) => r.id === ingestRootId),
    ).toBe(true);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/ingest/roots/${ingestRootId}`,
      headers: { cookie },
    });
    expect(deleteRes.statusCode).toBe(200);
  });

  it("filters jobs by type", async () => {
    const jobId = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: { cookie },
      payload: { type: "library.scan", payload: { storageLocationId } },
    });
    expect(jobId.statusCode).toBe(202);
    const id = jobId.json().data.id as string;

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/jobs?type=library.scan&limit=10",
      headers: { cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const jobs = listRes.json().data as Array<{ id: string; type: string }>;
    expect(jobs.some((j) => j.id === id && j.type === "library.scan")).toBe(true);
  });

  it("groups tasks and returns latest run per task", async () => {
    const taskKey = storageLocationId;
    const older = new Date(Date.now() - 60_000);
    const newer = new Date();

    await insertJobRun({
      type: "library.scan",
      taskKey,
      status: "completed",
      createdAt: older,
    });
    const latestId = await insertJobRun({
      type: "library.scan",
      taskKey,
      status: "failed",
      error: "Permission denied",
      attempts: 2,
      createdAt: newer,
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/tasks?type=library.scan&limit=50`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const task = (body.data as Array<{ taskKey: string; latest: { id: string }; runCount: number }>).find(
      (t) => t.taskKey === taskKey,
    );
    expect(task?.latest.id).toBe(latestId);
    expect(task?.runCount).toBeGreaterThanOrEqual(2);
    expect(body.summary.totalTaskCount).toBeGreaterThanOrEqual(1);
  });

  it("computes failure streak and global summary", async () => {
    const taskKey = generateId();
    const base = Date.now() - 300_000;
    await insertJobRun({
      type: "library.scan",
      taskKey,
      status: "failed",
      createdAt: new Date(base + 3000),
    });
    await insertJobRun({
      type: "library.scan",
      taskKey,
      status: "failed",
      attempts: 2,
      createdAt: new Date(base + 2000),
    });
    await insertJobRun({
      type: "library.scan",
      taskKey,
      status: "failed",
      attempts: 3,
      createdAt: new Date(base + 1000),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/tasks?type=library.scan&limit=50`,
      headers: { cookie },
    });
    const task = (res.json().data as Array<{ taskKey: string; failureStreak: number }>).find(
      (t) => t.taskKey === taskKey,
    );
    expect(task?.failureStreak).toBe(3);
    expect(res.json().summary.failedCount).toBeGreaterThanOrEqual(1);
  });

  it("returns task history newest first", async () => {
    const taskKey = generateId();
    const first = await insertJobRun({
      type: "library.scan",
      taskKey,
      status: "completed",
      createdAt: new Date(Date.now() - 2000),
    });
    const second = await insertJobRun({
      type: "library.scan",
      taskKey,
      status: "failed",
      attempts: 2,
      createdAt: new Date(Date.now() - 1000),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/jobs?type=library.scan&taskKey=${taskKey}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const ids = (res.json().data as Array<{ id: string }>).map((r) => r.id);
    expect(ids[0]).toBe(second);
    expect(ids[1]).toBe(first);
  });

  it("retries failed jobs with incremented attempts", async () => {
    const failedId = await insertJobRun({
      type: "library.scan",
      taskKey: storageLocationId,
      status: "failed",
      attempts: 2,
      error: "boom",
      payload: { storageLocationId },
    });

    const retryRes = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${failedId}/retry`,
      headers: { cookie },
    });
    expect(retryRes.statusCode).toBe(202);
    const newId = retryRes.json().data.id as string;

    const jobRes = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/${newId}`,
      headers: { cookie },
    });
    const job = jobRes.json().data as { attempts: number; taskKey: string; status: string };
    expect(job.taskKey).toBe(storageLocationId);
    expect(job.attempts).toBeGreaterThan(2);
    expect(job.status).toBe("queued");
  });

  it("rejects retry on completed jobs", async () => {
    const completedId = await insertJobRun({
      type: "library.scan",
      taskKey: generateId(),
      status: "completed",
    });

    const retryRes = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${completedId}/retry`,
      headers: { cookie },
    });
    expect(retryRes.statusCode).toBe(422);
  });
});
