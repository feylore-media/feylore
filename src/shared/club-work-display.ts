import type { ReadingLocator } from "./books.js";
import type { PlaybackLocator } from "./playback.js";

export function formatBookProgressLabel(locator: ReadingLocator): {
  progressLabel?: string;
  progressPercent?: number;
} {
  const title = locator.title?.trim();
  const progression = locator.totalProgression ?? locator.progression;
  const hasPercent =
    progression !== undefined && progression >= 0 && progression <= 1;
  const percent = hasPercent ? Math.round(progression * 100) : undefined;

  if (title && percent !== undefined) {
    return { progressLabel: `${title} · ${percent}%`, progressPercent: percent };
  }
  if (title) {
    return { progressLabel: title };
  }
  if (percent !== undefined) {
    return { progressLabel: `${percent}%`, progressPercent: percent };
  }
  return {};
}

export function formatPlaybackProgressLabel(locator: PlaybackLocator): {
  progressLabel?: string;
  progressPercent?: number;
} {
  if (locator.trackIndex !== undefined) {
    const trackNumber = locator.trackIndex + 1;
    if (locator.durationSeconds && locator.durationSeconds > 0) {
      const percent = Math.round(
        (locator.positionSeconds / locator.durationSeconds) * 100,
      );
      return {
        progressLabel: `Track ${trackNumber} · ${percent}%`,
        progressPercent: percent,
      };
    }
    return { progressLabel: `Track ${trackNumber}` };
  }

  if (locator.durationSeconds && locator.durationSeconds > 0) {
    const percent = Math.round(
      (locator.positionSeconds / locator.durationSeconds) * 100,
    );
    return { progressLabel: `${percent}%`, progressPercent: percent };
  }

  return {};
}

export function formatTvContinueProgressLabel(input: {
  seasonNumber: number;
  episodeNumber: number;
  progressPercent?: number | null;
}): { progressLabel: string; progressPercent?: number } {
  const base = `Season ${input.seasonNumber} · Episode ${input.episodeNumber}`;
  if (
    input.progressPercent !== undefined &&
    input.progressPercent !== null &&
    input.progressPercent > 0 &&
    input.progressPercent < 100
  ) {
    return {
      progressLabel: `${base} · ${input.progressPercent}%`,
      progressPercent: input.progressPercent,
    };
  }
  return { progressLabel: base };
}
