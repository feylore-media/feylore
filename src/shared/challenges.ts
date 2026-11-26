import type { GoalProgress } from "./goal-evaluation.js";
import { z } from "zod";
import {
  goalAggregationSchema,
  goalActivitySchema,
  goalActivityBasisSchema,
  goalMetricSchema,
  goalRuleExpressionSchema,
  type GoalAggregation,
  type GoalRuleExpression,
} from "./goals.js";

/**
 * Challenges 1.0 — Foundation + Simple.
 *
 * Core challenge/objective APIs are format-agnostic: they must not assume
 * one objective, linear progression, or numeric-total completion. The
 * Simple format imposes its one-objective behavior at the service/validation
 * layer only (the database permits many objectives per challenge so Bingo
 * squares and Quest nodes can compose rule-backed objectives later).
 */

export const CHALLENGE_FORMATS = ["simple", "bingo", "quest"] as const;
export type ChallengeFormat = (typeof CHALLENGE_FORMATS)[number];

export const CHALLENGE_VISIBILITY_VALUES = [
  "public",
  "private",
  "club",
] as const;
export type ChallengeVisibility = (typeof CHALLENGE_VISIBILITY_VALUES)[number];

export const CHALLENGE_JOIN_POLICIES = [
  "open",
  "invite_only",
  "club_members",
] as const;
export type ChallengeJoinPolicy = (typeof CHALLENGE_JOIN_POLICIES)[number];

export const CHALLENGE_STATES = [
  "draft",
  "upcoming",
  "active",
  "completed",
  "ended",
  "cancelled",
] as const;
export type ChallengeState = (typeof CHALLENGE_STATES)[number];

export const CHALLENGE_PARTICIPANT_STATES = [
  "joined",
  "left",
  "completed",
] as const;
export type ChallengeParticipantState =
  (typeof CHALLENGE_PARTICIPANT_STATES)[number];

export const challengeFormatSchema = z.enum(CHALLENGE_FORMATS);
export const challengeVisibilitySchema = z.enum(CHALLENGE_VISIBILITY_VALUES);
export const challengeJoinPolicySchema = z.enum(CHALLENGE_JOIN_POLICIES);
export const challengeStateSchema = z.enum(CHALLENGE_STATES);

/** Reusable evaluation primitive — Goals vocabulary, challenge time boundary. */
export const challengeObjectiveSchema = z.object({
  metric: goalMetricSchema,
  aggregation: goalAggregationSchema.default({ kind: "count" }),
  target: z.number().int().positive(),
  activity: goalActivitySchema.default("finish"),
  basis: goalActivityBasisSchema.default("completed"),
  domains: z.array(z.string()).default([]),
  rule: goalRuleExpressionSchema.optional(),
});

export type ChallengeObjectiveInput = z.infer<typeof challengeObjectiveSchema>;

export interface ChallengeObjective extends ChallengeObjectiveInput {
  id: string;
  challengeId: string;
  sortOrder: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Bingo 1.1 — board layer referencing objectives.                     */
/*                                                                     */
/* A board belongs to one challenge and is identical for every         */
/* participant (no per-participant shuffling in 1.1). Each normal      */
/* square references one challenge_objectives row; a free space is a   */
/* square type with no objective — never a fake auto-completed         */
/* objective — so candidates, stats, and achievement provenance stay   */
/* clean. Completion flows objective → square → board → victory →      */
/* participant completion.                                             */
/* ------------------------------------------------------------------ */

export const BINGO_BOARD_SIZES = [3, 4, 5] as const;
export type BingoBoardSize = (typeof BINGO_BOARD_SIZES)[number];

export const BINGO_VICTORIES = ["line", "n_lines", "blackout"] as const;
export type BingoVictory = (typeof BINGO_VICTORIES)[number];

export const bingoBoardSizeSchema = z.union([
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export const bingoVictorySchema = z.enum(BINGO_VICTORIES);

export const bingoSquareInputSchema = z
  .object({
    /** Board position, row-major: 0 .. size*size - 1. */
    position: z.number().int().min(0).max(24),
    /** Creator-written square label, e.g. "Read 3 horror books". */
    label: z.string().min(1).max(120),
    /** Free spaces complete automatically and carry no objective. */
    freeSpace: z.boolean().default(false),
    objective: challengeObjectiveSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.freeSpace && value.objective !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Free spaces carry no objective",
        path: ["objective"],
      });
    }
    if (!value.freeSpace && value.objective === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bingo squares require an objective",
        path: ["objective"],
      });
    }
  });

export type BingoSquareInput = z.infer<typeof bingoSquareInputSchema>;

/** Total completable lines (rows + columns + 2 diagonals) for a size. */
export function bingoTotalLines(size: BingoBoardSize): number {
  return 2 * size + 2;
}

