import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createPool } from "../src/server/db/client.js";
import { applyStartupMigrations } from "../src/server/db/startup-migrations.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("startup migrations", () => {
  const name = `feylore_migration_test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    admin = new pg.Client({ connectionString: url.toString() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname = `/${name}`;
    pool = createPool(url.toString());
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it("serializes concurrent starts and retains existing data on subsequent runs", async () => {
    await Promise.all([
      applyStartupMigrations(pool),
      applyStartupMigrations(pool),
    ]);
    await pool.query(
      "CREATE TABLE deployment_test_marker (value text NOT NULL)",
    );
    await pool.query("INSERT INTO deployment_test_marker VALUES ('preserved')");
    await applyStartupMigrations(pool);
    expect(
      (await pool.query("SELECT value FROM deployment_test_marker")).rows,
    ).toEqual([{ value: "preserved" }]);
    expect(
      (await pool.query("SELECT to_regclass('public.music_artists') AS name"))
        .rows[0].name,
    ).toBe("music_artists");
  }, 60000);

  it("waits for the advisory lock before touching the schema", async () => {
    const blocker = await pool.connect();
    try {
      await blocker.query("SELECT pg_advisory_lock($1)", [1178949964]);
      let finished = false;
      const migration = applyStartupMigrations(pool).then(() => {
        finished = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(finished).toBe(false);
      await blocker.query("SELECT pg_advisory_unlock($1)", [1178949964]);
      await migration;
      expect(finished).toBe(true);
    } finally {
      blocker.release();
    }
  });

  it("rejects an incompatible migration and recovers after it is removed", async () => {
    const timestamp = 9999999999999;
    await pool.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      ["unknown", timestamp],
    );
    await expect(applyStartupMigrations(pool)).rejects.toThrow(/incompatible/);
    await pool.query(
      "DELETE FROM drizzle.__drizzle_migrations WHERE hash = $1",
      ["unknown"],
    );
    await expect(applyStartupMigrations(pool)).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT value FROM deployment_test_marker")).rows[0]
        .value,
    ).toBe("preserved");
  });
});
