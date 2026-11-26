import { describe, expect, it } from "vitest";
import {
  BINGO_STYLE_REGISTRY,
  CHALLENGE_EVENT_TYPES,
  QUEST_STYLE_REGISTRY,
  assertSimpleObjectives,
  bingoBoardInputSchema,
  bingoLines,
  bingoSocialSummary,
  bingoTotalLines,
  challengeCreateSchema,
  challengeEffectivePeriod,
  challengeEffectiveState,
  evaluateBingoOutcome,
  evaluateQuestOutcome,
  getBingoStyle,
  getQuestStyle,
  groupChallengeHub,
  isBingoStyleKey,
  isQuestStyleKey,
  objectiveToGoalLike,
  questGraphInputSchema,
  questSocialSummary,
  simpleSocialSummary,
  type ChallengeRecord,
} from "../src/shared/challenges.js";

describe("Challenges 1.0 foundation", () => {
  it("derives lifecycle from stored state + dates", () => {
    const start = "2027-01-01T00:00:00.000Z";
    const end = "2027-12-31T00:00:00.000Z";
    expect(
      challengeEffectiveState({
        state: "draft",
        startsAt: start,
        endsAt: end,
        now: new Date("2027-06-01T00:00:00.000Z"),
      }),
    ).toBe("draft");
    expect(
      challengeEffectiveState({
        state: "upcoming",
        startsAt: start,
        endsAt: end,
        now: new Date("2026-06-01T00:00:00.000Z"),
      }),
    ).toBe("upcoming");
    expect(
      challengeEffectiveState({
        state: "active",
        startsAt: start,
        endsAt: end,
        now: new Date("2027-06-01T00:00:00.000Z"),
      }),
    ).toBe("active");
    expect(
      challengeEffectiveState({
        state: "active",
        startsAt: start,
        endsAt: end,
        now: new Date("2028-01-01T00:00:00.000Z"),
      }),
    ).toBe("ended");
    // Terminal states never auto-advance.
    expect(
      challengeEffectiveState({
        state: "cancelled",
        startsAt: start,
        endsAt: end,
        now: new Date("2027-06-01T00:00:00.000Z"),
      }),
    ).toBe("cancelled");
    expect(
      challengeEffectiveState({
        state: "completed",
        startsAt: start,
        endsAt: end,
        now: new Date("2028-01-01T00:00:00.000Z"),
      }),
    ).toBe("completed");
  });

  it("keeps the challenge evaluation period independent of join time", () => {
    const period = challengeEffectivePeriod({
      startsAt: "2027-03-01T00:00:00.000Z",
      endsAt: "2027-03-31T00:00:00.000Z",
    });
    expect(period).toEqual({
      startsAt: "2027-03-01T00:00:00.000Z",
      endsAt: "2027-03-31T00:00:00.000Z",
    });
  });

  it("enforces Simple's one-objective rule outside the database model", () => {
    expect(() => assertSimpleObjectives([{}])).not.toThrow();
    expect(() => assertSimpleObjectives([])).toThrow();
    expect(() => assertSimpleObjectives([{}, {}])).toThrow();
  });

  it("defaults new challenges to the Simple format with one objective", () => {
    const parsed = challengeCreateSchema.parse({
      title: "Read five books",
      startsAt: "2027-01-01T00:00:00.000Z",
      endsAt: "2027-02-01T00:00:00.000Z",
      objectives: [
        {
          metric: "works",
          aggregation: { kind: "count" },
          target: 5,
          domains: ["books"],
        },
      ],
    });
    expect(parsed.format).toBe("simple");
    expect(parsed.joinPolicy).toBe("open");
    expect(parsed.objectives).toHaveLength(1);
  });

  it("rejects challenges without objectives", () => {
    expect(() =>
      challengeCreateSchema.parse({
        title: "Empty",
        startsAt: "2027-01-01T00:00:00.000Z",
        endsAt: "2027-02-01T00:00:00.000Z",
        objectives: [],
      }),
    ).toThrow();
  });

  it("maps objectives onto Goals evaluation vocabulary", () => {
    const goalLike = objectiveToGoalLike({
      metric: "works",
      aggregation: { kind: "count" },
      target: 5,
      activity: "finish",
      basis: "completed",
      domains: ["books"],
      rule: null,
    });
    expect(goalLike).toMatchObject({
      metric: "works",
      target: 5,
      domains: ["books"],
      rule: null,
    });
  });

  it("establishes lifecycle events for notifications and club activity", () => {
    expect(Object.values(CHALLENGE_EVENT_TYPES)).toEqual(
      expect.arrayContaining([
        "challenge.created",
        "challenge.joined",
        "challenge.left",
        "challenge.started",
        "challenge.milestone",
        "challenge.completed",
        "challenge.ended",
        "challenge.cancelled",
        "challenge.achievement_earned",
      ]),
    );
  });
});

