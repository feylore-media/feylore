import { describe, it, expect } from "vitest";
import {
  canonicalValuesEqual,
} from "../src/server/modules/metadata/canonical.js";

describe("metadata canonical service helpers", () => {
  it("treats equal scalar values as unchanged", () => {
    expect(canonicalValuesEqual("The Hobbit", "The Hobbit")).toBe(true);
  });

  it("treats different scalar values as changed", () => {
    expect(
      canonicalValuesEqual("The Hobbit", "The Hobbit: 75th Anniversary"),
    ).toBe(false);
  });

  it("compares author arrays regardless of order formatting", () => {
    expect(canonicalValuesEqual(["Alice", "Bob"], ["Alice", "Bob"])).toBe(true);
    expect(canonicalValuesEqual(["Alice"], ["Bob"])).toBe(false);
  });
});
