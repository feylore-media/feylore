import type { JobService } from "../service.js";
import type { Database } from "../../../db/client.js";
import type { StatsFactRecorder } from "../../stats/facts.js";
import { runStatsBackfill } from "../../stats/backfill.js";

export interface StatsBackfillPayload {
  userId?: string;
  feyloreJobId: string;
}

export async function runStatsBackfillJob(
  jobService: JobService,
  db: Database,
  recorder: StatsFactRecorder,
  payload: StatsBackfillPayload,
) {
  const { userId, feyloreJobId } = payload;
  const signal = jobService.registerCancellation(feyloreJobId);

  try {
    await jobService.updateStatus(feyloreJobId, "running");
    const counts = await runStatsBackfill(db, recorder, userId ?? null);
    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: `Backfilled stats for ${counts.users} user${
        counts.users === 1 ? "" : "s"
      } (${counts.ratings} ratings, ${counts.completions} completions, ${counts.sessions} sessions, ${counts.plays} plays)`,
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