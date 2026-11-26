import { describe, expect, it } from "vitest";
import {
  GOAL_TEMPLATES,
  evaluateGoalRule,
  getGoalMetric,
  getGoalRuleFieldsForDomains,
} from "../src/shared/goals.js";

describe("Goals engine", () => {
  it("evaluates nested rule groups with predicate logic", () => {
    const rule = {
      type: "group",
      operator: "and",
      children: [
        { type: "predicate", field: "mediaType", operator: "eq", value: "book" },
        {
          type: "group",
          operator: "or",
          children: [
            { type: "predicate", field: "genre", operator: "eq", value: "Fantasy" },
            { type: "predicate", field: "genre", operator: "eq", value: "Horror" },
          ],
        },
      ],
    } as const;

    expect(
      evaluateGoalRule(
        { mediaType: "book", genre: "Fantasy" },
        rule,
      ),
    ).toBe(true);

    expect(
      evaluateGoalRule(
        { mediaType: "book", genre: "Nonfiction" },
        rule,
      ),
    ).toBe(false);
  });

  it("exposes cross-domain metrics and rule fields by domain selection", () => {
    expect(getGoalMetric("works")).toMatchObject({ id: "works", label: "Works" });
    expect(getGoalMetric("hours")).toMatchObject({ id: "hours", label: "Hours" });
    expect(getGoalRuleFieldsForDomains(["books", "audiobooks"]).some((field) => field.id === "genre")).toBe(true);
    expect(getGoalRuleFieldsForDomains(["books"]).some((field) => field.id === "runtimeMinutes")).toBe(false);
  });

  it("includes built-in goal templates", () => {
    expect(GOAL_TEMPLATES.some((template) => template.id === "annual-goal")).toBe(true);
    expect(GOAL_TEMPLATES.some((template) => template.id === "custom")).toBe(true);
  });
});
