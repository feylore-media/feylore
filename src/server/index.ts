import { buildApp } from "./http/app.js";
import { loadConfig } from "./config.js";

async function main() {
  const config = loadConfig();
  const { app } = await buildApp();
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`Feylore API listening on ${config.HOST}:${config.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
