import type { PlaybackLocator } from "../../../shared/playback.js";
import { isPlaybackComplete } from "../../../shared/playback.js";

export interface EpisodeOrderFields {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  sortOrder: number;
}

export type EpisodeProgressEntry =
  | PlaybackLocator
  | {
      positionSeconds?: number;
      durationSeconds?: number;
      completed?: boolean;
    }
  | null
  | undefined;

function isEpisodeCompleted(progress: EpisodeProgressEntry): boolean {
  if (!progress) return false;
  if ("completed" in progress && progress.completed) return true;
  const positionSeconds =
    "positionSeconds" in progress ? progress.positionSeconds : undefined;
  const durationSeconds =
    "durationSeconds" in progress ? progress.durationSeconds : undefined;
  if (
    positionSeconds != null &&
    durationSeconds != null &&
    isPlaybackComplete(positionSeconds, durationSeconds)
  ) {
    return true;
  }
  return false;
}

function hasMeaningfulProgress(progress: EpisodeProgressEntry): boolean {
  if (!progress || isEpisodeCompleted(progress)) return false;
  const positionSeconds =
    "positionSeconds" in progress ? progress.positionSeconds : undefined;
  return (positionSeconds ?? 0) > 0;
}

function effectiveSeasonNumber(
  seasonNumber: number,
  specialsAfterRegular: boolean,
): number {
  if (seasonNumber === 0 && specialsAfterRegular) {
    return Number.MAX_SAFE_INTEGER;
  }
  return seasonNumber;
}

export function compareEpisodes(
  a: EpisodeOrderFields,
  b: EpisodeOrderFields,
  options?: { specialsAfterRegular?: boolean },
): number {
  const specialsAfterRegular = options?.specialsAfterRegular ?? true;
  const seasonA = effectiveSeasonNumber(a.seasonNumber, specialsAfterRegular);
  const seasonB = effectiveSeasonNumber(b.seasonNumber, specialsAfterRegular);
  if (seasonA !== seasonB) return seasonA - seasonB;
  if (a.episodeNumber !== b.episodeNumber) {
    return a.episodeNumber - b.episodeNumber;
  }
  return a.sortOrder - b.sortOrder;
}

function isMidSpecial(
  episodes: EpisodeOrderFields[],
  progressMap: Map<string, EpisodeProgressEntry>,
): boolean {
  return episodes.some(
    (episode) =>
      episode.seasonNumber === 0 &&
      hasMeaningfulProgress(progressMap.get(episode.id)),
  );
}

function sortEpisodes(
  episodes: EpisodeOrderFields[],
  progressMap: Map<string, EpisodeProgressEntry>,
): EpisodeOrderFields[] {
  const specialsAfterRegular = !isMidSpecial(episodes, progressMap);
  return [...episodes].sort((a, b) =>
    compareEpisodes(a, b, { specialsAfterRegular }),
  );
}

export function getNextEpisode(
  episodes: EpisodeOrderFields[],
  currentId: string,
  progressMap: Map<string, EpisodeProgressEntry> = new Map(),
): EpisodeOrderFields | null {
  const ordered = sortEpisodes(episodes, progressMap);
  const index = ordered.findIndex((episode) => episode.id === currentId);
  if (index < 0 || index >= ordered.length - 1) return null;
  return ordered[index + 1] ?? null;
}

export function resolveContinueEpisode(
  episodes: EpisodeOrderFields[],
  progressMap: Map<string, EpisodeProgressEntry>,
): EpisodeOrderFields | null {
  const ordered = sortEpisodes(episodes, progressMap);

  for (const episode of ordered) {
    if (hasMeaningfulProgress(progressMap.get(episode.id))) {
      return episode;
    }
  }

  for (const episode of ordered) {
    const progress = progressMap.get(episode.id);
    if (!progress || !isEpisodeCompleted(progress)) {
      return episode;
    }
  }

  return null;
}

export function listEpisodesForQueue(
  episodes: EpisodeOrderFields[],
  startId: string,
  progressMap: Map<string, EpisodeProgressEntry> = new Map(),
): EpisodeOrderFields[] {
  const ordered = sortEpisodes(episodes, progressMap);
  const index = ordered.findIndex((episode) => episode.id === startId);
  if (index < 0) return [];
  return ordered.slice(index);
}

export function isEpisodeProgressCompleted(
  progress: EpisodeProgressEntry,
): boolean {
  return isEpisodeCompleted(progress);
}
