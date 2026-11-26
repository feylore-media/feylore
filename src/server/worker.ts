import { loadConfig } from "./config.js";
import { createPool, createDb } from "./db/client.js";
import { createContext } from "./context.js";
import { registerJobHandlers } from "./modules/jobs/service.js";
import { bootstrapIngestStorage } from "./modules/ingest/service.js";
import { ensureDefaultMetadataProviders } from "./modules/metadata/ensure-default-providers.js";
import { startPodcastFeedSweep } from "./modules/podcasts/worker-sweep.js";
import { startClubScheduleSweep } from "./modules/clubs/worker-sweep.js";
import { startChallengeSweep } from "./modules/challenges/worker-sweep.js";

async function main() {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
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

  console.log("Feylore worker started");

  const shutdown = async () => {
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
