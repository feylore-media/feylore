import { loadConfig } from "./config.js";
import { createPool, createDb } from "./db/client.js";
import { createContext } from "./context.js";
import { registerJobHandlers } from "./modules/jobs/service.js";
import { bootstrapIngestStorage } from "./modules/ingest/service.js";
import { ensureDefaultMetadataProviders } from "./modules/metadata/ensure-default-providers.js";
import { startPodcastFeedSweep } from "./modules/podcasts/worker-sweep.js";
import { startClubScheduleSweep } from "./modules/clubs/worker-sweep.js";
import { startChallengeSweep } from "./modules/challenges/worker-sweep.js";
import { applyStartupMigrations } from "./db/startup-migrations.js";
import { createServer } from "node:http";

async function main() {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  if (config.NODE_ENV === "production") await applyStartupMigrations(pool);
  const db = createDb(pool);
  const ctx = createContext(config, db);
  await ensureDefaultMetadataProviders(ctx.metadata, ctx.metadataRegistry);

  await ctx.jobs.start();
  await ctx.files.loadStorageLocations();
  await bootstrapIngestStorage(db, config, ctx.files, ctx.libraries);
  await ctx.files.loadStorageLocations();

  const pipeline = ctx.ingest.getPipeline();
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
    ctx.metadataPersistenceSync,
    ctx.mail,
    config.APP_URL,
    ctx.statsRecorder,
  );

  await ctx.ingest.startWorkerSideEffects();

  const stopPodcastSweep = startPodcastFeedSweep(ctx.podcasts);
  const stopClubScheduleSweep = startClubScheduleSweep(
    ctx.clubSchedules,
    ctx.clubSelection,
  );
  const stopChallengeSweep = startChallengeSweep(ctx.challenges);

  const health = createServer(async (request, response) => {
    if (request.url !== "/health/ready") {
      response.writeHead(404).end();
      return;
    }
    try {
      await pool.query("SELECT 1");
      response.writeHead(200).end("ok");
    } catch {
      response.writeHead(503).end("unavailable");
    }
  });
  await new Promise<void>((resolve, reject) => {
    health.once("error", reject);
    health.listen(3001, "127.0.0.1", resolve);
  });

  console.log("Feylore worker started");

  const shutdown = async () => {
    await new Promise<void>((resolve, reject) =>
      health.close((error) => (error ? reject(error) : resolve())),
    );
    stopPodcastSweep();
    stopClubScheduleSweep();
    stopChallengeSweep();
    await ctx.ingest.stopWorkerSideEffects();
    await ctx.jobs.stop();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
