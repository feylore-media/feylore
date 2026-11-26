import { describe, it, expect } from "vitest";
import {
  createInitialPlaybackState,
  playbackReducer,
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

describe("playbackReducer", () => {
  it("starts playback from manifest", () => {
    const next = playbackReducer(createInitialPlaybackState(), {
      type: "PLAY_MANIFEST",
      manifest,
    });
    expect(next.status).toBe("loading");
    expect(next.queue).toHaveLength(1);
    expect(next.currentItem?.title).toBe("Sample");
    expect(next.queueIndex).toBe(0);
  });

  it("keeps engine-neutral state shape", () => {
    const state = playbackReducer(createInitialPlaybackState(), {
      type: "ENGINE_STATE",
      status: "playing",
      positionSeconds: 12,
      durationSeconds: 100,
      error: null,
    });
    expect(state).not.toHaveProperty("audioElement");
    expect(state.positionSeconds).toBe(12);
    expect(state.durationSeconds).toBe(100);
  });

  it("advances queue on next", () => {
    let state = playbackReducer(createInitialPlaybackState(), {
      type: "PLAY_MANIFEST",
      manifest,
    });
    state = playbackReducer(state, {
      type: "PLAY_MANIFEST",
      manifest: { ...manifest, title: "Second" },
      append: true,
    });
    state = playbackReducer(state, { type: "NEXT" });
    expect(state.queueIndex).toBe(1);
    expect(state.currentItem?.title).toBe("Second");
    expect(state.status).toBe("loading");
  });

  it("seeks within reducer state", () => {
    const state = playbackReducer(createInitialPlaybackState(), {
      type: "SEEK",
      positionSeconds: 33,
    });
    expect(state.positionSeconds).toBe(33);
  });

  it("pauses during loading", () => {
    let state = playbackReducer(createInitialPlaybackState(), {
      type: "PLAY_MANIFEST",
      manifest,
    });
    state = playbackReducer(state, { type: "PAUSE" });
    expect(state.status).toBe("paused");
  });

  it("stops playback and resets state", () => {
    let state = playbackReducer(createInitialPlaybackState(), {
      type: "PLAY_MANIFEST",
      manifest,
    });
    state = playbackReducer(state, { type: "STOP_PLAYBACK" });
    expect(state).toEqual(createInitialPlaybackState());
  });

  it("enters session ended state", () => {
    let state = playbackReducer(createInitialPlaybackState(), {
      type: "PLAY_MANIFEST",
      manifest,
    });
    state = playbackReducer(state, { type: "SESSION_ENDED" });
    expect(state.status).toBe("ended");
    expect(state.currentItem?.title).toBe("Sample");
    expect(state.expanded).toBe(false);
  });
});
