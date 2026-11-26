import { describe, it, expect } from "vitest";
import { resolveStatsRequestRange } from "../src/server/modules/stats/service.js";
import {
  STATS_ALL_TIME_FROM,
  formatAvgRuntime,
  formatStatsDuration,
  formatStatsRangeLabel,
  isAllTimeRange,
  isStatsMediaType,
  parseStatsDate,
  resolveAllTimeRange,
  resolveStatsRange,
  statsMediaTypeFromWorkType,
  toStatsDate,
} from "../src/shared/stats.js";

// Anchor date used across range tests: 2026-09-22 (matches docs/STATS.md §2.2).
const NOW = new Date("2026-09-22T12:00:00.000Z");

describe("resolveStatsRequestRange", () => {
  it("returns the unbounded all-time range for the all-time selection", () => {
    expect(resolveStatsRequestRange(STATS_ALL_TIME_FROM, null)).toEqual({
      from: STATS_ALL_TIME_FROM,
      to: null,
      label: "All Time",
    });
  });

  it("canonicalizes anything else to a bounded range", () => {
    expect(resolveStatsRequestRange(null, null, NOW)).toEqual(
      resolveStatsRange(null, null, NOW),
    );
    // An explicit end date keeps the range bounded even from the epoch.
    const bounded = resolveStatsRequestRange(
      STATS_ALL_TIME_FROM,
      "2026-12-31",
      NOW,
    );
    expect(bounded.to).toBe("2026-12-31");
    expect(bounded.label).not.toBe("All Time");
  });
});

describe("parseStatsDate", () => {
  it("parses a valid calendar date", () => {
    expect(parseStatsDate("2026-03-15")?.toISOString()).toBe(
      "2026-03-15T00:00:00.000Z",
    );
  });

  it("rejects malformed and impossible dates", () => {
    expect(parseStatsDate(null)).toBeNull();
    expect(parseStatsDate("")).toBeNull();
    expect(parseStatsDate("nope")).toBeNull();
    expect(parseStatsDate("2026-13-01")).toBeNull();
    expect(parseStatsDate("2026-02-30")).toBeNull();
    expect(parseStatsDate("2026-1-1")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parseStatsDate("  2026-01-01  ")?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});

describe("toStatsDate", () => {
  it("round-trips through parseStatsDate", () => {
    expect(toStatsDate(new Date("2026-09-22T12:00:00.000Z"))).toBe("2026-09-22");
    expect(parseStatsDate(toStatsDate(NOW))?.getTime()).toBe(
      Date.UTC(2026, 8, 22),
    );
  });
});

describe("resolveStatsRange", () => {
  it("defaults absent values to the current calendar year", () => {
    expect(resolveStatsRange(null, null, NOW)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
      label: "2026",
    });
    expect(resolveStatsRange(undefined, undefined, NOW)).toEqual(
      resolveStatsRange(null, null, NOW),
    );
  });

  it("keeps an explicit open-ended from", () => {
    expect(resolveStatsRange("2026-03-15", null, NOW)).toEqual({
      from: "2026-03-15",
      to: "2026-12-31",
      label: "Mar 15 – Dec 31 '26",
    });
  });

  it("falls back to the start of the year for invalid or inverted input", () => {
    expect(resolveStatsRange("nope", null, NOW).from).toBe("2026-01-01");
    const inverted = resolveStatsRange("2026-05-01", "2026-04-01", NOW);
    expect(inverted.from).toBe("2026-01-01");
    expect(inverted.to).toBe("2026-04-01");
  });
});

describe("formatStatsRangeLabel", () => {
  it("labels every docs/STATS.md §2.2 case", () => {
    expect(formatStatsRangeLabel("2026-01-01", "2026-12-31")).toBe("2026");
    expect(formatStatsRangeLabel("2026-09-01", "2026-09-30")).toBe("Sep '26");
    expect(formatStatsRangeLabel("2026-06-15", "2026-09-20")).toBe(
      "Jun 15 – Sep 20 '26",
    );
    expect(formatStatsRangeLabel("2025-12-15", "2026-02-10")).toBe(
      "Dec '25 – Feb '26",
    );
    expect(formatStatsRangeLabel(STATS_ALL_TIME_FROM, null)).toBe("All Time");
  });

  it("labels single days", () => {
    expect(formatStatsRangeLabel("2026-09-01", "2026-09-01")).toBe("Sep '26");
    expect(formatStatsRangeLabel("2026-09-20", "2026-09-20")).toBe(
      "Sep 20 '26",
    );
    expect(formatStatsRangeLabel("2026-01-01", "2026-01-01")).toBe("2026");
  });
});

describe("all-time range", () => {
  it("resolves and detects the all-time range", () => {
    const range = resolveAllTimeRange();
    expect(range.from).toBe(STATS_ALL_TIME_FROM);
    expect(range.to).toBeNull();
    expect(range.label).toBe("All Time");
    expect(isAllTimeRange(range.from, range.to)).toBe(true);
    expect(isAllTimeRange("2026-01-01", "2026-12-31")).toBe(false);
    expect(isAllTimeRange(STATS_ALL_TIME_FROM, "2026-12-31")).toBe(false);
  });
});

describe("stats media types", () => {
  it("accepts the seven stats domains", () => {
    for (const domain of [
      "books",
      "audiobooks",
      "podcasts",
      "music",
      "movies",
      "tv",
      "ttrpg",
    ]) {
      expect(isStatsMediaType(domain)).toBe(true);
    }
    expect(isStatsMediaType("book")).toBe(false);
    expect(isStatsMediaType("")).toBe(false);
  });

  it("maps work types to stats media types", () => {
    expect(statsMediaTypeFromWorkType("book")).toBe("books");
    expect(statsMediaTypeFromWorkType("comic")).toBe("books");
    expect(statsMediaTypeFromWorkType("audiobook")).toBe("audiobooks");
    expect(statsMediaTypeFromWorkType("podcast_episode")).toBe("podcasts");
    expect(statsMediaTypeFromWorkType("album")).toBe("music");
    expect(statsMediaTypeFromWorkType("track")).toBe("music");
    expect(statsMediaTypeFromWorkType("movie")).toBe("movies");
    expect(statsMediaTypeFromWorkType("tv_episode")).toBe("tv");
    expect(statsMediaTypeFromWorkType("ttrpg_module")).toBe("ttrpg");
    expect(statsMediaTypeFromWorkType("tv_show")).toBeNull();
    expect(statsMediaTypeFromWorkType("unknown")).toBeNull();
  });
});

describe("duration formatting", () => {
  it("formats totals as compact durations", () => {
    expect(formatStatsDuration(0)).toBe("0m");
    expect(formatStatsDuration(1500)).toBe("25m");
    expect(formatStatsDuration(3600)).toBe("1h");
    expect(formatStatsDuration(5400)).toBe("1h 30m");
  });

  it("formats average runtimes with padded minutes", () => {
    expect(formatAvgRuntime(900)).toBe("15m");
    expect(formatAvgRuntime(3600)).toBe("1h 00m");
    expect(formatAvgRuntime(5400)).toBe("1h 30m");
  });
});
