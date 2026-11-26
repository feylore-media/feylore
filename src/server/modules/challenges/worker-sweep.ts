import type { ChallengeService } from "./service.js";

const CHALLENGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Hourly challenge lifecycle sweep: publishes `challenge.started` once
 * when a challenge's window opens and `challenge.ending_soon` once
 * inside the final window. The sweep itself is idempotent; notification
 * sources dedupe per recipient on top.
 */
export function startChallengeSweep(
  challenges: ChallengeService,
): () => void {
  const run = () => {
    void challenges.runLifecycleSweep().catch((err) => {
      console.error("Challenge lifecycle sweep failed:", err);
    });
  };
  run();
  const timer = setInterval(run, CHALLENGE_SWEEP_INTERVAL_MS);
  return () => clearInterval(timer);
}
