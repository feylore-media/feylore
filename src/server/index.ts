import { buildApp } from "./http/app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/client.js";
import { applyStartupMigrations } from "./db/startup-migrations.js";

async function main() {
  const config = loadConfig();
  if (config.NODE_ENV === "production") {
    const pool = createPool(config.DATABASE_URL);
    try {
      await applyStartupMigrations(pool);
    } finally {
      await pool.end();
    }
  }
  const { app } = await buildApp();
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`Feylore API listening on ${config.HOST}:${config.PORT}`);
  const shutdown = async () => {
    try {
      await app.close();
      process.exitCode = 0;
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
