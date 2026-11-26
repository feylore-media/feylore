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

async function waitForJob(
  app: Awaited<ReturnType<typeof buildApp>>["app"],
  cookie: string,
  jobId: string,
  timeoutMs = 8000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/${jobId}`,
      headers: { cookie },
    });
    const status = res.json().data.status;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return res.json().data;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Job ${jobId} did not finish in time`);
}

describe("Job handlers", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let bookId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-jobs-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    ctx = built.ctx;
    pool = built.pool;
    await ctx.jobs.start();

    const { registerJobHandlers } = await import(
      "../src/server/modules/jobs/service.js"
    );
    await registerJobHandlers(
      ctx.jobs,
      ctx.files,
      ctx.books,
      ctx.audiobooks,
      ctx.movies,
      ctx.tv,
      ctx.podcasts,
      ctx.people,
      ctx.music,
      ctx.metadata,
      ctx.metadataPolicy,
      ctx.metadataCanonical,
      ctx.metadataRegistry,
      ctx.metadataFormatting,
      ctx.coverPipeline,
      ctx.db,
      ctx.downloads,
      ctx.representations,
      ctx.epubPublication,
      ctx.playback,
      ctx.search,
      ctx.ingest.getPipeline(),
    );

    const userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "jobs@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "jobs@test.local",
      username: "jobsuser",
      displayName: "Jobs User",
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
      payload: { email: "jobs@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Search Index Book", authors: ["Author"] },
    });
    bookId = create.json().data.id;
  });

  afterAll(async () => {
    if (ctx) await ctx.jobs.stop();
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("media.process fails with explicit message when unregistered", async () => {
    const { clearMediaProcessors } = await import(
      "../src/server/modules/playback/processors/registry.js"
    );
    clearMediaProcessors();
    const jobId = generateId();
    await ctx.db.insert(schema.jobRuns).values({
      id: jobId,
      type: "media.process",
      taskKey: jobId,
      status: "queued",
      payload: { domain: "audiobooks" },
    });
    await runMediaProcess(ctx.jobs, ctx.db, {
      feyloreJobId: jobId,
      domain: "audiobooks",
    });
    const job = await ctx.jobs.getJob(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toBe("No media processor for domain");
  });

  it.skipIf(!dbAvailable)("search.index reindexes books", async () => {
    const enqueue = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { type: "search.index", payload: {} },
    });
    expect(enqueue.statusCode).toBe(202);
    const jobId = enqueue.json().data.id;
    const job = await waitForJob(app, cookie, jobId);
    expect(job.status).toBe("completed");

    const search = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=Search+Index",
      headers: { cookie },
    });
    expect(search.statusCode).toBe(200);
    const hit = search.json().data.find((r: { id: string }) => r.id === bookId);
    expect(hit).toBeDefined();
    expect(hit.slug).toBeTruthy();
    expect(hit.href).toMatch(/^\/books\//);
  });

  it.skipIf(!dbAvailable)("artwork.fetch fails safely for invalid URL", async () => {
    const enqueue = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        type: "artwork.fetch",
        payload: {
          bookId,
          representationId: generateId(),
          coverUrl: "https://invalid.example.test/cover.jpg",
        },
      },
    });
    expect(enqueue.statusCode).toBe(202);
    const job = await waitForJob(app, cookie, enqueue.json().data.id);
    expect(job.status).toBe("failed");
  });
});
