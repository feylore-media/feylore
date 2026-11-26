import { describe, it, expect } from "vitest";
import { formatSourceOrderSummary } from "../src/web/components/metadata/formatSourceOrderSummary.js";

const name = (key: string) =>
  ({
    hardcover: "Hardcover",
    "open-library": "Open Library",
    "apple-books": "Apple Books",
    "google-books": "Google Books",
    embedded: "Embedded",
  })[key] ?? key;

describe("formatSourceOrderSummary", () => {
  it("returns empty string for no sources", () => {
    expect(formatSourceOrderSummary([], name)).toBe("");
  });

  it("formats a single source", () => {
    expect(formatSourceOrderSummary(["hardcover"], name)).toBe("Hardcover");
  });

  it("formats up to maxVisible sources without truncation", () => {
    expect(
      formatSourceOrderSummary(
        ["hardcover", "open-library", "apple-books"],
        name,
      ),
    ).toBe("Hardcover → Open Library → Apple Books");
  });

  it("truncates with + N when more sources remain", () => {
    expect(
      formatSourceOrderSummary(
        [
          "hardcover",
          "open-library",
          "apple-books",
          "google-books",
          "embedded",
        ],
        name,
        3,
      ),
    ).toBe("Hardcover → Open Library → Apple Books + 2");
  });

  it("respects custom maxVisible", () => {
    expect(
      formatSourceOrderSummary(
        ["hardcover", "open-library", "apple-books", "google-books"],
        name,
        2,
      ),
    ).toBe("Hardcover → Open Library + 2");
  });
});
