import type { ClubScheduleService } from "./schedules.js";
import type { ClubSelectionService } from "./selection.js";

const SCHEDULE_TICK_INTERVAL_MS = 60 * 60 * 1000;

export function startClubScheduleSweep(
  clubSchedules: ClubScheduleService,
  selection: ClubSelectionService,
): () => void {
  let selectionRunning = false;
  const run = () => {
    void clubSchedules.runScheduleTick().catch((err) => {
      console.error("Club schedule tick failed:", err);
    });
    if (!selectionRunning) {
      selectionRunning = true;
      void selection
        .runTransitionSweep()
        .catch((err) => {
          console.error("Club selection transition tick failed:", err);
        })
        .finally(() => {
          selectionRunning = false;
        });
    }
  };

  run();
  const timer = setInterval(run, SCHEDULE_TICK_INTERVAL_MS);
  return () => clearInterval(timer);
}