export const bingoBoardInputSchema = z
  .object({
    size: bingoBoardSizeSchema,
    victory: bingoVictorySchema.default("line"),
    /**
     * Required when victory is "n_lines": how many lines complete the
     * board. Bounded by the board's total line count.
     */
    victoryLines: z.number().int().min(1).max(12).nullable().optional(),
    squares: z.array(bingoSquareInputSchema).min(9).max(25),
    styleKey: z.string().min(1).max(80).default("default"),
    presentation: z.record(z.unknown()).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const total = value.size * value.size;
    if (value.squares.length !== total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A ${value.size}×${value.size} board requires exactly ${total} squares`,
        path: ["squares"],
      });
      return;
    }
    const positions = value.squares
      .map((square) => square.position)
      .sort((a, b) => a - b);
    for (let i = 0; i < total; i++) {
      if (positions[i] !== i) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Square positions must cover 0 .. size×size - 1 exactly once",
          path: ["squares"],
        });
        return;
      }
    }
    if (value.victory === "n_lines") {
      if (value.victoryLines == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "n_lines victory requires victoryLines",
          path: ["victoryLines"],
        });
      } else if (value.victoryLines > bingoTotalLines(value.size)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A ${value.size}×${value.size} board has at most ${bingoTotalLines(value.size)} lines`,
          path: ["victoryLines"],
        });
      }
    } else if (value.victoryLines != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "victoryLines applies only to n_lines victory",
        path: ["victoryLines"],
      });
    }
  });

export type BingoBoardInput = z.infer<typeof bingoBoardInputSchema>;

export interface BingoSquare {
  id: string;
  boardId: string;
  position: number;
  objectiveId: string | null;
  freeSpace: boolean;
  label: string;
  objective?: ChallengeObjective | null;
}

export interface BingoBoard {
  id: string;
  challengeId: string;
  size: BingoBoardSize;
  victory: BingoVictory;
  victoryLines: number | null;
  styleKey: string;
  presentation: Record<string, unknown> | null;
  squares: BingoSquare[];
}

/**
 * All lines of a board as position arrays: every row, every column, and
 * both diagonals. Rows, columns, and diagonals all count as lines.
 */
export function bingoLines(size: BingoBoardSize): number[][] {
  const lines: number[][] = [];
  for (let row = 0; row < size; row++) {
    lines.push(
      Array.from({ length: size }, (_, column) => row * size + column),
    );
  }
  for (let column = 0; column < size; column++) {
    lines.push(Array.from({ length: size }, (_, row) => row * size + column));
  }
  lines.push(Array.from({ length: size }, (_, i) => i * (size + 1)));
  lines.push(Array.from({ length: size }, (_, i) => (i + 1) * (size - 1)));
  return lines;
}

export interface BingoOutcome {
  /** Position arrays of the completed lines. */
  completedLines: number[][];
  linesCompleted: number;
  won: boolean;
}

/**
 * Pure board evaluation: square completion states → victory condition →
 * won. `completed` is indexed by board position; free spaces arrive
 * pre-marked true by the caller.
 */
export function evaluateBingoOutcome(input: {
  size: BingoBoardSize;
  victory: BingoVictory;
  victoryLines?: number | null;
  completed: boolean[];
}): BingoOutcome {
  const completedLines = bingoLines(input.size).filter((line) =>
    line.every((position) => input.completed[position] === true),
  );
  const linesCompleted = completedLines.length;
  let won = false;
  if (input.victory === "blackout") {
    won =
      input.completed.length >= input.size * input.size &&
      input.completed.slice(0, input.size * input.size).every(Boolean);
  } else if (input.victory === "n_lines") {
    won = linesCompleted >= (input.victoryLines ?? 1);
  } else {
    won = linesCompleted >= 1;
  }
  return { completedLines, linesCompleted, won };
}

/* ---------------- Bingo presentation (styles) ---------------------- */
/*
 * Boards persist a registry-backed styleKey plus optional presentation
 * overrides. Bingo styles are deliberately distinct from global Feylore
 * themes: they control the board frame, background, cells, free spaces,
 * completion states, and decorative treatment. 1.1 ships the default
 * style; the registry leaves room for a curated set later.
 */

export interface BingoStyleDefinition {
  key: string;
  name: string;
  description: string;
  tokens: {
    frame: string;
    background: string;
    cell: string;
    cellText: string;
    freeSpace: string;
    completed: string;
    completedText: string;
    line: string;
  };
}

export const BINGO_STYLE_REGISTRY: readonly BingoStyleDefinition[] = [
  {
    key: "default",
    name: "Default",
    description: "The standard Feylore bingo board.",
    tokens: {
      frame: "var(--bingo-frame, #2a2a35)",
      background: "var(--bingo-background, transparent)",
      cell: "var(--bingo-cell, #1c1c24)",
      cellText: "var(--bingo-cell-text, inherit)",
      freeSpace: "var(--bingo-free, #2e2a1e)",
      completed: "var(--bingo-completed, #27402c)",
      completedText: "var(--bingo-completed-text, inherit)",
      line: "var(--bingo-line, #7fb887)",
    },
  },
] as const;

