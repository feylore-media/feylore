import { describe, expect, it } from "vitest";
import {
  renderTemplate,
  renderTitleTemplate,
  renderPathTemplate,
  validateTemplateFields,
  SAMPLE_METADATA_COMICS_CHAPTER,
} from "../src/shared/processing-templates.js";

describe("processing templates", () => {
  it("renders book title with date", () => {
    const title = renderTitleTemplate(
      "{Authors} - {Title} ({Published:yyyy})",
      {
        authors: ["Brandon Sanderson"],
        title: "The Final Empire",
        publicationDate: "2006-01-01",
      },
      "books",
      "epub",
    );
    expect(title).toBe("Brandon Sanderson - The Final Empire (2006).epub");
  });

  it("renders comics volume-only without dangling separators", () => {
    const title = renderTemplate(
      "{SeriesName} - v{SeriesNumber} - {Title} - {Authors}",
      { series: "One Piece", seriesNumber: "42" },
      "comics",
      "title",
    );
    expect(title).toBe("One Piece - v42");
  });

  it("renders comics chapter pattern", () => {
    const title = renderTemplate(
      "{SeriesName} - c{ChapterNumber} - {Title}",
      SAMPLE_METADATA_COMICS_CHAPTER,
      "comics",
      "title",
    );
    expect(title).toBe("Solo Leveling - c187");
  });

  it("builds nested path segments", () => {
    const dir = renderPathTemplate(
      "{Authors}/{SeriesName}/{Title}",
      {
        authors: ["Brandon Sanderson"],
        series: "Mistborn",
        title: "The Final Empire",
      },
      "books",
    );
    expect(dir).toBe(
      "Brandon Sanderson/Mistborn/The Final Empire",
    );
  });

  it("preserves commas in path templates", () => {
    const dir = renderPathTemplate(
      "{SeriesName}, Volume {SeriesNumber}",
      { series: "Test", seriesNumber: "1" },
      "comics",
    );
    expect(dir).toBe("Test, Volume 1");
  });

  it("rejects unsupported fields for module", () => {
    expect(
      validateTemplateFields("books", "{ChapterNumber}"),
    ).toContain("Unsupported");
  });

  it("rejects path traversal", () => {
    expect(validateTemplateFields("books", "../{Title}")).toContain(
      "traversal",
    );
  });
});
