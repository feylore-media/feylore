import type { GoalRecord } from "./goals.js";

export function formatGoalPresentation(
  goal: Pick<GoalRecord, "domains" | "metric" | "target">,
): string {
  const domain = goal.domains;
  const verb = domain.includes("movies") || domain.includes("tv")
    ? "Watch"
    : domain.includes("audiobooks") || domain.includes("podcasts") || domain.includes("music")
      ? "Listen to"
      : "Read";
  const noun = goal.metric === "episodes"
    ? domain.includes("podcasts") ? "podcast episodes" : "TV episodes"
    : goal.metric === "albums"
      ? "albums"
      : goal.metric === "movies"
        ? "movies"
        : goal.metric === "pages"
          ? "pages"
          : goal.metric === "hours"
            ? "hours"
            : goal.metric === "minutes"
              ? "minutes"
              : domain.length > 1 ? "things across any media" : "books";
  return `${verb} ${goal.target} ${noun}`;
}

export function formatGoalConditions(goal: GoalRecord): string[] {
  const conditions: string[] = [];
  if (goal.domains.length > 0) {
    conditions.push(goal.domains.length > 1 ? goal.domains.join(" · ") : goal.domains[0]!);
  }
  if (goal.rule?.type === "predicate") {
    conditions.push(`${goal.rule.field} ${goal.rule.operator} ${String(goal.rule.value ?? "")}`);
  }
  return conditions;
}
