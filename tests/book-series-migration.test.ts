import { describe, it, expect } from "vitest";
import { parseCombinedSeriesValue } from "../src/shared/series-normalization.js";
import { readFile } from "node:fs/promises";

describe("series normalization", () => {
  it("parses legacy combined series values", () => {
    expect(parseCombinedSeriesValue("The Wheel of Time #3")).toEqual({
      name: "The Wheel of Time",
      position: 3,
    });
  });

  it("returns name-only values without position", () => {
    expect(parseCombinedSeriesValue("The Wheel of Time")).toEqual({
      name: "The Wheel of Time",
      position: null,
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseCombinedSeriesValue("  Dune #1  ")).toEqual({
      name: "Dune",
      position: 1,
    });
  });
});

describe("series migration SQL", () => {
  it("updates positions before stripping combined series names", async () => {
    const sql = await readFile("drizzle/0027_book_canonical_metadata.sql", "utf8");
    const positionIdx = sql.indexOf('UPDATE "book_series_members"');
    const nameIdx = sql.indexOf('UPDATE "book_series"');
    expect(positionIdx).toBeGreaterThan(-1);
    expect(nameIdx).toBeGreaterThan(positionIdx);
  });
});