export function getBingoStyle(key: string): BingoStyleDefinition {
  return (
    BINGO_STYLE_REGISTRY.find((style) => style.key === key) ??
    BINGO_STYLE_REGISTRY[0]!
  );
}

export function isBingoStyleKey(value: string): boolean {
  return BINGO_STYLE_REGISTRY.some((style) => style.key === value);
}

export type BingoSquareState = "completed" | "progressing" | "locked" | "free";

export interface BingoSquareView extends BingoSquare {
  progress: GoalProgress | null;
  state: BingoSquareState;
}

/** Participant-facing board: shared config plus the viewer's square states. */
export interface BingoBoardView extends Omit<BingoBoard, "squares"> {
  squares: BingoSquareView[];
  completedLines: number[][];
  linesCompleted: number;
  squaresCompleted: number;
  squaresTotal: number;
  won: boolean;
}

/* ------------------------------------------------------------------ */
/* Quest 1.2 — relational composition over the same objectives.        */
/*                                                                     */
/* A quest belongs to one challenge and is identical for every         */
/* participant. Objective nodes reference challenge_objectives rows;   */
/* start / junction / finish nodes carry no objective. The critical    */
/* semantic is reachability: a participant begins at Start, objective  */
/* nodes evaluate automatically through the Goals machinery,           */
/* completing prerequisites unlocks subsequent nodes, and reaching a   */
/* Finish node completes the Quest. Prerequisite logic is deliberately */
/* tiny: a node with incoming edges joins them with ANY (any incoming  */
/* predecessor completes the gate) or ALL (every incoming predecessor  */
/* must have completed). Optional objective nodes are side branches:   */
/* they never gate Finish and can award a milestone but never          */
/* contribute to reaching it. Node position is presentation only —     */
/* moving a node around the canvas must never change Quest rules.      */
/*                                                                     */
/* 1.2 invariants (enforced at the schema layer and re-checked by the  */
/* service): exactly one start, exactly one finish, finish reachable   */
/* from start, no cycles, no orphan required nodes, optional nodes     */
/* never gate required progress, start has no incoming, finish has no  */
/* outgoing, and every edge stays inside one graph.                    */
/* ------------------------------------------------------------------ */

export const QUEST_NODE_KINDS = [
  "start",
  "objective",
  "junction",
  "finish",
] as const;
export type QuestNodeKind = (typeof QUEST_NODE_KINDS)[number];

export const QUEST_JOINS = ["any", "all"] as const;
export type QuestJoin = (typeof QUEST_JOINS)[number];

export const questNodeKindSchema = z.enum(QUEST_NODE_KINDS);
export const questJoinSchema = z.enum(QUEST_JOINS);

export const questPositionSchema = z.object({
  x: z.number().min(0).max(2000),
  y: z.number().min(0).max(2000),
});

export type QuestPosition = z.infer<typeof questPositionSchema>;

export const questNodeInputSchema = z
  .object({
    /** Client-stable key used to wire edges; persisted alongside the id. */
    key: z.string().min(1).max(80),
    kind: questNodeKindSchema,
    /** Creator-written node label, e.g. "Read a fantasy book". */
    label: z.string().min(1).max(120),
    /** Side branches. Only objective nodes may be optional. */
    optional: z.boolean().default(false),
    /** How multiple incoming prerequisites combine. */
    join: questJoinSchema.default("any"),
    /** Canvas position — presentation only, never progression rules. */
    position: questPositionSchema,
    objective: challengeObjectiveSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "objective" && value.objective === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Objective nodes require an objective",
        path: ["objective"],
      });
    }
    if (value.kind !== "objective" && value.objective !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only objective nodes carry an objective",
        path: ["objective"],
      });
    }
    if (value.optional && value.kind !== "objective") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only objective nodes may be optional",
        path: ["optional"],
      });
    }
  });

export type QuestNodeInput = z.infer<typeof questNodeInputSchema>;

export const questEdgeInputSchema = z
  .object({
    /** Prerequisite node key. */
    from: z.string().min(1).max(80),
    /** Dependent node key. */
    to: z.string().min(1).max(80),
  })
  .superRefine((value, ctx) => {
    if (value.from === value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A node cannot depend on itself",
        path: ["to"],
      });
    }
  });

export type QuestEdgeInput = z.infer<typeof questEdgeInputSchema>;

export const QUEST_NODES_MAX = 30;
export const QUEST_EDGES_MAX = 80;

