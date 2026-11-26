import type { JobService } from "../service.js";
import type { Database } from "../../../db/client.js";
import type { FileService } from "../../files/service.js";
import type { RepresentationService } from "../../representations/service.js";
import { runPodcastEnclosureFetch } from "../../podcasts/enclosure.js";

export interface PodcastEnclosureFetchPayload {
  episodeId: string;
  feyloreJobId: string;
}

export async function runPodcastEnclosureFetchJob(
  jobService: JobService,
  db: Database,
  files: FileService,
  representations: RepresentationService,
  payload: PodcastEnclosureFetchPayload,
) {
  const { episodeId, feyloreJobId } = payload;
  const signal = jobService.registerCancellation(feyloreJobId);

  try {
    await jobService.updateStatus(feyloreJobId, "running");
    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
      return;
    }
    await runPodcastEnclosureFetch(
      db,
      files,
      representations,
      jobService,
      episodeId,
    );
    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: `Prepared podcast episode ${episodeId}`,
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
