import type { ReadingLocator } from "../../../shared/reading-progress.js";
import {
  deriveTotalProgression,
  locatorCompletenessScore,
  mergeReadingLocators,
} from "../../../shared/reading-progress.js";

export type ProgressConflictInput = {
  storedClientUpdatedAt: Date | null;
  storedVersion: number;
  storedLocator: ReadingLocator;
  storedIdempotencyKey: string | null;
  incomingClientUpdatedAt: Date | null;
  incomingIdempotencyKey: string | null;
  incomingLocator: ReadingLocator;
};

export type ProgressConflictResult =
  | { action: "accept"; locator: ReadingLocator }
  | { action: "reject_stale" }
  | { action: "idempotent" };

export function resolveProgressConflict(
  input: ProgressConflictInput,
): ProgressConflictResult {
  if (
    input.incomingIdempotencyKey &&
    input.storedIdempotencyKey === input.incomingIdempotencyKey
  ) {
    return { action: "idempotent" };
  }

  if (input.incomingClientUpdatedAt && input.storedClientUpdatedAt) {
    if (input.incomingClientUpdatedAt < input.storedClientUpdatedAt) {
      return { action: "reject_stale" };
    }
    if (
      input.incomingClientUpdatedAt.getTime() ===
      input.storedClientUpdatedAt.getTime()
    ) {
      const incomingProg = deriveTotalProgression(input.incomingLocator) ?? 0;
      const storedProg = deriveTotalProgression(input.storedLocator) ?? 0;
      if (incomingProg < storedProg) {
        return { action: "reject_stale" };
      }
      if (incomingProg === storedProg) {
        const incomingScore = locatorCompletenessScore(input.incomingLocator);
        const storedScore = locatorCompletenessScore(input.storedLocator);
        if (incomingScore < storedScore) {
          return { action: "reject_stale" };
        }
      }
    }
  }

  const locator = input.storedLocator
    ? mergeReadingLocators(input.storedLocator, input.incomingLocator)
    : input.incomingLocator;

  return { action: "accept", locator };
}
