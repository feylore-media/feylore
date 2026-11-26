import type { CSSProperties } from "react";
import type { GoalRuleExpression } from "@shared/goals";
import { getBingoStyle, type BingoStyleDefinition } from "@shared/challenges";

/* Shared Bingo web helpers (kept out of component files for fast refresh). */

export type BingoMode =
  "read" | "listen" | "watch" | "tv" | "podcast" | "music" | "any";

export const BINGO_MODE_DOMAINS: Record<BingoMode, string[]> = {
  read: ["books"],
  listen: ["audiobooks"],
  watch: ["movies"],
  tv: ["tv"],
  podcast: ["podcasts"],
  music: ["music"],
  any: ["books", "audiobooks", "movies", "tv", "podcasts", "music"],
};

export const BINGO_MODE_METRIC: Record<BingoMode, string> = {
  read: "works",
  listen: "works",
  watch: "movies",
  tv: "episodes",
  podcast: "episodes",
  music: "albums",
  any: "works",
};

export function bingoModeForDomains(domains: string[]): BingoMode {
  if (domains.includes("movies")) return "watch";
  if (domains.includes("tv")) return "tv";
  if (domains.includes("podcasts")) return "podcast";
  if (domains.includes("music")) return "music";
  if (domains.includes("audiobooks") && domains.includes("books")) return "any";
  if (domains.includes("audiobooks")) return "listen";
  return "read";
}

export interface BingoCondition {
  field: string;
  operator: string;
  value: string;
}

export function flattenBingoConditions(
  rule: GoalRuleExpression | null | undefined,
): BingoCondition[] {
  if (!rule) return [];
  if (rule.type === "predicate") {
    return [
      {
        field: rule.field,
        operator: rule.operator,
        value: String(rule.value ?? ""),
      },
    ];
  }
  return rule.children.flatMap((child) => flattenBingoConditions(child));
}

export interface SquareDraft {
  key: string;
  label: string;
  mode: BingoMode;
  target: number;
  groupOperator: "and" | "or";
  conditions: BingoCondition[];
  freeSpace: boolean;
}

export interface BingoDraft {
  size: 3 | 4 | 5;
  victory: "line" | "n_lines" | "blackout";
  victoryLines: number;
  styleKey: string;
  squares: SquareDraft[];
}

let draftKey = 0;
export function freshSquare(): SquareDraft {
  draftKey += 1;
  return {
    key: `square-${Date.now()}-${draftKey}`,
    label: "",
    mode: "read",
    target: 1,
    groupOperator: "and",
    conditions: [],
    freeSpace: false,
  };
}

export function bingoDraftToBoardInput(draft: BingoDraft) {
  return {
    size: draft.size,
    victory: draft.victory,
    victoryLines:
      draft.victory === "n_lines" ? Math.max(1, draft.victoryLines) : undefined,
    styleKey: draft.styleKey,
    squares: draft.squares.map((square, index) => ({
      position: index,
      label: square.label.trim() || `Square ${index + 1}`,
      freeSpace: square.freeSpace,
      objective: square.freeSpace
        ? undefined
        : {
            metric: BINGO_MODE_METRIC[square.mode],
            aggregation: { kind: "count" },
            target: Math.max(1, square.target),
            activity: "finish",
            basis: "completed",
            domains: BINGO_MODE_DOMAINS[square.mode],
            rule:
              square.conditions.length > 0
                ? {
                    type: "group",
                    operator: square.groupOperator,
                    children: square.conditions.map((condition) => ({
                      type: "predicate",
                      field: condition.field,
                      operator: condition.operator,
                      value: condition.value,
                    })),
                  }
                : undefined,
          },
    })),
  };
}

const TOKEN_VARS: Record<keyof BingoStyleDefinition["tokens"], string> = {
  frame: "--bingo-frame",
  background: "--bingo-background",
  cell: "--bingo-cell",
  cellText: "--bingo-cell-text",
  freeSpace: "--bingo-free",
  completed: "--bingo-completed",
  completedText: "--bingo-completed-text",
  line: "--bingo-line",
};

/** Registry tokens with optional presentation token overrides. */
export function bingoBoardVars(board: {
  styleKey: string;
  presentation: Record<string, unknown> | null;
}): CSSProperties {
  const style = getBingoStyle(board.styleKey);
  const overrides = (board.presentation?.tokens ?? {}) as Record<
    string,
    unknown
  >;
  const vars: Record<string, string> = {};
  for (const [token, cssVar] of Object.entries(TOKEN_VARS)) {
    const override = overrides[token];
    const base = style.tokens[token as keyof typeof style.tokens];
    vars[cssVar] =
      typeof override === "string" && override.length > 0 ? override : base;
  }
  return vars as CSSProperties;
}
