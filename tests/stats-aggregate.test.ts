import { describe, it, expect } from "vitest";
import {
  aggregateFacts,
  type FactRow,
} from "../src/server/modules/stats/service.js";

const RANGE = { from: "2026-01-01", to: "2026-12-31" };

function row(partial: Partial<FactRow> & { kind: FactRow["kind"] }): FactRow {
  return {
    mediaType: "books",
    subjectType: "book",
    subjectId: "abc123",
    occurredAt: new Date("2026-03-10T12:00:00.000Z"),
    value: 1,
    unit: "count",
    ratingScale: null,
    snapshot: {},
    ...partial,
  };
}

function bookSnapshot(title: string) {
  return {
    snapshotVersion: 1,
    title,
    creators: [{ role: "author", name: "Ada Author", peopleId: null }],
    genres: [{ name: "Fantasy" }],
    releaseYear: 2019,
    durationSeconds: null,
    coverFileId: null,
  };
}

function fixtureRows(): FactRow[] {
  return [
    row({
      kind: "completed",
      subjectId: "book-a",
      occurredAt: new Date("2026-03-10T10:00:00.000Z"),
      snapshot: bookSnapshot("Book A"),
    }),
    row({
      kind: "completed",
      subjectId: "book-b",
      occurredAt: new Date("2026-03-10T11:00:00.000Z"),
      snapshot: {
        ...bookSnapshot("Book B"),
        releaseYear: 2021,
      },
    }),
    row({
      kind: "completed",
      mediaType: "movies",
      subjectType: "movie",
      subjectId: "movie-1",
      occurredAt: new Date("2026-05-01T20:00:00.000Z"),
      snapshot: {
        snapshotVersion: 1,
        title: "Movie One",
        creators: [{ role: "director", name: "Rex Director", peopleId: null }],
        genres: [{ name: "Sci-Fi" }],
        releaseYear: 2020,
        durationSeconds: 7200,
        coverFileId: null,
      },
    }),
    row({
      kind: "rated",
      subjectId: "book-a",
      occurredAt: new Date("2026-03-11T10:00:00.000Z"),
      value: 5,
      unit: "stars",
      ratingScale: 5,
      snapshot: bookSnapshot("Book A"),
    }),
    row({
      kind: "rated",
      mediaType: "movies",
      subjectType: "movie",
      subjectId: "movie-1",
      occurredAt: new Date("2026-05-03T20:00:00.000Z"),
      value: 8,
      unit: "stars",
      ratingScale: 10,
      snapshot: { snapshotVersion: 1, title: "Movie One" },
    }),
    row({
      kind: "session",
      subjectId: "book-a",
      occurredAt: new Date("2026-03-10T12:00:00.000Z"),
      value: 3600,
      unit: "seconds",
    }),
    row({
      kind: "session",
      subjectId: "book-b",
      occurredAt: new Date("2026-05-01T12:00:00.000Z"),
      value: 1800,
      unit: "seconds",
    }),
    row({
      kind: "play",
      mediaType: "movies",
      subjectType: "movie",
      subjectId: "movie-1",
      occurredAt: new Date("2026-05-02T20:00:00.000Z"),
      unit: "plays",
    }),
  ];
}

describe("aggregateFacts headline", () => {
  it("counts completions per domain and sums observed reading time", () => {
    const result = aggregateFacts(fixtureRows(), RANGE);
    expect(result.headline.totalCompleted).toBe(3);
    expect(result.headline.domainCounts).toEqual([
      { mediaType: "books", count: 2 },
      { mediaType: "movies", count: 1 },
    ]);
    expect(result.headline.readingSeconds).toBe(5400);
    // 03-10, 03-11, 05-01, 05-02, 05-03.
    expect(result.headline.activeDays).toBe(5);
  });

  it("lists only media types that have facts", () => {
    const result = aggregateFacts(fixtureRows(), RANGE);
    expect(result.media).toEqual([
      { mediaType: "books", label: "books" },
      { mediaType: "movies", label: "movies" },
    ]);
  });
});

describe("aggregateFacts time series", () => {
  it("buckets completions, sessions, plays, and reading seconds by month", () => {
    const result = aggregateFacts(fixtureRows(), RANGE);
    expect(result.timeSeries.ticks).toHaveLength(12);
    expect(result.timeSeries.ticks[0]).toEqual({
      key: "2026-01",
      label: "Jan 26",
    });
    expect(result.timeSeries.buckets).toHaveLength(12);

    const march = result.timeSeries.buckets[2]!;
    expect(march.key).toBe("2026-03");
    expect(march.completed).toBe(2);
    expect(march.sessions).toBe(1);
    expect(march.plays).toBe(0);
    expect(march.readingSeconds).toBe(3600);

    const may = result.timeSeries.buckets[4]!;
    expect(may.completed).toBe(1);
    expect(may.sessions).toBe(1);
    expect(may.plays).toBe(1);
    expect(may.readingSeconds).toBe(1800);

    expect(result.timeSeries.buckets[0]).toMatchObject({
      completed: 0,
      sessions: 0,
      plays: 0,
      readingSeconds: 0,
    });
  });
});

