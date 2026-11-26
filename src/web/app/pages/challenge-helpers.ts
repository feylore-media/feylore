import type { ChallengeRecord } from "@shared/challenges";

/* Shared challenge text helpers (kept out of component files for fast refresh). */

export function objectiveSummary(objective: {
  target: number;
  metric: string;
  domains: string[];
}): string {
  const domains =
    objective.domains.length > 0 ? objective.domains.join(" · ") : "any media";
  return `${objective.target} ${objective.metric} — ${domains}`;
}

export function challengeSummary(
  challenge: ChallengeRecord,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (challenge.format === "bingo" && challenge.bingoBoard) {
    return t("bingoSummary", {
      size: challenge.bingoBoard.size,
      victory:
        challenge.bingoBoard.victory === "blackout"
          ? t("victoryBlackout")
          : challenge.bingoBoard.victory === "n_lines"
            ? `${t("victoryNLines")} (${challenge.bingoBoard.victoryLines ?? 1})`
            : t("victoryLine"),
    });
  }
  if (challenge.format === "quest" && challenge.questGraph) {
    return t("questSummary", { nodes: challenge.questGraph.nodes.length });
  }
  return challenge.objectives.map(objectiveSummary).join("; ");
}

export function displayDate(value: string | null, fallback = "") {
  if (!value) return fallback;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