function bingoSquare(
  position: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    position,
    label: `Square ${position + 1}`,
    freeSpace: false,
    objective: {
      metric: "works",
      aggregation: { kind: "count" },
      target: 1,
      domains: ["books"],
    },
    ...overrides,
  };
}

function bingoBoard(size: 3 | 4 | 5, overrides: Record<string, unknown> = {}) {
  const total = size * size;
  return {
    size,
    victory: "line",
    squares: Array.from({ length: total }, (_, position) =>
      bingoSquare(position),
    ),
    ...overrides,
  };
}

describe("Challenges 1.1 bingo", () => {
  it("counts rows, columns, and diagonals as lines", () => {
    expect(bingoTotalLines(3)).toBe(8);
    expect(bingoTotalLines(4)).toBe(10);
    expect(bingoTotalLines(5)).toBe(12);
    const lines = bingoLines(3);
    expect(lines).toHaveLength(8);
    expect(lines).toContainEqual([0, 1, 2]);
    expect(lines).toContainEqual([0, 3, 6]);
    expect(lines).toContainEqual([0, 4, 8]);
    expect(lines).toContainEqual([2, 4, 6]);
  });

  it("wins one line on any completed row, column, or diagonal", () => {
    const won = (completed: boolean[]) =>
      evaluateBingoOutcome({ size: 3, victory: "line", completed }).won;
    expect(
      won([true, true, true, false, false, false, false, false, false]),
    ).toBe(true);
    expect(
      won([true, false, false, true, false, false, true, false, false]),
    ).toBe(true);
    expect(
      won([true, false, false, false, true, false, false, false, true]),
    ).toBe(true);
    expect(
      won([true, true, false, false, false, false, false, false, false]),
    ).toBe(false);
  });

  it("requires N lines for n_lines and full cover for blackout", () => {
    const row = [true, true, true, false, false, false, false, false, false];
    expect(
      evaluateBingoOutcome({
        size: 3,
        victory: "n_lines",
        victoryLines: 2,
        completed: row,
      }).won,
    ).toBe(false);
    const twoLines = [true, true, true, true, false, false, true, false, false];
    const outcome = evaluateBingoOutcome({
      size: 3,
      victory: "n_lines",
      victoryLines: 2,
      completed: twoLines,
    });
    expect(outcome.linesCompleted).toBe(2);
    expect(outcome.won).toBe(true);
    expect(
      evaluateBingoOutcome({
        size: 3,
        victory: "blackout",
        completed: new Array(9).fill(true),
      }).won,
    ).toBe(true);
    expect(
      evaluateBingoOutcome({
        size: 3,
        victory: "blackout",
        completed: [true, true, true, true, true, true, true, true, false],
      }).won,
    ).toBe(false);
  });

  it("treats free spaces as board properties, not objectives", () => {
    const board = bingoBoardInputSchema.parse(
      bingoBoard(3, {
        squares: Array.from({ length: 9 }, (_, position) =>
          position === 4
            ? { position, label: "Free", freeSpace: true }
            : bingoSquare(position),
        ),
      }),
    );
    const free = board.squares.filter((square) => square.freeSpace);
    expect(free).toHaveLength(1);
    expect(free[0]!.objective).toBeUndefined();
    expect(board.squares.filter((square) => !square.freeSpace)).toHaveLength(8);
  });

  it("rejects malformed boards at the schema layer", () => {
    // Wrong square count.
    expect(() =>
      bingoBoardInputSchema.parse(bingoBoard(3, { squares: [bingoSquare(0)] })),
    ).toThrow();
    // Duplicate positions.
    expect(() =>
      bingoBoardInputSchema.parse(
        bingoBoard(3, {
          squares: Array.from({ length: 9 }, () => bingoSquare(0)),
        }),
      ),
    ).toThrow();
    // n_lines without a line count.
    expect(() =>
      bingoBoardInputSchema.parse(bingoBoard(3, { victory: "n_lines" })),
    ).toThrow();
    // Line counts beyond the board's total.
    expect(() =>
      bingoBoardInputSchema.parse(
        bingoBoard(3, { victory: "n_lines", victoryLines: 9 }),
      ),
    ).toThrow();
    // victoryLines on a non-n_lines victory.
    expect(() =>
      bingoBoardInputSchema.parse(
        bingoBoard(3, { victory: "blackout", victoryLines: 2 }),
      ),
    ).toThrow();
    // Free space carrying an objective.
    expect(() =>
      bingoBoardInputSchema.parse(
        bingoBoard(3, {
          squares: Array.from({ length: 9 }, (_, position) =>
            bingoSquare(position, { freeSpace: true }),
          ),
        }),
      ),
    ).toThrow();
    // Normal square without an objective.
    expect(() =>
      bingoBoardInputSchema.parse(
        bingoBoard(3, {
          squares: Array.from({ length: 9 }, (_, position) => ({
            position,
            label: `Square ${position + 1}`,
            freeSpace: false,
          })),
        }),
      ),
    ).toThrow();
  });

  it("keeps Simple and Bingo creation payloads disjoint", () => {
    const board = bingoBoard(3);
    const bingo = challengeCreateSchema.parse({
      title: "Bingo",
      format: "bingo",
      startsAt: "2027-01-01T00:00:00.000Z",
      endsAt: "2027-02-01T00:00:00.000Z",
      board,
    });
    expect(bingo.format).toBe("bingo");
    expect(bingo.objectives).toHaveLength(0);
    // Bingo square objectives live in the board, not in objectives.
    expect(() =>
      challengeCreateSchema.parse({
        title: "Bingo",
        format: "bingo",
        startsAt: "2027-01-01T00:00:00.000Z",
        endsAt: "2027-02-01T00:00:00.000Z",
        objectives: [bingoSquare(0).objective],
        board,
      }),
    ).toThrow();
    // Bingo requires a board.
    expect(() =>
      challengeCreateSchema.parse({
        title: "Bingo",
        format: "bingo",
        startsAt: "2027-01-01T00:00:00.000Z",
        endsAt: "2027-02-01T00:00:00.000Z",
      }),
    ).toThrow();
    // Simple carries no board.
    expect(() =>
      challengeCreateSchema.parse({
        title: "Simple",
        format: "simple",
        startsAt: "2027-01-01T00:00:00.000Z",
        endsAt: "2027-02-01T00:00:00.000Z",
        objectives: [bingoSquare(0).objective],
        board,
      }),
    ).toThrow();
  });

  it("ships a registry-backed default board style distinct from themes", () => {
    expect(BINGO_STYLE_REGISTRY.map((style) => style.key)).toContain("default");
    expect(getBingoStyle("default").key).toBe("default");
    expect(getBingoStyle("unknown").key).toBe("default");
    expect(isBingoStyleKey("default")).toBe(true);
    expect(isBingoStyleKey("unknown")).toBe(false);
  });
});

