import type { CSSProperties } from "react";
import type { GoalRuleExpression } from "@shared/goals";
import { getQuestStyle, type QuestStyleDefinition } from "@shared/challenges";

/* Shared Quest web helpers (kept out of component files for fast refresh). */

export type QuestMode =
  | "read"
  | "listen"
  | "watch"
  | "tv"
  | "podcast"
  | "music"
  | "any";

export const QUEST_MODE_DOMAINS: Record<QuestMode, string[]> = {
  read: ["books"],
  listen: ["audiobooks"],
  watch: ["movies"],
  tv: ["tv"],
  podcast: ["podcasts"],
  music: ["music"],
  any: ["books", "audiobooks", "movies", "tv", "podcasts", "music"],
};

export const QUEST_MODE_METRIC: Record<QuestMode, string> = {
  read: "works",
  listen: "works",
  watch: "movies",
  tv: "episodes",
  podcast: "episodes",
  music: "albums",
  any: "works",
};

export function questModeForDomains(domains: string[]): QuestMode {
  if (domains.includes("movies")) return "watch";
  if (domains.includes("tv")) return "tv";
  if (domains.includes("podcasts")) return "podcast";
  if (domains.includes("music")) return "music";
  if (domains.includes("audiobooks") && domains.includes("books"))
    return "any";
  if (domains.includes("audiobooks")) return "listen";
  return "read";
}

export interface QuestCondition {
  field: string;
  operator: string;
  value: string;
}

export function flattenQuestConditions(
  rule: GoalRuleExpression | null | undefined,
): QuestCondition[] {
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
  return rule.children.flatMap((child) => flattenQuestConditions(child));
}

export type QuestNodeKind = "start" | "objective" | "junction" | "finish";

export interface QuestNodeDraft {
  key: string;
  kind: QuestNodeKind;
  label: string;
  optional: boolean;
  join: "any" | "all";
  x: number;
  y: number;
  mode: QuestMode;
  target: number;
  groupOperator: "and" | "or";
  conditions: QuestCondition[];
}

export interface QuestEdgeDraft {
  from: string;
  to: string;
}

export interface QuestDraft {
  styleKey: string;
  nodes: QuestNodeDraft[];
  edges: QuestEdgeDraft[];
}

/** Canvas space for the map editor/viewer. Position is presentation only. */
export const QUEST_CANVAS_WIDTH = 1000;
export const QUEST_CANVAS_HEIGHT = 600;

let draftKey = 0;
function nextKey(prefix: string): string {
  draftKey += 1;
  return `${prefix}-${Date.now().toString(36)}-${draftKey}`;
}

export function freshObjectiveNode(
  x = QUEST_CANVAS_WIDTH / 2,
  y = QUEST_CANVAS_HEIGHT / 2,
  optional = false,
): QuestNodeDraft {
  return {
    key: nextKey("node"),
    kind: "objective",
    label: "",
    optional,
    join: "any",
    x,
    y,
    mode: "read",
    target: 1,
    groupOperator: "and",
    conditions: [],
  };
}

export function freshJunctionNode(
  x = QUEST_CANVAS_WIDTH / 2,
  y = QUEST_CANVAS_HEIGHT / 2,
): QuestNodeDraft {
  return {
    key: nextKey("junction"),
    kind: "junction",
    label: "",
    optional: false,
    join: "any",
    x,
    y,
    mode: "read",
    target: 1,
    groupOperator: "and",
    conditions: [],
  };
}

/** A minimal valid quest: Start → objective → Finish. */
export function defaultQuestDraft(): QuestDraft {
  const middle: QuestNodeDraft = {
    key: nextKey("node"),
    kind: "objective",
    label: "",
    optional: false,
    join: "any",
    x: QUEST_CANVAS_WIDTH / 2,
    y: QUEST_CANVAS_HEIGHT / 2,
    mode: "read",
    target: 1,
    groupOperator: "and",
    conditions: [],
  };
  return {
    styleKey: "default",
    nodes: [
      {
        key: "start",
        kind: "start",
        label: "Start",
        optional: false,
        join: "any",
        x: 80,
        y: QUEST_CANVAS_HEIGHT / 2,
        mode: "read",
        target: 1,
        groupOperator: "and",
        conditions: [],
      },
      middle,
      {
        key: "finish",
        kind: "finish",
        label: "Finish",
        optional: false,
        join: "any",
        x: QUEST_CANVAS_WIDTH - 80,
        y: QUEST_CANVAS_HEIGHT / 2,
        mode: "read",
        target: 1,
        groupOperator: "and",
        conditions: [],
      },
    ],
    edges: [
      { from: "start", to: middle.key },
      { from: middle.key, to: "finish" },
    ],
  };
}

