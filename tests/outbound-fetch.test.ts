import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  outboundFetchBuffer,
  OutboundFetchError,
} from "../src/server/modules/metadata/outbound-fetch.js";

describe("outboundFetchBuffer redirects", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "https://93.184.216.34/track") {
          return new Response(null, {
            status: 302,
            headers: { location: "https://93.184.216.34/audio.mp3" },
          });
        }
        if (url === "https://93.184.216.34/audio.mp3") {
          return new Response(Buffer.from([0xff, 0xfb, 0x90, 0x00]), {
            status: 200,
            headers: { "content-type": "audio/mpeg" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows safe HTTPS redirects for buffer fetches", async () => {
    const result = await outboundFetchBuffer("https://93.184.216.34/track");
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.mediaType).toBe("audio/mpeg");
  });

  it("rejects redirects when maxRedirects is zero", async () => {
    await expect(
      outboundFetchBuffer("https://93.184.216.34/track", {
        maxRedirects: 0,
      }),
    ).rejects.toMatchObject({
      code: "redirect",
    } satisfies Partial<OutboundFetchError>);
  });
});