export const questGraphInputSchema = z
  .object({
    nodes: z.array(questNodeInputSchema).min(2).max(QUEST_NODES_MAX),
    edges: z.array(questEdgeInputSchema).max(QUEST_EDGES_MAX),
    styleKey: z.string().min(1).max(80).default("default"),
    presentation: z.record(z.unknown()).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const keys = value.nodes.map((node) => node.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quest node keys must be unique",
        path: ["nodes"],
      });
      return;
    }
    const byKey = new Map(value.nodes.map((node) => [node.key, node]));
    const starts = value.nodes.filter((node) => node.kind === "start");
    if (starts.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A quest requires exactly one start node",
        path: ["nodes"],
      });
    }
    const finishes = value.nodes.filter((node) => node.kind === "finish");
    if (finishes.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A quest requires exactly one finish node",
        path: ["nodes"],
      });
    }
    const seenEdges = new Set<string>();
    for (const edge of value.edges) {
      const from = byKey.get(edge.from);
      const to = byKey.get(edge.to);
      if (!from || !to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Quest edges must reference nodes in this graph",
          path: ["edges"],
        });
        return;
      }
      const pair = `${edge.from}→${edge.to}`;
      if (seenEdges.has(pair)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Quest edges must not repeat",
          path: ["edges"],
        });
        return;
      }
      seenEdges.add(pair);
      if (from.kind === "finish") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Finish nodes have no outgoing edges",
          path: ["edges"],
        });
        return;
      }
      if (to.kind === "start") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Start nodes have no incoming edges",
          path: ["edges"],
        });
        return;
      }
      if (from.optional && !(to.kind === "objective" && to.optional)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Optional nodes are side branches and must not gate required progress",
          path: ["edges"],
        });
        return;
      }
    }
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    for (const node of value.nodes) {
      outgoing.set(node.key, []);
      incoming.set(node.key, []);
    }
    for (const edge of value.edges) {
      outgoing.get(edge.from)?.push(edge.to);
      incoming.get(edge.to)?.push(edge.from);
    }
    // No cycles (Kahn's algorithm over the key graph).
    const indegree = new Map<string, number>();
    for (const node of value.nodes) {
      indegree.set(node.key, incoming.get(node.key)?.length ?? 0);
    }
    const queue = value.nodes
      .filter((node) => (indegree.get(node.key) ?? 0) === 0)
      .map((node) => node.key);
    let visited = 0;
    const order = [...queue];
    while (order.length > 0) {
      const current = order.shift()!;
      visited += 1;
      for (const next of outgoing.get(current) ?? []) {
        const remaining = (indegree.get(next) ?? 1) - 1;
        indegree.set(next, remaining);
        if (remaining === 0) order.push(next);
      }
    }
    if (visited !== value.nodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quest graphs must not contain cycles",
        path: ["edges"],
      });
      return;
    }
    const startKey = starts[0]?.key;
    const finishKey = finishes[0]?.key;
    if (startKey && finishKey) {
      // Finish must be reachable from Start.
      const reached = new Set<string>([startKey]);
      const frontier = [startKey];
      while (frontier.length > 0) {
        const current = frontier.shift()!;
        for (const next of outgoing.get(current) ?? []) {
          if (!reached.has(next)) {
            reached.add(next);
            frontier.push(next);
          }
        }
      }
      if (!reached.has(finishKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Finish must be reachable from Start",
          path: ["edges"],
        });
        return;
      }
      // No orphan required nodes: every required node is reachable from
      // Start and can reach Finish. Optional nodes must be attached
      // (reachable from Start) but may dead-end by design.
      const canReachFinish = new Set<string>([finishKey]);
      const reverse = [finishKey];
      while (reverse.length > 0) {
        const current = reverse.shift()!;
        for (const prev of incoming.get(current) ?? []) {
          if (!canReachFinish.has(prev)) {
            canReachFinish.add(prev);
            reverse.push(prev);
          }
        }
      }
      for (const node of value.nodes) {
        const isOptionalSide = node.kind === "objective" && node.optional;
        if (!reached.has(node.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Quest nodes must be reachable from Start",
            path: ["nodes"],
          });
          return;
        }
        if (!isOptionalSide && !canReachFinish.has(node.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Required quest nodes must be able to reach Finish",
            path: ["nodes"],
          });
          return;
        }
      }
    }
    for (const node of value.nodes) {
      if (node.kind === "junction") {
        const ins = incoming.get(node.key) ?? [];
        const outs = outgoing.get(node.key) ?? [];
        if (ins.length === 0 || outs.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Junction nodes must connect an incoming and outgoing path",
            path: ["nodes"],
          });
          return;
        }
      }
    }
  });

export type QuestGraphInput = z.infer<typeof questGraphInputSchema>;

export interface QuestNode {
  id: string;
  graphId: string;
  key: string;
  kind: QuestNodeKind;
  label: string;
  optional: boolean;
  join: QuestJoin;
  x: number;
  y: number;
  objectiveId: string | null;
  objective?: ChallengeObjective | null;
}

export interface QuestEdge {
  id: string;
  graphId: string;
  fromNodeId: string;
  toNodeId: string;
  fromKey: string;
  toKey: string;
}

export interface QuestGraph {
  id: string;
  challengeId: string;
  styleKey: string;
  presentation: Record<string, unknown> | null;
  nodes: QuestNode[];
  edges: QuestEdge[];
}

