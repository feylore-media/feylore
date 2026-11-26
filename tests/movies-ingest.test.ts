import { describe, it, expect } from "vitest";
import { parseMovieFilename } from "../src/server/modules/ingest/organizers/movies.js";

describe("parseMovieFilename", () => {
  it("parses Title (Year).ext", () => {
    expect(parseMovieFilename("The Matrix (1999).mp4")).toEqual({
      title: "The Matrix",
      year: "1999",
    });
  });

  it("parses Title - Year.ext", () => {
    expect(parseMovieFilename("Blade Runner - 1982.mkv")).toEqual({
      title: "Blade Runner",
      year: "1982",
    });
  });

  it("returns title only when no year", () => {
    expect(parseMovieFilename("Inception.webm")).toEqual({
      title: "Inception",
    });
  });
});