function questObjective() {
  return {
    metric: "works",
    aggregation: { kind: "count" },
    target: 1,
    domains: ["books"],
  };
}

let questCounter = 0;
function questNode(
  key: string,
  kind: "start" | "objective" | "junction" | "finish",
  overrides: Record<string, unknown> = {},
) {
  questCounter += 1;
  return {
    key,
    kind,
    label: key,
    optional: false,
    join: "any",
    position: { x: (questCounter * 137) % 1000, y: 300 },
    ...(kind === "objective" ? { objective: questObjective() } : {}),
    ...overrides,
  };
}

function questGraph(
  nodes: Array<Record<string, unknown>>,
  edges: Array<{ from: string; to: string }>,
  overrides: Record<string, unknown> = {},
) {
  return { nodes, edges, ...overrides };
}

function minimalQuest() {
  return questGraph(
    [
      questNode("start", "start"),
      questNode("a", "objective"),
      questNode("finish", "finish"),
    ],
    [
      { from: "start", to: "a" },
      { from: "a", to: "finish" },
    ],
  );
}

describe("Challenges 1.2 quest", () => {
  it("accepts a minimal start → objective → finish quest", () => {
    const parsed = questGraphInputSchema.parse(minimalQuest());
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);
  });

  it("keeps Simple, Bingo, and Quest creation payloads disjoint", () => {
    const quest = challengeCreateSchema.parse({
      title: "Quest",
      format: "quest",
      startsAt: "2027-01-01T00:00:00.000Z",
      endsAt: "2027-02-01T00:00:00.000Z",
      quest: minimalQuest(),
    });
    expect(quest.format).toBe("quest");
    expect(quest.objectives).toHaveLength(0);
    // Quest requires its graph.
    expect(() =>
      challengeCreateSchema.parse({
        title: "Quest",
        format: "quest",
        startsAt: "2027-01-01T00:00:00.000Z",
        endsAt: "2027-02-01T00:00:00.000Z",
      }),
    ).toThrow();
    // Quest node objectives live in the graph, not in objectives.
    expect(() =>
      challengeCreateSchema.parse({
        title: "Quest",
        format: "quest",
        startsAt: "2027-01-01T00:00:00.000Z",
        endsAt: "2027-02-01T00:00:00.000Z",
        objectives: [questObjective()],
        quest: minimalQuest(),
      }),
    ).toThrow();
    // Simple carries no quest.
    expect(() =>
      challengeCreateSchema.parse({
        title: "Simple",
        format: "simple",
        startsAt: "2027-01-01T00:00:00.000Z",
        endsAt: "2027-02-01T00:00:00.000Z",
        objectives: [questObjective()],
        quest: minimalQuest(),
      }),
    ).toThrow();
    // Bingo carries no quest.
    expect(() =>
      challengeCreateSchema.parse({
        title: "Bingo",
        format: "bingo",
        startsAt: "2027-01-01T00:00:00.000Z",
        endsAt: "2027-02-01T00:00:00.000Z",
        board: {
          size: 3,
          victory: "line",
          squares: Array.from({ length: 9 }, (_, position) => ({
            position,
            label: `Square ${position + 1}`,
            freeSpace: false,
            objective: questObjective(),
          })),
        },
        quest: minimalQuest(),
      }),
    ).toThrow();
  });

  it("requires exactly one start and exactly one finish", () => {
    // Two starts.
    expect(() =>
      questGraphInputSchema.parse(
        questGraph(
          [
            questNode("s1", "start"),
            questNode("s2", "start"),
            questNode("finish", "finish"),
          ],
          [
            { from: "s1", to: "finish" },
            { from: "s2", to: "finish" },
          ],
        ),
      ),
    ).toThrow();
    // No finish.
    expect(() =>
      questGraphInputSchema.parse(
        questGraph([questNode("start", "start"), questNode("a", "objective")], [
          { from: "start", to: "a" },
        ]),
      ),
    ).toThrow();
  });

  it("rejects cycles, unreachable finishes, and orphan required nodes", () => {
    // Cycle: a → b → a (plus finish dangling keeps counts valid).
    expect(() =>
      questGraphInputSchema.parse(
        questGraph(
          [
            questNode("start", "start"),
            questNode("a", "objective"),
            questNode("b", "objective"),
            questNode("finish", "finish"),
          ],
          [
            { from: "start", to: "a" },
            { from: "a", to: "b" },
            { from: "b", to: "a" },
            { from: "b", to: "finish" },
          ],
        ),
      ),
    ).toThrow();
    // Finish unreachable from start.
    expect(() =>
      questGraphInputSchema.parse(
        questGraph(
          [
            questNode("start", "start"),
            questNode("a", "objective"),
            questNode("finish", "finish"),
          ],
          [{ from: "start", to: "a" }],
        ),
      ),
    ).toThrow();
    // Required node that cannot reach finish.
    expect(() =>
      questGraphInputSchema.parse(
        questGraph(
          [
            questNode("start", "start"),
            questNode("a", "objective"),
            questNode("dead", "objective"),
            questNode("finish", "finish"),
          ],
          [
            { from: "start", to: "a" },
            { from: "a", to: "finish" },
            { from: "start", to: "dead" },
          ],
        ),
      ),
    ).toThrow();
  });

  it("keeps optional side nodes from gating required progress", () => {
    expect(() =>
      questGraphInputSchema.parse(
        questGraph(
          [
            questNode("start", "start"),
            questNode("side", "objective", { optional: true }),
            questNode("a", "objective"),
            questNode("finish", "finish"),
          ],
          [
            { from: "start", to: "side" },
            { from: "side", to: "a" },
            { from: "a", to: "finish" },
          ],
        ),
      ),
    ).toThrow();
    // Optional → optional is a legal side chain.
    const parsed = questGraphInputSchema.parse(
      questGraph(
        [
          questNode("start", "start"),
          questNode("side", "objective", { optional: true }),
          questNode("side2", "objective", { optional: true }),
          questNode("a", "objective"),
          questNode("finish", "finish"),
        ],
        [
          { from: "start", to: "side" },
          { from: "side", to: "side2" },
          { from: "start", to: "a" },
          { from: "a", to: "finish" },
        ],
      ),
    );
    expect(parsed.nodes).toHaveLength(5);
  });

  it("enforces start/finish wiring and junction connectivity", () => {
    // Incoming edge to start.
    expect(() =>
      questGraphInputSchema.parse(
        questGraph(
          [
            questNode("start", "start"),
            questNode("a", "objective"),
            questNode("finish", "finish"),
          ],
          [
            { from: "start", to: "a" },
            { from: "a", to: "finish" },
            { from: "a", to: "start" },
          ],
        ),
      ),
    ).toThrow();
    // Outgoing edge from finish.
    expect(() =>
      questGraphInputSchema.parse(
        questGraph(
          [
            questNode("start", "start"),
            questNode("a", "objective"),
            questNode("finish", "finish"),
          ],
          [
            { from: "start", to: "a" },
            { from: "a", to: "finish" },
            { from: "finish", to: "a" },
          ],
        ),
      ),
    ).toThrow();
    // Junction without an outgoing path.
    expect(() =>
      questGraphInputSchema.parse(
        questGraph(
          [
            questNode("start", "start"),
            questNode("a", "objective"),
            questNode("j", "junction"),
            questNode("finish", "finish"),
          ],
          [
            { from: "start", to: "a" },
            { from: "a", to: "j" },
            { from: "a", to: "finish" },
          ],
        ),
      ),
    ).toThrow();
  });

  it("unlocks linearly: locked → available → completed → finish", () => {
    const nodes = [
      { key: "start", kind: "start", join: "any" },
      { key: "a", kind: "objective", join: "any" },
      { key: "finish", kind: "finish", join: "any" },
    ] as const;
    const edges = [
      { from: "start", to: "a" },
      { from: "a", to: "finish" },
    ];
    const fresh = evaluateQuestOutcome({
      nodes: nodes.map((node) => ({ ...node })),
      edges,
      objectiveCompleted: {},
    });
    expect(fresh.nodes.find((node) => node.key === "a")?.state).toBe(
      "available",
    );
    expect(fresh.won).toBe(false);
    const started = evaluateQuestOutcome({
      nodes: nodes.map((node) => ({ ...node })),
      edges,
      objectiveCompleted: {},
      objectiveStarted: { a: true },
    });
    expect(started.nodes.find((node) => node.key === "a")?.state).toBe(
      "progressing",
    );
    const done = evaluateQuestOutcome({
      nodes: nodes.map((node) => ({ ...node })),
      edges,
      objectiveCompleted: { a: true },
    });
    expect(done.nodes.find((node) => node.key === "a")?.completed).toBe(true);
    expect(done.won).toBe(true);
  });

  it("supports ANY branching and ALL mandatory convergence", () => {
    const nodes = [
      { key: "start", kind: "start", join: "any" },
      { key: "fantasy", kind: "objective", join: "any" },
      { key: "scifi", kind: "objective", join: "any" },
      { key: "long", kind: "objective", join: "any" },
      { key: "finish", kind: "finish", join: "any" },
    ] as const;
    const edges = [
      { from: "start", to: "fantasy" },
      { from: "start", to: "scifi" },
      { from: "fantasy", to: "long" },
      { from: "scifi", to: "long" },
      { from: "long", to: "finish" },
    ];
    // ANY convergence: either branch opens the next node.
    const either = evaluateQuestOutcome({
      nodes: nodes.map((node) => ({ ...node })),
      edges,
      objectiveCompleted: { fantasy: true },
    });
    expect(
      either.nodes.find((node) => node.key === "long")?.prerequisitesMet,
    ).toBe(true);
    // ALL convergence: every incoming prerequisite must be satisfied.
    const strict = evaluateQuestOutcome({
      nodes: nodes.map((node) => ({
        ...node,
        join: node.key === "long" ? ("all" as const) : node.join,
      })),
      edges,
      objectiveCompleted: { fantasy: true },
    });
    expect(
      strict.nodes.find((node) => node.key === "long")?.prerequisitesMet,
    ).toBe(false);
    const both = evaluateQuestOutcome({
      nodes: nodes.map((node) => ({
        ...node,
        join: node.key === "long" ? ("all" as const) : node.join,
      })),
      edges,
      objectiveCompleted: { fantasy: true, scifi: true },
    });
    expect(
      both.nodes.find((node) => node.key === "long")?.prerequisitesMet,
    ).toBe(true);
  });

  it("ignores optional completion when reaching finish", () => {
    const nodes = [
      { key: "start", kind: "start", join: "any" },
      { key: "a", kind: "objective", join: "any" },
      { key: "side", kind: "objective", join: "any" },
      { key: "finish", kind: "finish", join: "any" },
    ] as const;
    const edges = [
      { from: "start", to: "a" },
      { from: "a", to: "finish" },
      { from: "start", to: "side" },
    ];
    const sideOnly = evaluateQuestOutcome({
      nodes: nodes.map((node) => ({ ...node })),
      edges,
      objectiveCompleted: { side: true },
    });
    expect(sideOnly.won).toBe(false);
    expect(
      sideOnly.nodes.find((node) => node.key === "side")?.completed,
    ).toBe(true);
    const main = evaluateQuestOutcome({
      nodes: nodes.map((node) => ({ ...node })),
      edges,
      objectiveCompleted: { a: true },
    });
    expect(main.won).toBe(true);
  });

  it("treats position as presentation: moves never change the rules", () => {
    const left = questGraphInputSchema.parse(
      questGraph(
        [
          questNode("start", "start", { position: { x: 0, y: 0 } }),
          questNode("a", "objective", { position: { x: 10, y: 10 } }),
          questNode("finish", "finish", { position: { x: 20, y: 20 } }),
        ],
        [
          { from: "start", to: "a" },
          { from: "a", to: "finish" },
        ],
      ),
    );
    const right = questGraphInputSchema.parse(
      questGraph(
        [
          questNode("start", "start", { position: { x: 1999, y: 1999 } }),
          questNode("a", "objective", { position: { x: 1500, y: 42 } }),
          questNode("finish", "finish", { position: { x: 7, y: 900 } }),
        ],
        [
          { from: "start", to: "a" },
          { from: "a", to: "finish" },
        ],
      ),
    );
    // Evaluation consumes keys/kinds/joins/edges only — positions from
    // either parse produce the identical outcome.
    const toOutcome = () =>
      evaluateQuestOutcome({
        nodes: [
          { key: "start", kind: "start", join: "any" },
          { key: "a", kind: "objective", join: "any" },
          { key: "finish", kind: "finish", join: "any" },
        ],
        edges: [
          { from: "start", to: "a" },
          { from: "a", to: "finish" },
        ],
        objectiveCompleted: { a: true },
      });
    expect(left.nodes.map((node) => node.position)).not.toEqual(
      right.nodes.map((node) => node.position),
    );
    expect(toOutcome().won).toBe(true);
  });

  it("ships a registry-backed default map style distinct from themes", () => {
    expect(QUEST_STYLE_REGISTRY.map((style) => style.key)).toContain("default");
    expect(getQuestStyle("default").key).toBe("default");
    expect(getQuestStyle("unknown").key).toBe("default");
    expect(isQuestStyleKey("default")).toBe(true);
    expect(isQuestStyleKey("unknown")).toBe(false);
  });
});

