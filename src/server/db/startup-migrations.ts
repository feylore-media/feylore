import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type pg from "pg";

// A session lock protects Drizzle's migration journal across API and worker starts.
const migrationLock = 1178949964;

export async function applyStartupMigrations(pool: pg.Pool): Promise<void> {
  let client: pg.PoolClient | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      client = await pool.connect();
      break;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  if (!client) throw new Error("Database connection unavailable");
  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLock]);
    const exists = await client.query<{ name: string | null }>(
      "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS name",
    );
    const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
    if (!migrations.length) throw new Error("No committed migrations found");
    if (exists.rows[0]?.name) {
      const current = await client.query<{ created_at: string; hash: string }>(
        "SELECT created_at, hash FROM drizzle.__drizzle_migrations ORDER BY created_at",
      );
      const latest = current.rows.at(-1);
      if (
        latest &&
        !migrations.some(
          (m) =>
            m.folderMillis === Number(latest.created_at) &&
            m.hash === latest.hash,
        )
      ) {
        throw new Error(
          "Database schema is incompatible with this application version",
        );
      }
      if (
        latest &&
        migrations.some(
          (migration) =>
            migration.folderMillis <= Number(latest.created_at) &&
            !current.rows.some(
              (row) =>
                Number(row.created_at) === migration.folderMillis &&
                row.hash === migration.hash,
            ),
        )
      ) {
        throw new Error(
          "Database migration history is incomplete or has changed",
        );
      }
    }
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [migrationLock])
      .catch(() => {});
    client.release();
  }
}
