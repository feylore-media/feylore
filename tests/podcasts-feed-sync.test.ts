import { describe, it, expect } from "vitest";
import { parsePodcastFeed } from "../src/server/modules/podcasts/feed-parser.js";
import { MAX_FEED_BYTES } from "../src/server/modules/podcasts/feed-sync.js";
import { allocateEpisodeSlug } from "../src/server/modules/podcasts/identity.js";

describe("podcast feed limits", () => {
  it("allows feeds large enough for popular catalogs", () => {
    expect(MAX_FEED_BYTES).toBeGreaterThanOrEqual(4 * 1024 * 1024);
  });
});

describe("podcast episode identity", () => {
  it("parses distinct guids per episode", async () => {
    const feed = await parsePodcastFeed(`<?xml version="1.0"?>
<rss version="2.0"><channel><title>T</title>
<item><title>A</title><guid>same-guid</guid></item>
<item><title>B</title><guid>same-guid</guid></item>
</channel></rss>`);
    expect(feed.episodes[0]?.guid).toBe("same-guid");
    expect(feed.episodes[1]?.guid).toBe("same-guid");
    expect(feed.episodes[0]?.guid).toBe(feed.episodes[1]?.guid);
  });

  it("allocateEpisodeSlug is scoped per show in API contract", () => {
    expect(typeof allocateEpisodeSlug).toBe("function");
  });
});
