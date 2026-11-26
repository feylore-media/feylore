import type { TFunction } from "i18next";
import type { ClubContext, ClubListItem } from "@shared/clubs";
import type { WorkSubjectType } from "@shared/subject";

const CONSUMPTION_LABEL_KEYS: Record<ClubContext, string> = {
  general: "currentWorkLabel",
  book: "currentlyReading",
  video: "currentlyWatching",
  ttrpg: "currentCampaign",
};

export function clubWorkSectionLabel(
  context: ClubContext,
  workSubjectType: WorkSubjectType | null | undefined,
  t: TFunction<"clubs">,
): string {
  if (workSubjectType === "audiobook") {
    return t("currentlyListening");
  }
  const labelKey = CONSUMPTION_LABEL_KEYS[context];
  return t(labelKey);
}

export function clubConsumptionLine(
  club: ClubListItem,
  t: TFunction<"clubs">,
): string | null {
  if (!club.currentWork) return null;
  const labelKey = CONSUMPTION_LABEL_KEYS[club.context];
  return `${t(labelKey)} · ${club.currentWork.title}`;
}

export function clubActivityLine(
  club: ClubListItem,
  t: TFunction<"clubs">,
  formatRelativeTime: (iso: string) => string,
): string {
  if (!club.lastActivityAt) {
    return t("noRecentActivity");
  }
  return t("lastActivity", {
    time: formatRelativeTime(club.lastActivityAt),
  });
}
