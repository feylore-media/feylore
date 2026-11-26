import {
  compareConsumptionToProgress,
  extractChapterNumber,
} from "../../../shared/club-spoiler.js";
import { isReadingProgressLocator } from "../../../shared/progress-locator.js";
import type { ProgressLocator } from "../../../shared/progress-locator.js";
import type { MediaLocation } from "../../../shared/media-location.js";
import type { ConsumptionTarget } from "../../../shared/clubs.js";

export function safeLocationLabel(
  location: MediaLocation | null,
  consumption?: ConsumptionTarget | null,
): string {
  if (location?.progression !== undefined)
    return `Progress ${Math.round(location.progression * 100)}%`;
  if (
    consumption?.kind === "chapter" ||
    consumption?.kind === "page" ||
    consumption?.kind === "episode"
  )
    return `${consumption.kind} ${consumption.start}`;
  if (
    location?.kind === "chapter" ||
    location?.kind === "page" ||
    location?.kind === "timestamp" ||
    location?.kind === "episode"
  )
    return location.position === undefined
      ? location.kind
      : `${location.kind} ${location.position}`;
  return location?.kind === "final" ? "Final discussion" : "General discussion";
}

/** Unknown progress fails closed. Custom chapter titles/references are never labels. */
export function canSeeClubLocation(
  progress: ProgressLocator | null,
  boundary: MediaLocation | null,
  consumption?: ConsumptionTarget | null,
): boolean {
  if (boundary?.kind === "general" || boundary?.kind === "front_matter")
    return true;
  if (boundary?.progression !== undefined)
    return (
      progress !== null &&
      isReadingProgressLocator(progress) &&
      (progress.totalProgression ?? 0) >= boundary.progression
    );
  if (boundary?.kind === "final")
    return (
      progress !== null &&
      isReadingProgressLocator(progress) &&
      (progress.totalProgression ?? 0) >= 0.99
    );
  if (boundary?.kind === "chapter" && boundary.position !== undefined)
    return (
      progress !== null &&
      isReadingProgressLocator(progress) &&
      (extractChapterNumber(progress.title ?? "") ?? 0) >= boundary.position
    );
  if (boundary?.kind === "page" && boundary.position !== undefined)
    return (
      progress !== null &&
      isReadingProgressLocator(progress) &&
      (progress.displayPage ?? 0) >= boundary.position
    );
  if (consumption)
    return (
      compareConsumptionToProgress(consumption, {
        progress,
        tvContinue: null,
      }) === "at_or_after"
    );
  // Unlocated read-specific text may contain spoilers. Authors must mark general explicitly.
  return false;
}
