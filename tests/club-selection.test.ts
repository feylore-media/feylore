import { describe, expect, it } from "vitest";
import { instantRunoff, simplePoll } from "../src/shared/club-selection.js";

describe("Club elections", () => {
  it("transfers ranked ballots and records counts and exhausted ballots", () => {
    const result = instantRunoff(
      ["a", "b", "c"],
      [["a"], ["a"], ["b", "a"], ["b", "a"], ["c", "a"]],
    );
    expect(result.winnerId).toBe("a");
    expect(result.rounds).toEqual([
      { counts: { a: 2, b: 2, c: 1 }, exhausted: 0, eliminated: "c" },
      { counts: { a: 3, b: 2 }, exhausted: 0, eliminated: null },
    ]);
  });
  it("records deterministic elimination ties regardless of candidate order", () => {
    const ballots = [["a"], ["a"], ["b"], ["c", "b"]];
    const first = instantRunoff(["a", "b", "c"], ballots);
    expect(first).toEqual(instantRunoff(["c", "a", "b"], ballots));
    expect(first.tieBreaks).toEqual([
      {
        tiedIds: ["b", "c"],
        eliminated: "c",
        rule: "eliminate_lexicographically_last_id",
      },
    ]);
    expect(first.tiedIds).toEqual(["a", "b"]);
  });
  it("counts exhausted ballots using only continuing ballots for majority", () => {
    const result = instantRunoff(
      ["a", "b", "c"],
      [["a"], ["a"], ["b"], ["c"], ["missing"]],
    );
    expect(result.rounds[0]?.exhausted).toBe(1);
    expect(result.rounds[1]?.exhausted).toBe(2);
    expect(result.winnerId).toBe("a");
  });
  it("simple polls return ties and never invent a winner with no votes", () => {
    expect(simplePoll(["a", "b"], [["a"], ["b"]]).tiedIds).toEqual(["a", "b"]);
    expect(simplePoll(["a"], []).winnerId).toBeNull();
    expect(simplePoll(["a", "b"], [["a"], ["a"], ["b"]]).winnerId).toBe("a");
  });
});
