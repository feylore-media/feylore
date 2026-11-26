import { describe, expect, it } from "vitest";
import { aggregateParticipantRatings } from "../src/server/modules/clubs/rating-aggregate.js";

describe("Club participant rating aggregation", () => {
  it("prefers finalized reviews to fallback stars and counts recommendations separately", () => {
    const result = aggregateParticipantRatings(
      [
        {
          userId: "a",
          finalRating: 4.5,
          recommendation: "yes",
          coreValues: { characters: 4 },
          trajectory: null,
        },
        {
          userId: "b",
          finalRating: null,
          recommendation: "no",
          coreValues: null,
          trajectory: null,
        },
      ],
      [
        { userId: "a", rating: 2 },
        { userId: "b", rating: 3 },
        { userId: "c", rating: 5 },
      ],
    );
    expect(result.values).toEqual([4.5, 3, 5]);
    expect(result.ratingCount).toBe(3);
    expect(result.recommendations).toBe(1);
    expect(result.recommendationCount).toBe(2);
    expect(result.coreValues).toEqual({});
  });

  it("interpolates only within recorded trajectories with two contributors", () => {
    const result = aggregateParticipantRatings(
      [
        {
          userId: "a",
          finalRating: null,
          recommendation: null,
          coreValues: null,
          trajectory: [
            { progress: 0, rating: 3 },
            { progress: 100, rating: 5 },
          ],
        },
        {
          userId: "b",
          finalRating: null,
          recommendation: null,
          coreValues: null,
          trajectory: [
            { progress: 25, rating: 4 },
            { progress: 75, rating: 4 },
          ],
        },
        {
          userId: "c",
          finalRating: null,
          recommendation: null,
          coreValues: null,
          trajectory: [{ progress: 100, rating: 2 }],
        },
      ],
      [],
    );
    expect(result.trajectory).toEqual([
      { progress: 25, rating: 3.75 },
      { progress: 75, rating: 4.25 },
      { progress: 100, rating: 3.5 },
    ]);
  });
});