export type QuestNodeState = "locked" | "available" | "progressing" | "completed";

export interface QuestNodeView extends QuestNode {
  progress: GoalProgress | null;
  state: QuestNodeState;
  prerequisitesMet: boolean;
}

export interface QuestGraphView extends Omit<QuestGraph, "nodes"> {
  nodes: QuestNodeView[];
  requiredCompleted: number;
  requiredTotal: number;
  optionalCompleted: number;
  optionalTotal: number;
  won: boolean;
}

export interface QuestOutcomeNode {
  key: string;
  prerequisitesMet: boolean;
  completed: boolean;
  state: QuestNodeState;
}

export interface QuestOutcome {
  nodes: QuestOutcomeNode[];
  won: boolean;
}

/**
 * Pure quest evaluation: node completion states → prerequisite gates →
 * reachability. `objectiveCompleted` / `objectiveStarted` are keyed by
 * node key. Start is always completed; junctions and finish complete
 * when their gate opens; objectives complete when their gate is open
 * and the Goals machinery reports completion. Position never participates.
 */
export function evaluateQuestOutcome(input: {
  nodes: Array<{ key: string; kind: QuestNodeKind; join: QuestJoin }>;
  edges: Array<{ from: string; to: string }>;
  objectiveCompleted: Record<string, boolean>;
  objectiveStarted?: Record<string, boolean>;
}): QuestOutcome {
  const incoming = new Map<string, string[]>();
  for (const node of input.nodes) incoming.set(node.key, []);
  for (const edge of input.edges) {
    if (incoming.has(edge.to) && incoming.has(edge.from)) {
      incoming.get(edge.to)?.push(edge.from);
    }
  }
  const completed = new Map<string, boolean>();
  const prerequisitesMet = new Map<string, boolean>();
  const start = input.nodes.find((node) => node.kind === "start");
  if (start) {
    completed.set(start.key, true);
    prerequisitesMet.set(start.key, true);
  }
  // Fixpoint over the DAG: junction/finish chains resolve in key order
  // across at most N passes because every gate only depends on incoming
  // predecessors (no cycles by construction).
  for (let pass = 0; pass < input.nodes.length + 1; pass++) {
    let changed = false;
    for (const node of input.nodes) {
      if (node.kind === "start") continue;
      const preds = incoming.get(node.key) ?? [];
      let met: boolean;
      if (preds.length === 0) {
        met = false;
      } else if (node.join === "all") {
        met = preds.every((key) => completed.get(key) === true);
      } else {
        met = preds.some((key) => completed.get(key) === true);
      }
      let done: boolean;
      if (node.kind === "junction" || node.kind === "finish") {
        done = met;
      } else {
        done = met && (input.objectiveCompleted[node.key] === true);
      }
      if (
        prerequisitesMet.get(node.key) !== met ||
        completed.get(node.key) !== done
      ) {
        prerequisitesMet.set(node.key, met);
        completed.set(node.key, done);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const nodes: QuestOutcomeNode[] = input.nodes.map((node) => {
    const done = completed.get(node.key) === true;
    const met = prerequisitesMet.get(node.key) === true;
    let state: QuestNodeState;
    if (done) {
      state = "completed";
    } else if (!met) {
      state = "locked";
    } else if (
      node.kind === "objective" &&
      input.objectiveStarted?.[node.key] === true
    ) {
      state = "progressing";
    } else {
      state = "available";
    }
    return { key: node.key, prerequisitesMet: met, completed: done, state };
  });
  const finishKeys = new Set(
    input.nodes.filter((node) => node.kind === "finish").map((node) => node.key),
  );
  const won = nodes.some((node) => finishKeys.has(node.key) && node.completed);
  return { nodes, won };
}

/* ---------------- Quest presentation (styles) ---------------------- */
/*
 * Quests persist a registry-backed styleKey plus optional presentation
 * overrides. Quest styles are deliberately distinct from global Feylore
 * themes: they control the map background, paths, nodes, state
 * treatments, start/finish emphasis, and optional-node treatment. 1.2
 * ships the default style; the registry leaves room for a curated set
 * (enchanted forest, constellation, library stacks, dungeon map, cozy
 * trail, minimalist) without touching Quest behavior.
 */

export interface QuestStyleDefinition {
  key: string;
  name: string;
  description: string;
  tokens: {
    mapBackground: string;
    path: string;
    pathUnlocked: string;
    node: string;
    nodeText: string;
    locked: string;
    available: string;
    completed: string;
    completedText: string;
    start: string;
    finish: string;
    optional: string;
  };
}

export const QUEST_STYLE_REGISTRY: readonly QuestStyleDefinition[] = [
  {
    key: "default",
    name: "Default",
    description: "The standard Feylore quest map.",
    tokens: {
      mapBackground: "var(--quest-map-background, transparent)",
      path: "var(--quest-path, #3a3a48)",
      pathUnlocked: "var(--quest-path-unlocked, #7fb887)",
      node: "var(--quest-node, #1c1c24)",
      nodeText: "var(--quest-node-text, inherit)",
      locked: "var(--quest-locked, #26262e)",
      available: "var(--quest-available, #2e3a4a)",
      completed: "var(--quest-completed, #27402c)",
      completedText: "var(--quest-completed-text, inherit)",
      start: "var(--quest-start, #2e4a3a)",
      finish: "var(--quest-finish, #4a2e3a)",
      optional: "var(--quest-optional, #3a3423)",
    },
  },
] as const;

export function getQuestStyle(key: string): QuestStyleDefinition {
  return (
    QUEST_STYLE_REGISTRY.find((style) => style.key === key) ??
    QUEST_STYLE_REGISTRY[0]!
  );
}

export function isQuestStyleKey(value: string): boolean {
  return QUEST_STYLE_REGISTRY.some((style) => style.key === value);
}

export const challengeCreateSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).nullable().optional(),
    /** Simple, Bingo, and Quest (1.2) composition formats. */
    format: challengeFormatSchema.default("simple"),
    visibility: challengeVisibilitySchema.default("public"),
    joinPolicy: challengeJoinPolicySchema.default("open"),
    /** Club-owned challenge. Creation context determines personal vs club. */
    clubId: z.string().uuid().nullable().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    /**
     * Simple carries its single objective here (enforced below + service).
     * Bingo carries its square objectives inside `board` instead.
     * Quest carries its node objectives inside `quest` instead.
     */
    objectives: z.array(challengeObjectiveSchema).max(25).default([]),
    /** Bingo board definition. Required when format is "bingo". */
    board: bingoBoardInputSchema.optional(),
    /** Quest graph definition. Required when format is "quest". */
    quest: questGraphInputSchema.optional(),
    /** Optional completion achievement presentation (definition key "completed"). */
    achievement: z
      .object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().optional(),
        icon: z.string().max(120).nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.format === "simple") {
      if (value.objectives.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Simple challenges require exactly one objective",
          path: ["objectives"],
        });
      }
      if (value.board !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Simple challenges do not have a board",
          path: ["board"],
        });
      }
      if (value.quest !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Simple challenges do not have a quest",
          path: ["quest"],
        });
      }
    } else if (value.format === "bingo") {
      if (value.objectives.length !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Bingo square objectives belong inside board.squares, not objectives",
          path: ["objectives"],
        });
      }
      if (value.board === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bingo challenges require a board",
          path: ["board"],
        });
      }
      if (value.quest !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bingo challenges do not have a quest",
          path: ["quest"],
        });
      }
    } else if (value.format === "quest") {
      if (value.objectives.length !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Quest node objectives belong inside quest.nodes, not objectives",
          path: ["objectives"],
        });
      }
      if (value.board !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Quest challenges do not have a board",
          path: ["board"],
        });
      }
      if (value.quest === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Quest challenges require a quest",
          path: ["quest"],
        });
      }
    }
  });

