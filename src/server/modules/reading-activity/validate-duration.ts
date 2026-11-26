import type { ReadingSessionVisibility } from "../../../shared/reading-sessions.js";
import type { ReadingSessionPolicy } from "../reading-sessions/policy.js";

const CLOCK_SKEW_TOLERANCE_SECONDS = 1;

export function validateActivityDuration(
  requestedDuration: number,
  policy: ReadingSessionPolicy,
  visibility?: ReadingSessionVisibility,
  startedAt?: Date,
  referenceTime: Date = new Date(),
): number {
  if (!Number.isFinite(requestedDuration) || requestedDuration < 0) {
    throw new Error("INVALID_DURATION");
  }

  if (visibility && visibility !== "active") {
    return 0;
  }

  const capped = Math.min(
    requestedDuration,
    policy.maxActiveBurstSeconds,
  );

  if (startedAt) {
    const maxElapsed =
      Math.floor((referenceTime.getTime() - startedAt.getTime()) / 1000) +
      CLOCK_SKEW_TOLERANCE_SECONDS;
    return Math.min(capped, Math.max(0, maxElapsed));
  }

  return capped;
}

export function maxSessionActiveDuration(
  sessionStartedAt: Date,
  endedAt: Date | null,
  referenceTime: Date = new Date(),
): number {
  const end = endedAt ?? referenceTime;
  return (
    Math.floor((end.getTime() - sessionStartedAt.getTime()) / 1000) +
    CLOCK_SKEW_TOLERANCE_SECONDS
  );
}
