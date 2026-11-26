import { describe, it, expect } from "vitest";
import {
  compareConsumptionToProgress,
  parseDiscordSpoilerInput,
  parseStoredPostBody,
  prepareClubPostBody,
  segmentsToPlainText,
} from "../src/shared/club-spoiler.js";
import type { ConsumptionTarget } from "../src/shared/clubs.js";
import type { ProgressLocator } from "../src/shared/progress-locator.js";

describe("parseDiscordSpoilerInput", () => {
  it("parses explicit spoiler markers into segments", () => {
    const segments = parseDiscordSpoilerInput(
      "Before ||hidden|| after ||more||",
    );
    expect(segments).toEqual([
      { type: "text", text: "Before " },
      { type: "spoiler", text: "hidden" },
      { type: "text", text: " after " },
      { type: "spoiler", text: "more" },
    ]);
  });

  it("returns plain text segment when no markers exist", () => {
    expect(parseDiscordSpoilerInput("hello")).toEqual([
      { type: "text", text: "hello" },
    ]);
  });
});

describe("prepareClubPostBody", () => {
  it("stores structured bodies when spoiler markers are present", () => {
    const prepared = prepareClubPostBody("Look ||away||");
    expect(prepared.bodyFormat).toBe("structured");
    expect(JSON.parse(prepared.storageBody)).toEqual([
      { type: "text", text: "Look " },
      { type: "spoiler", text: "away" },
    ]);
    expect(prepared.plainText).toBe("Look away");
  });
});

describe("parseStoredPostBody", () => {
  it("reads structured storage back into segments", () => {
    const body = JSON.stringify([
      { type: "text", text: "x" },
      { type: "spoiler", text: "y" },
    ]);
    const parsed = parseStoredPostBody("structured", body);
    expect(parsed.segments).toHaveLength(2);
    expect(segmentsToPlainText(parsed.segments)).toBe("xy");
  });
});

describe("compareConsumptionToProgress", () => {
  const chapterEight: ConsumptionTarget = { kind: "chapter", start: 8, count: 1 };

  it("returns before when viewer chapter is behind anchor", () => {
    const progress: ProgressLocator = {
      kind: "reading",
      type: "epub-cfi",
      title: "Chapter 7",
    };
    expect(
      compareConsumptionToProgress(chapterEight, { progress }),
    ).toBe("before");
  });

  it("returns at_or_after when viewer chapter reaches anchor", () => {
    const progress: ProgressLocator = {
      kind: "reading",
      type: "epub-cfi",
      title: "Chapter 8",
    };
    expect(
      compareConsumptionToProgress(chapterEight, { progress }),
    ).toBe("at_or_after");
  });

  it("returns unknown when progress is unreliable", () => {
    const progress: ProgressLocator = {
      kind: "reading",
      type: "epub-cfi",
      progression: 0.42,
    };
    expect(
      compareConsumptionToProgress(chapterEight, { progress }),
    ).toBe("unknown");
  });

  it("compares TV episode progress when available", () => {
    const consumption: ConsumptionTarget = { kind: "episode", start: 5 };
    expect(
      compareConsumptionToProgress(consumption, {
        progress: null,
        tvContinue: { seasonNumber: 1, episodeNumber: 4 },
      }),
    ).toBe("before");
    expect(
      compareConsumptionToProgress(consumption, {
        progress: null,
        tvContinue: { seasonNumber: 1, episodeNumber: 5 },
      }),
    ).toBe("at_or_after");
  });
});