export type ChallengeCreateInput = z.infer<typeof challengeCreateSchema>;

export const challengeUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  visibility: challengeVisibilitySchema.optional(),
  joinPolicy: challengeJoinPolicySchema.optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  /** Objective replacement — locked once active (service enforces). */
  objectives: z.array(challengeObjectiveSchema).min(1).max(25).optional(),
  /** Board replacement for Bingo — locked once active (service enforces). */
  board: bingoBoardInputSchema.optional(),
  /** Graph replacement for Quest — locked once active (service enforces). */
  quest: questGraphInputSchema.optional(),
  state: challengeStateSchema.optional(),
});

export type ChallengeUpdateInput = z.infer<typeof challengeUpdateSchema>;

export interface ChallengeRecord {
  id: string;
  title: string;
  description: string | null;
  format: ChallengeFormat;
  creatorUserId: string;
  clubId: string | null;
  visibility: ChallengeVisibility;
  joinPolicy: ChallengeJoinPolicy;
  state: ChallengeState;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
  /** Format-agnostic: never assume length 1 outside the Simple layer. */
  objectives: ChallengeObjective[];
  /** Bingo board config (format === "bingo" only; no per-viewer progress). */
  bingoBoard?: BingoBoard | null;
  /** Quest graph config (format === "quest" only; no per-viewer progress). */
  questGraph?: QuestGraph | null;
  /** Effective lifecycle state derived from stored state + dates. */
  effectiveState: ChallengeState;
  participantCount?: number;
  viewerParticipation?: ChallengeParticipantView | null;
  hasCompletionAchievement?: boolean;
}

export interface ChallengeParticipantView {
  userId: string;
  /** Included when the viewer may see the participant list. */
  username?: string | null;
  displayName?: string | null;
  state: ChallengeParticipantState;
  joinedAt: string;
  completedAt: string | null;
  progress?: {
    current: number;
    target: number;
    unit: string;
    percentage: number;
    completed: boolean;
    evaluatedAt: string;
  } | null;
  /**
   * Social progress summary for showcase surfaces (profiles, club tabs).
   * Counts and states only — never counted items.
   */
  summary?: ChallengeSocialSummary | null;
}