/** Fill the default linear edges for a freshly created draft. */
export function defaultQuestEdgesForNodes(
  nodes: QuestNodeDraft[],
): QuestEdgeDraft[] {
  if (nodes.length < 2) return [];
  const start = nodes.find((node) => node.kind === "start");
  const finish = nodes.find((node) => node.kind === "finish");
  const middles = nodes.filter(
    (node) => node.kind !== "start" && node.kind !== "finish",
  );
  if (!start || !finish) return [];
  if (middles.length === 0) return [{ from: start.key, to: finish.key }];
  const edges: QuestEdgeDraft[] = [{ from: start.key, to: middles[0]!.key }];
  for (let i = 0; i < middles.length - 1; i++) {
    edges.push({ from: middles[i]!.key, to: middles[i + 1]!.key });
  }
  edges.push({ from: middles[middles.length - 1]!.key, to: finish.key });
  return edges;
}

export function questDraftToGraphInput(draft: QuestDraft) {
  return {
    styleKey: draft.styleKey,
    nodes: draft.nodes.map((node) => ({
      key: node.key,
      kind: node.kind,
      label: node.label.trim() || defaultNodeLabel(node),
      optional: node.kind === "objective" ? node.optional : false,
      join: node.join,
      position: {
        x: Math.max(0, Math.min(2000, Math.round(node.x))),
        y: Math.max(0, Math.min(2000, Math.round(node.y))),
      },
      objective:
        node.kind === "objective"
          ? {
              metric: QUEST_MODE_METRIC[node.mode],
              aggregation: { kind: "count" },
              target: Math.max(1, node.target),
              activity: "finish",
              basis: "completed",
              domains: QUEST_MODE_DOMAINS[node.mode],
              rule:
                node.conditions.length > 0
                  ? {
                      type: "group",
                      operator: node.groupOperator,
                      children: node.conditions.map((condition) => ({
                        type: "predicate",
                        field: condition.field,
                        operator: condition.operator,
                        value: condition.value,
                      })),
                    }
                  : undefined,
            }
          : undefined,
    })),
    edges: draft.edges.map((edge) => ({ from: edge.from, to: edge.to })),
  };
}

function defaultNodeLabel(node: QuestNodeDraft): string {
  if (node.kind === "start") return "Start";
  if (node.kind === "finish") return "Finish";
  if (node.kind === "junction") return "Junction";
  return node.optional ? "Side quest" : "Objective";
}

/**
 * Lightweight client-side issue hints. The server remains authoritative;
 * this only keeps the editor honest before saving.
 */
export function questDraftIssues(draft: QuestDraft): string[] {
  const issues: string[] = [];
  const keys = new Set(draft.nodes.map((node) => node.key));
  const starts = draft.nodes.filter((node) => node.kind === "start");
  const finishes = draft.nodes.filter((node) => node.kind === "finish");
  if (starts.length !== 1) issues.push("exactly one start");
  if (finishes.length !== 1) issues.push("exactly one finish");
  for (const edge of draft.edges) {
    if (!keys.has(edge.from) || !keys.has(edge.to)) {
      issues.push("edges must connect nodes in this map");
      break;
    }
    if (edge.from === edge.to) {
      issues.push("a node cannot depend on itself");
      break;
    }
  }
  const start = starts[0];
  const finish = finishes[0];
  if (start && finish) {
    const outgoing = new Map<string, string[]>();
    for (const node of draft.nodes) outgoing.set(node.key, []);
    for (const edge of draft.edges) outgoing.get(edge.from)?.push(edge.to);
    const reached = new Set([start.key]);
    const frontier = [start.key];
    while (frontier.length > 0) {
      const current = frontier.shift()!;
      for (const next of outgoing.get(current) ?? []) {
        if (!reached.has(next)) {
          reached.add(next);
          frontier.push(next);
        }
      }
    }
    if (!reached.has(finish.key)) issues.push("finish reachable from start");
    for (const node of draft.nodes) {
      if (!reached.has(node.key)) {
        issues.push("every node reachable from start");
        break;
      }
    }
  }
  return [...new Set(issues)];
}

const TOKEN_VARS: Record<keyof QuestStyleDefinition["tokens"], string> = {
  mapBackground: "--quest-map-background",
  path: "--quest-path",
  pathUnlocked: "--quest-path-unlocked",
  node: "--quest-node",
  nodeText: "--quest-node-text",
  locked: "--quest-locked",
  available: "--quest-available",
  completed: "--quest-completed",
  completedText: "--quest-completed-text",
  start: "--quest-start",
  finish: "--quest-finish",
  optional: "--quest-optional",
};

/** Registry tokens with optional presentation token overrides. */
export function questMapVars(graph: {
  styleKey: string;
  presentation: Record<string, unknown> | null;
}): CSSProperties {
  const style = getQuestStyle(graph.styleKey);
  const overrides = (graph.presentation?.tokens ?? {}) as Record<
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
