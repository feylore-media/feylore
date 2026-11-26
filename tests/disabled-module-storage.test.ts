import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { loadConfig } from "../src/server/config.js";
import { createContext } from "../src/server/context.js";
import { createDb, createPool } from "../src/server/db/client.js";
import { applyStartupMigrations } from "../src/server/db/startup-migrations.js";
import * as schema from "../src/server/db/schema.js";
import { bootstrapIngestStorage } from "../src/server/modules/ingest/service.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("disabled module storage", () => {
  const name = `feylore_storage_test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;
  let root: string;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    admin = new pg.Client({ connectionString: url.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname = `/${name}`;
    pool = createPool(url.toString());
    await applyStartupMigrations(pool);
    root = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-disabled-storage-"),
    );
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
    if (root) {
      const relative = path.relative(os.tmpdir(), root);
      if (
        !relative.startsWith("feylore-disabled-storage-") ||
        relative.includes(path.sep)
      ) {
        throw new Error("Unexpected temporary storage path");
      }
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not create books or audiobook roots when those modules are disabled", async () => {
    const db = createDb(pool);
    await db
      .insert(schema.systemSettings)
      .values({ key: "modules.enabled", value: { enabled: ["music"] } });
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: pool.options.connectionString,
      LIBRARY_BOOKS_ROOT: path.join(root, "books"),
      LIBRARY_AUDIOBOOKS_ROOT: path.join(root, "audiobooks"),
      STORAGE_ROOT: path.join(root, "storage"),
    });
    const ctx = createContext(config, db);
    await bootstrapIngestStorage(db, config, ctx.files, ctx.libraries);
    await expect(fs.access(config.LIBRARY_BOOKS_ROOT)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      fs.access(config.LIBRARY_AUDIOBOOKS_ROOT),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(config.STORAGE_ROOT)).resolves.toBeUndefined();
  });
});
