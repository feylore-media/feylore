import type { AppConfig } from "../../config.js";

export interface ReadingSessionPolicy {
  qualificationSeconds: number;
  inactivitySeconds: number;
  maxActiveBurstSeconds: number;
}

export function getReadingSessionPolicy(
  config: AppConfig,
): ReadingSessionPolicy {
  return {
    qualificationSeconds: config.READING_SESSION_QUALIFICATION_SECONDS,
    inactivitySeconds: config.READING_SESSION_INACTIVITY_SECONDS,
    maxActiveBurstSeconds: config.READING_SESSION_MAX_ACTIVE_BURST_SECONDS,
  };
}
