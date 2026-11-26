import { describe, it, expect } from "vitest";
import { parsePodcastFeed } from "../src/server/modules/podcasts/feed-parser.js";

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test Podcast</title>
    <description>A test feed</description>
    <itunes:author>Jane Host</itunes:author>
    <item>
      <title>Episode One</title>
      <guid isPermaLink="false">ep-001</guid>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep1.mp3" length="12345" type="audio/mpeg" />
      <itunes:duration>42:17</itunes:duration>
    </item>
    <item>
      <title>Episode Two</title>
      <guid>ep-002</guid>
      <enclosure url="https://example.com/ep2.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`;

describe("parsePodcastFeed", () => {
  it("normalizes show and episode fields", async () => {
    const parsed = await parsePodcastFeed(SAMPLE_FEED);
    expect(parsed.title).toBe("Test Podcast");
    expect(parsed.author).toBe("Jane Host");
    expect(parsed.episodes).toHaveLength(2);
    expect(parsed.episodes[0]?.guid).toBe("ep-001");
    expect(parsed.episodes[0]?.enclosureUrl).toBe("https://example.com/ep1.mp3");
    expect(parsed.episodes[0]?.durationSeconds).toBe(42 * 60 + 17);
    expect(parsed.episodes[1]?.guid).toBe("ep-002");
  });
});
