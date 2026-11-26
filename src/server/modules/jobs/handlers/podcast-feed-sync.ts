import type { JobService } from "../service.js";
import type { Database } from "../../../db/client.js";
import type { PostgresSearchIndex } from "../../search/index.js";
import type { CoverPipeline } from "../../metadata/cover.js";
import { runPodcastFeedSync } from "../../podcasts/feed-sync.js";

export interface PodcastFeedSyncPayload {
  feedId: string;
  feyloreJobId: string;
}

export async function runPodcastFeedSyncJob(
  jobService: JobService,
  db: Database,
  search: PostgresSearchIndex,
  coverPipeline: CoverPipeline,
  payload: PodcastFeedSyncPayload,
) {
  const { feedId, feyloreJobId } = payload;
  const signal = jobService.registerCancellation(feyloreJobId);

  try {
    await jobService.updateStatus(feyloreJobId, "running");
    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
      return;
    }
    await runPodcastFeedSync(db, feedId, search, coverPipeline);
    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: `Synced podcast feed ${feedId}`,
    });
  } catch (err) {
    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
    } else {
      await jobService.updateStatus(feyloreJobId, "failed", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  } finally {
    jobService.clearCancellation(feyloreJobId);
  }
}