export interface ChallengeParticipantRow {
  challengeId: string;
  userId: string;
  state: ChallengeParticipantState;
  joinedAt: string;
  leftAt: string | null;
  completedAt: string | null;
}

/** Effective lifecycle: stored draft/cancelled/completed win; otherwise dates rule. */
export function challengeEffectiveState(input: {
  state: ChallengeState;
  startsAt: string | Date;
  endsAt: string | Date;
  now?: Date;
}): ChallengeState {
  const now = (input.now ?? new Date()).getTime();
  if (
    input.state === "draft" ||
    input.state === "cancelled" ||
    input.state === "completed"
  ) {
    return input.state;
  }
  const start = new Date(input.startsAt).getTime();
  const end = new Date(input.endsAt).getTime();
  if (Number.isFinite(start) && now < start) return "upcoming";
  if (Number.isFinite(end) && now >= end) {
    // Stored "ended" stays ended; stored active that passed its end is ended.
    return "ended";
  }
  return "active";
}

/** Effective evaluation period — join time never moves the boundary. */
export function challengeEffectivePeriod(challenge: {
  startsAt: string;
  endsAt: string;
}): { startsAt: string; endsAt: string } {
  return { startsAt: challenge.startsAt, endsAt: challenge.endsAt };
}

/** Simple-format guard: exactly one objective. Service-layer only. */
export function assertSimpleObjectives(objectives: readonly unknown[]): void {
  if (objectives.length !== 1) {
    throw new Error(
      `Simple challenges require exactly one objective (received ${objectives.length})`,
    );
  }
}

export function objectiveToGoalLike(objective: {
  metric: string;
  aggregation: GoalAggregation;
  target: number;
  activity: "finish" | "consume" | "progress";
  basis: "completed" | "consumed";
  domains: string[];
  rule?: GoalRuleExpression | null;
}): {
  metric: string;
  aggregation: GoalAggregation;
  target: number;
  activity: "finish" | "consume" | "progress";
  basis: "completed" | "consumed";
  domains: string[];
  rule: GoalRuleExpression | null;
} {
  return {
    metric: objective.metric,
    aggregation: objective.aggregation,
    target: objective.target,
    activity: objective.activity,
    basis: objective.basis,
    domains: objective.domains,
    rule: (objective.rule ?? null) as GoalRuleExpression | null,
  };
}

/* ------------------------------------------------------------------ */
/* Lifecycle + domain events (established now for Notifications/Club   */
/* activity; not every event needs a surface in 1.0).                  */
/* ------------------------------------------------------------------ */

export const CHALLENGE_EVENT_TYPES = {
  CREATED: "challenge.created",
  JOINED: "challenge.joined",
  LEFT: "challenge.left",
  INVITED: "challenge.invited",
  STARTED: "challenge.started",
  MILESTONE: "challenge.milestone",
  COMPLETED: "challenge.completed",
  ENDING_SOON: "challenge.ending_soon",
  ENDED: "challenge.ended",
  CANCELLED: "challenge.cancelled",
  ACHIEVEMENT_EARNED: "challenge.achievement_earned",
} as const;

export type ChallengeEventType =
  (typeof CHALLENGE_EVENT_TYPES)[keyof typeof CHALLENGE_EVENT_TYPES];

export const CHALLENGE_LIST_LIMIT_MAX = 100;

