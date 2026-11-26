import { createPool } from "./client.js";
import { loadConfig } from "../config.js";
import { applyStartupMigrations } from "./startup-migrations.js";

async function main() {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  try {
    await applyStartupMigrations(pool);
  } finally {
    await pool.end();
  }
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
