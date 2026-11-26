/**
 * KOReader / KOSync adapter boundary (Phase 2).
 * Maps external formats into Feylore's canonical progress/activity/session model.
 * Do not reproduce KOReader schema as Feylore domain tables.
 */
export type KosyncProgressPayload = {
  document: string;
  progress: string;
  percentage: number;
  device?: string;
  device_id?: string;
};

export interface KosyncAdapter {
  mapProgressToReadingLocator(
    payload: KosyncProgressPayload,
  ): import("../../../../shared/reading-progress.js").ReadingLocator;
}
