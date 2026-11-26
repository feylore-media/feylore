import { describe, expect, it } from "vitest";
import {
  aggregateGoalCandidates,
  evaluateCandidate,
} from "../src/shared/goal-evaluation.js";
import type { GoalRecord } from "../src/shared/goals.js";

const baseGoal: Pick<GoalRecord, "domains" | "startsAt" | "endsAt" | "rule"> = {
  domains: ["books"],
  startsAt: "2027-01-01T00:00:00.000Z",
  endsAt: "2028-01-01T00:00:00.000Z",
  rule: null,
};

describe("Goal evaluation", () => {
  it("uses an inclusive start and exclusive end period", () => {
    const atStart = evaluateCandidate(baseGoal, {
      workType: "book",
      workId: "start",
      occurredAt: "2027-01-01T00:00:00.000Z",
      attributes: {},
    });
    const atEnd = evaluateCandidate(baseGoal, {
      workType: "book",
      workId: "end",
      occurredAt: "2028-01-01T00:00:00.000Z",
      attributes: {},
    });

    expect(atStart.eligible).toBe(true);
    expect(atEnd.eligible).toBe(false);
    expect(atEnd.failures[0]?.predicate).toBe("period.endsAt");
  });

  it("explains nested AND/OR rule failures and fails closed on unknown metadata", () => {
    const result = evaluateCandidate(
      {
        ...baseGoal,
        rule: {
          type: "group",
          operator: "and",
          children: [
            {
              type: "predicate",
              field: "genre",
              operator: "eq",
              value: "Fantasy",
            },
            {
              type: "group",
              operator: "or",
              children: [
                { type: "predicate", field: "creator.gender", operator: "eq", value: "woman" },
                { type: "predicate", field: "country", operator: "eq", value: "GB" },
              ],
            },
          ],
        },
      },
      {
        workType: "book",
        workId: "unknown",
        occurredAt: "2027-06-01T00:00:00.000Z",
        attributes: { genre: ["Fantasy"] },
      },
    );

    expect(result.eligible).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((failure) => failure.predicate)).toEqual([
      "creator.gender eq \"woman\"",
      "country eq \"GB\"",
    ]);
  });

  it("deduplicates manifestations and rereads at Work identity for count goals", () => {
    const progress = aggregateGoalCandidates(
      { metric: "works", target: 2, aggregation: { kind: "count" } },
      [
        { workType: "book", workId: "one", occurredAt: "2027-02-01", attributes: {} },
        { workType: "book", workId: "one", occurredAt: "2027-03-01", attributes: {} },
        { workType: "book", workId: "two", occurredAt: "2027-04-01", attributes: {} },
      ],
    );

    expect(progress.current).toBe(2);
    expect(progress.qualifyingItems).toBe(3);
    expect(progress.completed).toBe(true);
  });

  it("does not count missing distinct dimensions and keeps future goals incomplete", () => {
    const progress = aggregateGoalCandidates(
      { metric: "works", target: 1, aggregation: { kind: "count_distinct", field: "creator" } },
      [
        { workType: "book", workId: "missing", occurredAt: "2027-01-01", attributes: {} },
        { workType: "book", workId: "known", occurredAt: "2027-01-01", attributes: { creator: "A" } },
      ],
    );

    expect(progress.current).toBe(1);
    expect(progress.completed).toBe(true);
    expect(
      evaluateCandidate(
        { ...baseGoal, startsAt: "2028-01-01T00:00:00.000Z" },
        {
          workType: "book",
          workId: "future",
          occurredAt: "2027-06-01T00:00:00.000Z",
          attributes: {},
        },
      ).eligible,
    ).toBe(false);
  });

  it("reports missing contribution data for sum aggregations", () => {
    const progress = aggregateGoalCandidates(
      { metric: "pages", target: 100, aggregation: { kind: "sum", field: "pages" } },
      [
        { workType: "book", workId: "known", occurredAt: "2027-01-01", attributes: { consumedPages: 40 } },
        { workType: "book", workId: "unknown", occurredAt: "2027-01-02", attributes: {} },
      ],
    );

    expect(progress.current).toBe(40);
    expect(progress.qualifyingItems).toBe(2);
    expect(progress.contributingItems).toBe(1);
    expect(progress.missingContributionData).toBe(1);
  });
});