describe("aggregateFacts rating", () => {
  it("averages mixed-scale ratings with the smallest bucket size", () => {
    const result = aggregateFacts(fixtureRows(), RANGE);
    expect(result.rating.count).toBe(2);
    expect(result.rating.avg).toBe(6.5);
    expect(result.rating.bucketSize).toBe(5);
    expect(result.rating.distribution).toEqual([
      { value: 5, count: 1 },
      { value: 8, count: 1 },
    ]);
  });

  it("caps highlights at the top 8 by rating, then recency", () => {
    const rated = Array.from({ length: 10 }, (_, i) =>
      row({
        kind: "rated",
        subjectId: `book-${i}`,
        occurredAt: new Date(`2026-02-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`),
        value: i + 1 > 5 ? 5 : i + 1,
        unit: "stars",
        ratingScale: 5,
        snapshot: bookSnapshot(`Book ${i}`),
      }),
    );
    const result = aggregateFacts(rated, RANGE);
    expect(result.highlights).toHaveLength(8);
    expect(result.highlights[0]!.rating).toBe(5);
  });
});

describe("aggregateFacts breakdowns", () => {
  it("derives genres, creators, and release years from completions only", () => {
    const result = aggregateFacts(fixtureRows(), RANGE);
    expect(result.genres).toEqual([
      { name: "Fantasy", count: 2, share: 66.7 },
      { name: "Sci-Fi", count: 1, share: 33.3 },
    ]);
    expect(result.creators).toEqual([
      { role: "author", name: "Ada Author", peopleId: null, count: 2 },
      { role: "director", name: "Rex Director", peopleId: null, count: 1 },
    ]);
    expect(result.releaseYears).toEqual([
      { year: 2021, count: 1 },
      { year: 2020, count: 1 },
      { year: 2019, count: 1 },
    ]);
  });

  it("totals runtime only from completions that carry a duration", () => {
    const result = aggregateFacts(fixtureRows(), RANGE);
    expect(result.duration).toEqual({
      completedCount: 1,
      avgSeconds: 7200,
      totalSeconds: 7200,
    });

    const booksOnly = aggregateFacts(
      fixtureRows().filter((r) => r.mediaType === "books"),
      RANGE,
    );
    expect(booksOnly.duration).toBeNull();
  });
});

describe("aggregateFacts heatmap", () => {
  it("covers the trailing twelve months ending at the range end", () => {
    const result = aggregateFacts(fixtureRows(), RANGE);
    // Dec 2025 (31 days) + all of 2026 (365 days).
    expect(result.heatmap).toHaveLength(396);
    const byDay = new Map(result.heatmap.map((d) => [d.day, d.count]));
    expect(byDay.get("2026-03-10")).toBe(3);
    expect(byDay.get("2026-03-11")).toBe(1);
    expect(byDay.get("2026-05-03")).toBe(1);
    expect(byDay.get("2026-01-15")).toBe(0);
    expect(byDay.get("2025-12-01")).toBe(0);
  });
});

describe("aggregateFacts empty input", () => {
  it("returns honest zeros with no facts", () => {
    const result = aggregateFacts([], RANGE);
    expect(result.headline).toEqual({
      domainCounts: [],
      totalCompleted: 0,
      activeDays: 0,
      readingSeconds: 0,
    });
    expect(result.media).toEqual([]);
    expect(result.rating).toEqual({
      bucketSize: 5,
      avg: null,
      count: 0,
      distribution: [],
    });
    expect(result.genres).toEqual([]);
    expect(result.creators).toEqual([]);
    expect(result.releaseYears).toEqual([]);
    expect(result.duration).toBeNull();
    expect(result.highlights).toEqual([]);
    expect(result.timeSeries.buckets).toHaveLength(12);
    expect(
      result.timeSeries.buckets.every(
        (b) =>
          b.completed === 0 &&
          b.sessions === 0 &&
          b.plays === 0 &&
          b.readingSeconds === 0,
      ),
    ).toBe(true);
    expect(result.heatmap).toHaveLength(396);
    expect(result.heatmap.every((d) => d.count === 0)).toBe(true);
  });
});
