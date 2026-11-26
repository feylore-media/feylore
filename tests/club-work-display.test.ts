import { describe, it, expect } from "vitest";
import {
  formatBookProgressLabel,
  formatPlaybackProgressLabel,
  formatTvContinueProgressLabel,
} from "../src/shared/club-work-display.js";

describe("club-work-display", () => {
  it("formats book progress with chapter title and percent", () => {
    expect(
      formatBookProgressLabel({
        type: "epub-cfi",
        title: "Chapter 6",
        totalProgression: 0.67,
      }),
    ).toEqual({
      progressLabel: "Chapter 6 · 67%",
      progressPercent: 67,
    });
  });

  it("omits book progress when no reliable data exists", () => {
    expect(formatBookProgressLabel({ type: "epub-cfi" })).toEqual({});
  });

  it("formats playback track progress", () => {
    expect(
      formatPlaybackProgressLabel({
        kind: "playback",
        positionSeconds: 90,
        durationSeconds: 180,
        trackIndex: 4,
      }),
    ).toEqual({
      progressLabel: "Track 5 · 50%",
      progressPercent: 50,
    });
  });

  it("formats TV continue episode label", () => {
    expect(
      formatTvContinueProgressLabel({
        seasonNumber: 1,
        episodeNumber: 5,
        progressPercent: 42,
      }),
    ).toEqual({
      progressLabel: "Season 1 · Episode 5 · 42%",
      progressPercent: 42,
    });
  });
});
