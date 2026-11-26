import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
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
import { collectManifestUrls } from "../src/server/modules/downloads/prepare.js";

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

describe("collectManifestUrls", () => {
  it("collects and deduplicates hrefs from manifest sections", () => {
    const urls = collectManifestUrls({
      readingOrder: [
        {
          href: "chapter1.xhtml",
          alternates: [{ href: "chapter1.smil" }],
        },
      ],
      resources: [{ href: "cover.jpg" }],
      toc: [
        {
          href: "chapter1.xhtml",
          children: [{ href: "chapter2.xhtml" }],
        },
      ],
    });

    expect(urls).toEqual(
      expect.arrayContaining([
        "chapter1.xhtml",
        "chapter1.smil",
        "cover.jpg",
        "chapter2.xhtml",
      ]),
    );
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("Downloads API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";
  let fileId = "";
  let storageRoot = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-downloads-"));
    process.env.STORAGE_ROOT = storageRoot;

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    ctx = built.ctx;
    pool = built.pool;
    await ctx.jobs.start();

    const userId = generateId();
    await createDb(pool)
      .delete(schema.users)
      .where(eq(schema.users.email, "downloads@test.local"));
    await createDb(pool).insert(schema.users).values({
      id: userId,
      email: "downloads@test.local",
      username: "downloads",
      displayName: "Downloads User",
      passwordHash: await hash("password123"),
    });
    await createDb(pool).insert(schema.userPreferences).values({ userId });

    const memberRole = await createDb(pool).query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await createDb(pool)
        .insert(schema.userRoles)
        .values({ userId, roleId: memberRole.id });
    }

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "downloads@test.local", password: "password123" },
    });
    expect(login.statusCode).toBe(200);
    cookie = login.headers["set-cookie"]?.toString() ?? "";

    const storageId = generateId();
    await createDb(pool).insert(schema.storageLocations).values({
      id: storageId,
      name: "Downloads Test",
      kind: "managed",
      rootPath: storageRoot,
    });
    await fs.writeFile(path.join(storageRoot, "book.txt"), "offline book content");

    fileId = generateId();
    await createDb(pool).insert(schema.files).values({
      id: fileId,
      storageLocationId: storageId,
      relativePath: "book.txt",
      size: 20,
      mediaType: "text/plain",
      checksum: "bbb",
    });
  }, 60000);

  afterAll(async () => {
    if (ctx) await ctx.jobs.stop();
    if (app) await app.close();
    if (storageRoot) {
      await fs.rm(storageRoot, { recursive: true, force: true });
    }
  });

  it.skipIf(!dbAvailable)(
    "POST /downloads enqueues download.prepare job",
    async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/downloads",
        headers: {
          cookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { fileId },
      });

      expect(res.statusCode).toBe(201);
      const { id: downloadId, jobId } = res.json().data;
      expect(downloadId).toBeTruthy();
      expect(jobId).toBeTruthy();

      const job = await createDb(pool).query.jobRuns.findFirst({
        where: eq(schema.jobRuns.id, jobId),
      });
      expect(job?.type).toBe("download.prepare");
      expect(job?.payload).toMatchObject({
        downloadId,
        fileId,
      });
    },
  );

  it.skipIf(!dbAvailable)("PATCH progress and complete flow", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/downloads",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { fileId },
    });
    const downloadId = createRes.json().data.id;

    const db = createDb(pool);
    await db
      .update(schema.downloads)
      .set({
        status: "in_progress",
        bytesTotal: 1000,
        preparePayload: {
          urls: [`/api/v1/files/${fileId}/content`],
        },
      })
      .where(eq(schema.downloads.id, downloadId));

    const progressRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/downloads/${downloadId}`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { bytesDownloaded: 500 },
    });
    expect(progressRes.statusCode).toBe(200);
    expect(progressRes.json().data.bytesDownloaded).toBe(500);

    const completeRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/downloads/${downloadId}`,
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { status: "available" },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().data.status).toBe("available");
  });
});

describe("cachedFetch offline behavior", () => {
  const getCachedResponse = vi.fn<() => Promise<Response | undefined>>();
  const mockFetch = vi.fn<typeof fetch>();

  beforeEach(async () => {
    vi.resetModules();
    getCachedResponse.mockReset();
    mockFetch.mockReset();

    vi.doMock("../src/web/downloads/manager.js", () => ({
      downloadManager: {
        getCachedResponse,
        hasCachedUrl: vi.fn(),
      },
    }));

    Object.defineProperty(globalThis, "window", {
      value: { location: { origin: "http://localhost:5173" } },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
      writable: true,
    });
    globalThis.fetch = mockFetch;
    globalThis.caches = {
      open: vi.fn().mockResolvedValue({
        put: vi.fn(),
        match: vi.fn(),
      }),
    } as unknown as CacheStorage;
  });

  it("returns cached response when offline", async () => {
    const cachedBody = new Blob(["cached manifest"]);
    const cachedResponse = new Response(cachedBody, { status: 200 });
    getCachedResponse.mockResolvedValue(cachedResponse);

    const { cachedFetch } = await import("../src/web/downloads/cachedFetch.js");
    const res = await cachedFetch("/api/v1/representations/x/publication/manifest");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("cached manifest");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(getCachedResponse).toHaveBeenCalledWith(
      "/api/v1/representations/x/publication/manifest",
    );
  });

  it("throws OfflineUnavailableError when offline and uncached", async () => {
    getCachedResponse.mockResolvedValue(undefined);

    const { cachedFetch, OfflineUnavailableError } = await import(
      "../src/web/downloads/cachedFetch.js"
    );

    await expect(
      cachedFetch("/api/v1/representations/x/publication/manifest"),
    ).rejects.toBeInstanceOf(OfflineUnavailableError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
