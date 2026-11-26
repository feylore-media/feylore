import type { JobService } from "../service.js";
import type { CoverPipeline } from "../../metadata/cover.js";

export interface ArtworkFetchPayload {
  bookId?: string;
  audiobookId?: string;
  representationId: string;
  coverUrl: string;
  feyloreJobId: string;
}

export async function runArtworkFetch(
  jobService: JobService,
  coverPipeline: CoverPipeline,
  payload: ArtworkFetchPayload,
) {
  const { bookId, audiobookId, representationId, coverUrl, feyloreJobId } =
    payload;
  const signal = jobService.registerCancellation(feyloreJobId);

  try {
    await jobService.updateStatus(feyloreJobId, "running");
    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
      return;
    }

    let coverFileId: string | null = null;
    if (audiobookId) {
      coverFileId = await coverPipeline.fetchAndStoreAudiobookCoverFromUrl({
        audiobookId,
        representationId,
        coverUrl,
      });
    } else if (bookId) {
      coverFileId = await coverPipeline.fetchAndStoreCoverFromUrl({
        bookId,
        representationId,
        coverUrl,
      });
    }

    if (!coverFileId) {
      await jobService.updateStatus(feyloreJobId, "failed", {
        error: "Could not fetch or store cover",
      });
      return;
    }

    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: `Cover stored: ${coverFileId}`,
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
