import type { PodcastsService } from "./service.js";

/** Re-sync subscribed feeds on worker startup and periodically. */
const FEED_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function startPodcastFeedSweep(podcasts: PodcastsService): () => void {
  const run = () => {
    void podcasts.syncFeedsWithSubscribers().catch((err) => {
      console.error("Podcast feed sweep failed:", err);
    });
  };

  run();
  const timer = setInterval(run, FEED_SWEEP_INTERVAL_MS);
  return () => clearInterval(timer);
}
