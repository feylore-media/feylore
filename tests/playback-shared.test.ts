import { describe, it, expect } from "vitest";
import {
  playbackLocatorSchema,
  playbackManifestSchema,
  resolvePlaybackResumePosition,
  isPlaybackComplete,
} from "../src/shared/playback.js";
import { normalizeProgressLocator } from "../src/shared/progress-locator.js";

describe("playback shared schemas", () => {
  it("validates playback locator", () => {
    const parsed = playbackLocatorSchema.parse({
      kind: "playback",
      positionSeconds: 42,
      durationSeconds: 100,
    });
    expect(parsed.positionSeconds).toBe(42);
  });

  it("validates manifest with authorized paths only", () => {
    const parsed = playbackManifestSchema.parse({
      subject: { type: "audiobook", id: "abc123" },
      representationId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Test Audiobook",
      mediaKind: "audio",
      sources: [
        {
          fileId: "550e8400-e29b-41d4-a716-446655440001",
          url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440001/content",
        },
      ],
    });
    expect(parsed.sources[0]?.url.startsWith("/api/v1/")).toBe(true);
  });

  it("normalizes legacy reading locators", () => {
    const locator = normalizeProgressLocator({
      type: "epub-cfi",
      cfi: "epubcfi(/6/4)",
    });
    expect(locator.kind).toBe("reading");
  });
});

describe("playback completion rules", () => {
  it("marks playback complete near end", () => {
    expect(isPlaybackComplete(97, 100)).toBe(true);
    expect(isPlaybackComplete(50, 100)).toBe(false);
  });

  it("does not resume completed items from the end", () => {
    expect(
      resolvePlaybackResumePosition({
        kind: "playback",
        positionSeconds: 100,
        durationSeconds: 100,
        completed: true,
      }),
    ).toBe(0);
  });

  it("resumes in-progress items", () => {
    expect(
      resolvePlaybackResumePosition({
        kind: "playback",
        positionSeconds: 55,
        durationSeconds: 100,
      }),
    ).toBe(55);
  });
});
