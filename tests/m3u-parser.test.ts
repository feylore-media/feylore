import { describe, it, expect } from "vitest";
import { parseM3u } from "../src/server/modules/tv/live-tv/m3u-parser.js";

describe("parseM3u", () => {
  it("parses EXTINF channel entries", () => {
    const content = `#EXTM3U
#EXTINF:-1 tvg-id="news1" tvg-logo="https://example.com/logo.png" group-title="News",Example News
https://stream.example.com/news.m3u8
#EXTINF:-1 group-title="Sports",Sports HD
https://stream.example.com/sports.m3u8`;

    const channels = parseM3u(content);
    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({
      name: "Example News",
      tvgId: "news1",
      logoUrl: "https://example.com/logo.png",
      groupTitle: "News",
      streamUrl: "https://stream.example.com/news.m3u8",
    });
    expect(channels[1]?.name).toBe("Sports HD");
  });
});