export const challengeListQuerySchema = z.object({
  state: challengeStateSchema.optional(),
  clubId: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CHALLENGE_LIST_LIMIT_MAX)
    .default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export type ChallengeListQuery = z.infer<typeof challengeListQuerySchema>;

/* ------------------------------------------------------------------ */
/* Challenges 1.3 — Social + Clubs                                     */
/*                                                                     */
/* Invites give invite-only challenges an accept/decline flow and let  */
/* any challenge creator nudge specific users. Social summaries share  */
/* per-format progress (7/12, lines, nodes) without exposing the       */
/* underlying counted library items — candidates stay gated to         */
/* self-or-manager. The personal hub groups challenges into the states */
/* a participant cares about: yours, invited, discoverable, completed. */
/* No leaderboards: Quest paths and Bingo lines both admit multiple   */
/* legitimate victories, so the social concept stays shared            */
/* accomplishment rather than universal ranking.                       */
/* ------------------------------------------------------------------ */

export const CHALLENGE_INVITE_STATES = [
  "pending",
  "accepted",
  "declined",
] as const;
export type ChallengeInviteState =
  (typeof CHALLENGE_INVITE_STATES)[number];

export const challengeInviteStateSchema = z.enum(CHALLENGE_INVITE_STATES);

export interface ChallengeInvite {
  id: string;
  challengeId: string;
  inviterUserId: string;
  inviterUsername?: string | null;
  inviterDisplayName?: string | null;
  inviteeUserId: string;
  /** Populated on the manager's per-challenge invite list. */
  inviteeUsername?: string | null;
  inviteeDisplayName?: string | null;
  state: ChallengeInviteState;
  createdAt: string;
  respondedAt: string | null;
  /** Populated for the invitee's pending-invite list. */
  challenge?: ChallengeRecord | null;
}

/**
 * Shared challenge progress for social surfaces (participant lists,
 * club tabs, profiles). Counts and completion states only — never the
 * counted library items behind them. Candidates remain gated to
 * self-or-manager via the candidates endpoint.
 */
export type ChallengeSocialSummary =
  | {
      format: "simple";
      current: number;
      target: number;
      percentage: number;
      completed: boolean;
    }
  | {
      format: "bingo";
      squaresCompleted: number;
      squaresTotal: number;
      linesCompleted: number;
      completedPositions: number[];
      won: boolean;
    }
  | {
      format: "quest";
      requiredCompleted: number;
      requiredTotal: number;
      optionalCompleted: number;
      optionalTotal: number;
      /** Map/node states for tiny-map rendering; no progress details. */
      nodeStates: Array<{
        key: string;
        kind: string;
        state: string;
        optional: boolean;
      }>;
      won: boolean;
    };

export interface ChallengeParticipantSummary {
  userId: string;
  username?: string | null;
  displayName?: string | null;
  state: ChallengeParticipantState;
  joinedAt: string;
  completedAt: string | null;
  summary: ChallengeSocialSummary | null;
}

/** Minimal structural inputs so the builders stay pure and testable. */
export function simpleSocialSummary(progress: {
  current: number;
  target: number;
  percentage: number;
  completed: boolean;
}): ChallengeSocialSummary {
  return {
    format: "simple",
    current: progress.current,
    target: progress.target,
    percentage: progress.percentage,
    completed: progress.completed,
  };
}

export function bingoSocialSummary(view: {
  squares: Array<{ position: number; state: string }>;
  squaresCompleted: number;
  squaresTotal: number;
  linesCompleted: number;
  won: boolean;
}): ChallengeSocialSummary {
  return {
    format: "bingo",
    squaresCompleted: view.squaresCompleted,
    squaresTotal: view.squaresTotal,
    linesCompleted: view.linesCompleted,
    completedPositions: view.squares
      .filter(
        (square) => square.state === "completed" || square.state === "free",
      )
      .map((square) => square.position)
      .sort((a, b) => a - b),
    won: view.won,
  };
}

export function questSocialSummary(view: {
  nodes: Array<{
    key: string;
    kind: string;
    state: string;
    optional: boolean;
  }>;
  requiredCompleted: number;
  requiredTotal: number;
  optionalCompleted: number;
  optionalTotal: number;
  won: boolean;
}): ChallengeSocialSummary {
  return {
    format: "quest",
    requiredCompleted: view.requiredCompleted,
    requiredTotal: view.requiredTotal,
    optionalCompleted: view.optionalCompleted,
    optionalTotal: view.optionalTotal,
    nodeStates: view.nodes.map((node) => ({
      key: node.key,
      kind: node.kind,
      state: node.state,
      optional: node.optional,
    })),
    won: view.won,
  };
}

export interface ChallengeHub {
  yours: ChallengeRecord[];
  invited: ChallengeRecord[];
  discoverable: ChallengeRecord[];
  completed: ChallengeRecord[];
}

/**
 * Pure hub grouping. `records` must already be visibility-filtered
 * (server-side); this only buckets them into the states a participant
 * cares about. Completed wins over yours; an outstanding invite loses
 * to actual participation.
 */
export function groupChallengeHub(
  records: ChallengeRecord[],
  viewerId: string,
  pendingInviteChallengeIds: Set<string> | string[],
): ChallengeHub {
  const pending =
    pendingInviteChallengeIds instanceof Set
      ? pendingInviteChallengeIds
      : new Set(pendingInviteChallengeIds);
  const hub: ChallengeHub = {
    yours: [],
    invited: [],
    discoverable: [],
    completed: [],
  };
  for (const record of records) {
    const participation = record.viewerParticipation;
    const participating =
      participation !== null &&
      participation !== undefined &&
      participation.state !== "left";
    if (participating && participation.state === "completed") {
      hub.completed.push(record);
    } else if (
      participating ||
      record.creatorUserId === viewerId ||
      pending.has(record.id)
    ) {
      if (participating || record.creatorUserId === viewerId) {
        hub.yours.push(record);
      } else {
        hub.invited.push(record);
      }
    } else {
      hub.discoverable.push(record);
    }
  }
  const byStart = (a: ChallengeRecord, b: ChallengeRecord) =>
    +new Date(a.startsAt) - +new Date(b.startsAt);
  hub.yours.sort(byStart);
  hub.invited.sort(byStart);
  hub.discoverable.sort(byStart);
  hub.completed.sort(byStart);
  return hub;
}
