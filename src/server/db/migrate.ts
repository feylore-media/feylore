import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPool, createDb } from "./client.js";
import { loadConfig } from "../config.js";

async function main() {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  const db = createDb(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
