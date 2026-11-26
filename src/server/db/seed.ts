import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { createDb, createPool, type Database } from "./client.js";
import { initializeSystemRecords } from "./system-seed.js";

// The development command and tests initialize system records only.
export async function seed(db?: Database) {
  if (db) return initializeSystemRecords(db);
  const pool = createPool(loadConfig().DATABASE_URL);
  try {
    await initializeSystemRecords(createDb(pool));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