function hubRecord(
  id: string,
  overrides: Partial<ChallengeRecord> = {},
): ChallengeRecord {
  return {
    id,
    title: id,
    description: null,
    format: "simple",
    creatorUserId: "creator",
    clubId: null,
    visibility: "public",
    joinPolicy: "open",
    state: "active",
    startsAt: "2027-01-01T00:00:00.000Z",
    endsAt: "2027-12-31T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    objectives: [],
    effectiveState: "active",
    viewerParticipation: null,
    ...overrides,
  };
}

function participation(state: "joined" | "completed" | "left") {
  return {
    userId: "viewer",
    state,
    joinedAt: "2027-02-01T00:00:00.000Z",
    completedAt: state === "completed" ? "2027-03-01T00:00:00.000Z" : null,
    progress: null,
  };
}

describe("Challenges 1.3 social + clubs", () => {
  it("establishes invite and ending-soon lifecycle events", () => {
    expect(Object.values(CHALLENGE_EVENT_TYPES)).toEqual(
      expect.arrayContaining([
        "challenge.invited",
        "challenge.started",
        "challenge.milestone",
        "challenge.completed",
        "challenge.ending_soon",
      ]),
    );
  });

  it("buckets the hub into yours, invited, discoverable, and completed", () => {
    const hub = groupChallengeHub(
      [
        hubRecord("mine", { viewerParticipation: participation("joined") }),
        hubRecord("created", { creatorUserId: "viewer" }),
        hubRecord("done", { viewerParticipation: participation("completed") }),
        hubRecord("invited"),
        hubRecord("open"),
        hubRecord("left", { viewerParticipation: participation("left") }),
      ],
      "viewer",
      ["invited"],
    );
    expect(hub.yours.map((record) => record.id).sort()).toEqual([
      "created",
      "mine",
    ]);
    expect(hub.invited.map((record) => record.id)).toEqual(["invited"]);
    expect(hub.discoverable.map((record) => record.id).sort()).toEqual([
      "left",
      "open",
    ]);
    expect(hub.completed.map((record) => record.id)).toEqual(["done"]);
  });

  it("prefers participation over invites when bucketing", () => {
    // Joined after accepting: yours, not invited.
    const hub = groupChallengeHub(
      [hubRecord("both", { viewerParticipation: participation("joined") })],
      "viewer",
      ["both"],
    );
    expect(hub.yours.map((record) => record.id)).toEqual(["both"]);
    expect(hub.invited).toHaveLength(0);
  });

  it("summarizes simple progress as counts", () => {
    const summary = simpleSocialSummary({
      current: 7,
      target: 12,
      percentage: 58,
      completed: false,
    });
    expect(summary).toMatchObject({
      format: "simple",
      current: 7,
      target: 12,
      completed: false,
    });
  });

  it("summarizes bingo boards as completed positions, not items", () => {
    const summary = bingoSocialSummary({
      squares: [
        { position: 0, state: "completed" },
        { position: 1, state: "progressing" },
        { position: 2, state: "free" },
        { position: 3, state: "locked" },
      ],
      squaresCompleted: 2,
      squaresTotal: 4,
      linesCompleted: 0,
      won: false,
    });
    expect(summary).toMatchObject({
      format: "bingo",
      squaresCompleted: 2,
      linesCompleted: 0,
      won: false,
    });
    if (summary.format === "bingo") {
      expect(summary.completedPositions).toEqual([0, 2]);
      expect("candidates" in summary).toBe(false);
    }
  });

  it("summarizes quest maps as node states, not items", () => {
    const summary = questSocialSummary({
      nodes: [
        { key: "start", kind: "start", state: "completed", optional: false },
        { key: "a", kind: "objective", state: "completed", optional: false },
        { key: "side", kind: "objective", state: "locked", optional: true },
        { key: "finish", kind: "finish", state: "locked", optional: false },
      ],
      requiredCompleted: 1,
      requiredTotal: 1,
      optionalCompleted: 0,
      optionalTotal: 1,
      won: false,
    });
    expect(summary).toMatchObject({
      format: "quest",
      requiredCompleted: 1,
      requiredTotal: 1,
      won: false,
    });
    if (summary.format === "quest") {
      expect(summary.nodeStates).toHaveLength(4);
      expect(summary.nodeStates[0]).toMatchObject({
        key: "start",
        state: "completed",
      });
    }
  });
});
