import { describe, it, expect } from "vitest";
import {
  calculateSuggestedRating,
  normalizeTrajectory,
  ratingScaleOptions,
  ratingStep,
  roundRating,
  DEFAUL_RATING_SYSTEM_SETTINGS,
} from "../src/shared/ratings.js";
import type { RatingSystemSettings } from "../src/shared/ratings.js";

type CalculationOverrides = Partial<RatingSystemSettings["calculation"]>;

function settings(
  overrides: Partial<Omit<RatingSystemSettings, "calculation">> & {
    calculation?: CalculationOverrides;
  } = {},
): RatingSystemSettings {
  return {
    ...DEFAUL_RATING_SYSTEM_SETTINGS,
    ...overrides,
    calculation: {
      ...DEFAUL_RATING_SYSTEM_SETTINGS.calculation,
      ...overrides.calculation,
    },
  } as RatingSystemSettings;
}

describe("ratingStep", () => {
  it("uses half-star steps on a 5-star scale when half stars are allowed", () => {
    expect(ratingStep(5, true)).toBe(0.5);
  });

  it("uses whole steps on a 5-star scale when half stars are disallowed", () => {
    expect(ratingStep(5, false)).toBe(1);
  });

  it("always uses whole steps on a 10-star scale", () => {
    expect(ratingStep(10, true)).toBe(1);
    expect(ratingStep(10, false)).toBe(1);
  });
});

describe("roundRating", () => {
  it("rounds to the nearest step", () => {
    expect(roundRating(4.25, 0.5)).toBe(4.5);
    expect(roundRating(3.7, 1)).toBe(4);
  });
});

describe("ratingScaleOptions", () => {
  it("returns half-star options when allowed", () => {
    expect(ratingScaleOptions(settings({ scale: 5, allowHalfStars: true }))).toEqual(
      [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
    );
  });

  it("returns whole options for a 10-star scale", () => {
    expect(
      ratingScaleOptions(settings({ scale: 10, allowHalfStars: true })),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("normalizeTrajectory", () => {
  it("deduplicates, clamps, and sorts trajectory points", () => {
    const input = [
      { progress: 25, rating: 3 },
      { progress: 101, rating: 2 },
      { progress: 25, rating: 4 },
      { progress: 50, rating: 0 },
    ];
    expect(normalizeTrajectory(input)).toEqual([
      { progress: 25, rating: 4 },
      { progress: 50, rating: 1 },
      { progress: 100, rating: 2 },
    ]);
  });

  it("returns empty for no points", () => {
    expect(normalizeTrajectory([])).toEqual([]);
  });
});

describe("calculateSuggestedRating", () => {
  it("returns null when nothing contributes", () => {
    expect(
      calculateSuggestedRating({
        core: [],
        genreGroups: [],
        trajectory: [],
        settings: settings({}),
      }),
    ).toBeNull();
  });

  it("averages core dimensions", () => {
    const result = calculateSuggestedRating({
      core: [
        { value: 5, weight: 1 },
        { value: 4, weight: 1 },
      ],
      genreGroups: [],
      trajectory: [],
      settings: settings({}),
    });
    expect(result).toBe(4.5);
  });

  it("clamps to the scale", () => {
    const result = calculateSuggestedRating({
      core: [{ value: 10, weight: 1 }],
      genreGroups: [],
      trajectory: [],
      settings: settings({ scale: 5, allowHalfStars: true }),
    });
    expect(result).toBe(5);
  });

  it("ignores unset dimensions by default", () => {
    const result = calculateSuggestedRating({
      core: [
        { value: 5, weight: 1 },
        { value: 0, weight: 1 },
      ],
      genreGroups: [],
      trajectory: [],
      settings: settings({}),
    });
    expect(result).toBe(5);
  });

  it("treats unset dimensions as a neutral value when configured", () => {
    const result = calculateSuggestedRating({
      core: [
        { value: 5, weight: 1 },
        { value: 0, weight: 1 },
      ],
      genreGroups: [],
      trajectory: [],
      settings: settings({
        calculation: { missingValueMode: "neutral" },
      }),
    });
    expect(result).toBe(4);
  });

  it("honors rounding mode floor and ceil", () => {
    const input = {
      core: [
        { value: 5, weight: 1 },
        { value: 4, weight: 1 },
      ],
      genreGroups: [],
      trajectory: [],
    };
    expect(
      calculateSuggestedRating({
        ...input,
        settings: settings({ calculation: { rounding: "floor" } }),
      }),
    ).toBe(4);
    expect(
      calculateSuggestedRating({
        ...input,
        settings: settings({ calculation: { rounding: "ceil" } }),
      }),
    ).toBe(5);
  });

  it("combines core and genre groups with weights", () => {
    const result = calculateSuggestedRating({
      core: [{ value: 5, weight: 1 }],
      genreGroups: [[{ value: 4, weight: 1 }]],
      trajectory: [],
      settings: settings({
        calculation: { coreWeight: 2, genreWeight: 1 },
      }),
    });
    // weighted mean (5*2 + 4*1) / 3 = 4.667 -> nearest half step = 4.5
    expect(result).toBe(4.5);
  });

  it("incorporates trajectory when enabled", () => {
    const result = calculateSuggestedRating({
      core: [{ value: 5, weight: 1 }],
      genreGroups: [],
      trajectory: [{ value: 3, weight: 1 }],
      settings: settings({
        calculation: { useTrajectory: true, trajectoryWeight: 1 },
      }),
    });
    // mean(5, 3) = 4
    expect(result).toBe(4);
  });

  it("returns null when only trajectory is enabled but empty", () => {
    expect(
      calculateSuggestedRating({
        core: [],
        genreGroups: [],
        trajectory: [],
        settings: settings({
          calculation: { useTrajectory: true, trajectoryWeight: 1 },
        }),
      }),
    ).toBeNull();
  });
});