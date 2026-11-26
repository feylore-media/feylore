import { describe, it, expect } from "vitest";
import { parseTvPath } from "../src/server/modules/tv/import-heuristics.js";

describe("parseTvPath", () => {
  it("parses S01E05 in filename", () => {
    const parsed = parseTvPath("Shows/Demo Show/Demo Show - S01E05 - Pilot.mkv");
    expect(parsed).toMatchObject({
      showTitle: "Demo Show",
      seasonNumber: 1,
      episodeNumber: 5,
    });
  });

  it("maps specials folder to season 0", () => {
    const parsed = parseTvPath("Demo Show/Specials/Demo Show - S00E01.mkv");
    expect(parsed?.seasonNumber).toBe(0);
    expect(parsed?.episodeNumber).toBe(1);
  });

  it("parses 1x05 notation", () => {
    const parsed = parseTvPath("Demo Show/Season 1/Demo Show 1x05.mkv");
    expect(parsed).toMatchObject({
      seasonNumber: 1,
      episodeNumber: 5,
    });
  });
});
