import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildApp } from "../../src/server/http/app.js";
import { createPool, createDb } from "../../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../../src/server/db/schema.js";
import { seed } from "../../src/server/db/seed.js";
import { generateId } from "../../src/server/security/crypto.js";
import { ROLE_NAMES } from "../../src/shared/permissions.js";
import { ensureTestUser } from "./test-user.js";

export const INGEST_TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://feylore:feylore@localhost:5432/feylore_test";

export const ingestDbAvailable = await (async () => {
  try {
    const pool = createPool(INGEST_TEST_DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await pool.end();
    return true;
  } catch {
    return false;
  }
})();

export type IngestTestContext = {
  app: Awaited<ReturnType<typeof buildApp>>["app"];
  pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  cookie: string;
  userId: string;
  libraryId: string;
  ingestRootId: string;
  libraryStorageId: string;
  ingestStorageId: string;
  libraryRoot: string;
  ingestRoot: string;
};

let ingestSetupChain: Promise<unknown> = Promise.resolve();

export async function createIngestTestContext(
  email = "ingest@test.local",
): Promise<IngestTestContext> {
  let result!: IngestTestContext;
  ingestSetupChain = ingestSetupChain.then(async () => {
    result = await createIngestTestContextInner(email);
  });
  await ingestSetupChain;
  return result;
}

async function createIngestTestContextInner(
  email = "ingest@test.local",
): Promise<IngestTestContext> {
  process.env.DATABASE_URL = INGEST_TEST_DATABASE_URL;
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "test-session-secret-min-16-chars";

  const libraryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-lib-"));
  const ingestRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-ingest-"));

  const pool = createPool(INGEST_TEST_DATABASE_URL);
  const db = createDb(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seed(db);

  const libraryStorageId = generateId();
  const ingestStorageId = generateId();
  await db.insert(schema.storageLocations).values([
    {
      id: libraryStorageId,
      name: "Books Library",
      kind: "managed",
      rootPath: libraryRoot,
    },
    {
      id: ingestStorageId,
      name: "Ingest",
      kind: "managed",
      rootPath: ingestRoot,
    },
  ]);

  const libraryId = generateId();
  await db.insert(schema.libraries).values({
    id: libraryId,
    name: "Books",
    contentType: "book",
    storageLocationId: libraryStorageId,
    organizationPolicy: { mode: "managed", template: "{author}/{series}/{title}" },
  });

  const ingestRootId = generateId();
  await db.insert(schema.ingestRoots).values({
    id: ingestRootId,
    name: "Test Ingest",
    storageLocationId: ingestStorageId,
    defaultLibraryId: libraryId,
  });

  const built = await buildApp();
  const { app, ctx } = built;
  await ctx.files.loadStorageLocations();
  await ctx.jobs.start();

  const pipeline = ctx.ingest.getPipeline();
  const { registerJobHandlers } = await import(
    "../../src/server/modules/jobs/service.js"
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
    pipeline,
  );

  const adminRole = await db.query.roles.findFirst({
    where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
  });
  const userId = await ensureTestUser(db, email, {
    username: email.replace(/[@.+]/g, "-"),
    displayName: "Ingest User",
    roleId: adminRole?.id,
  });

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: {
      origin: "http://localhost:5173",
      "content-type": "application/json",
    },
    payload: { email, password: "password123" },
  });
  if (login.statusCode !== 200) {
    throw new Error(`Login failed (${login.statusCode}): ${login.body}`);
  }
  const setCookie = login.headers["set-cookie"];
  const cookie = Array.isArray(setCookie)
    ? setCookie[0]?.split(";")[0] ?? ""
    : setCookie?.split(";")[0] ?? "";

  return {
    app,
    pool: built.pool,
    ctx,
    cookie,
    userId,
    libraryId,
    ingestRootId,
    libraryStorageId,
    ingestStorageId,
    libraryRoot,
    ingestRoot,
  };
}

export async function destroyIngestTestContext(
  testCtx: IngestTestContext | undefined,
): Promise<void> {
  if (!testCtx) return;
  await testCtx.ctx.jobs.stop();
  await testCtx.pool.end();
}
