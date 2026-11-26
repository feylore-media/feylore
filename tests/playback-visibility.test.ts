import { describe, it, expect } from "vitest";
import { isPlayerVisible } from "../src/web/playback/context/PlaybackContext.js";
import {
  createInitialPlaybackState,
  manifestToItem,
} from "../src/web/playback/context/playbackReducer.js";
import type { PlaybackManifest } from "../src/shared/playback.js";

const manifest: PlaybackManifest = {
  subject: { type: "audiobook", id: "ab001" },
  representationId: "550e8400-e29b-41d4-a716-446655440000",
  title: "Sample",
  mediaKind: "audio",
  sessionMode: "ephemeral",
  sources: [
    {
      fileId: "550e8400-e29b-41d4-a716-446655440001",
      url: "/api/v1/files/550e8400-e29b-41d4-a716-446655440001/content",
    },
  ],
};

describe("isPlayerVisible", () => {
  it("is false for idle initial state", () => {
    expect(isPlayerVisible(createInitialPlaybackState())).toBe(false);
  });

  it("is true while playing", () => {
    const state = {
      ...createInitialPlaybackState(),
      status: "playing" as const,
      currentItem: manifestToItem(manifest),
    };
    expect(isPlayerVisible(state)).toBe(true);
  });

  it("is true in finished state before dismiss", () => {
    const state = {
      ...createInitialPlaybackState(),
      status: "ended" as const,
      currentItem: manifestToItem(manifest),
    };
    expect(isPlayerVisible(state)).toBe(true);
  });

  it("is false after stop resets state", () => {
    expect(isPlayerVisible(createInitialPlaybackState())).toBe(false);
  });
});
