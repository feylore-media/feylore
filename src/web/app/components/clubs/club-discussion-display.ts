import type { TFunction } from "i18next";
import type { ClubDiscussionAnchorEmphasis } from "@shared/clubs";

export function anchorEmphasisLabel(
  emphasis: ClubDiscussionAnchorEmphasis,
  t: TFunction<"clubs">,
): string | null {
  if (emphasis === "current") return t("anchorCurrent");
  if (emphasis === "last_check_in") return t("anchorLastCheckIn");
  if (emphasis === "recent") return t("anchorRecent");
  return null;
}

export function anchorMessageLine(
  messageCount: number,
  t: TFunction<"clubs">,
): string {
  if (messageCount <= 0) return t("noMessages");
  return t("messageCount", { count: messageCount });
}
