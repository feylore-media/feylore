import type { WorkSubjectType } from "./subject.js";

export type ClubPollDiscoverySource =
  | "tbr"
  | "club_queued"
  | "manual"
  | "library";

export interface ClubPollDiscoveryCandidate {
  workSubjectType: WorkSubjectType;
  workSubjectId: string;
  source: ClubPollDiscoverySource;
  tbrMemberCount?: number;
  score: number;
}

export function workSubjectKey(
  workSubjectType: string,
  workSubjectId: string,
): string {
  return `${workSubjectType}:${workSubjectId}`;
}

/** Merge duplicate works, keeping the highest-scoring candidate. */
export function rankPollDiscoveryCandidates(
  candidates: ClubPollDiscoveryCandidate[],
): ClubPollDiscoveryCandidate[] {
  const byKey = new Map<string, ClubPollDiscoveryCandidate>();
  for (const candidate of candidates) {
    const key = workSubjectKey(
      candidate.workSubjectType,
      candidate.workSubjectId,
    );
    const existing = byKey.get(key);
    if (!existing || candidate.score > existing.score) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

export function scoreTbrCandidate(tbrMemberCount: number): number {
  return 1000 + tbrMemberCount * 100;
}

export function scoreClubQueuedCandidate(): number {
  return 500;
}

export function scoreLibraryCandidate(libraryMemberCount: number): number {
  return 10 + libraryMemberCount;
}

export function pickPollWinner<T extends { id: string; voteCount: number; sortOrder: number }>(
  options: T[],
): T | null {
  const active = options.filter((option) => option.voteCount >= 0);
  if (active.length === 0) return null;

  return active.reduce((best, option) => {
    if (option.voteCount > best.voteCount) return option;
    if (option.voteCount < best.voteCount) return best;
    return option.sortOrder < best.sortOrder ? option : best;
  });
}
