import { describe, it, expect } from "vitest";
import { selectEdition } from "../src/providers/hardcover/edition-selection.js";
import type { HardcoverEdition } from "../src/providers/hardcover/types.js";

const richEdition: HardcoverEdition = {
  id: 2,
  isbn_13: "9780000000002",
  isbn_10: "0000000002",
  pages: 500,
  publisher: { name: "Rich Publisher" },
  physical_format: "Hardcover",
  language: { language: "English" },
};

const hintedEdition: HardcoverEdition = {
  id: 10,
  isbn_13: "9780091953638",
  isbn_10: "0091953635",
  pages: 300,
  publisher: { name: "Hinted Publisher" },
};

describe("hardcover edition-selection", () => {
  it("returns undefined when no editions", () => {
    expect(selectEdition([], { isbn13: "9780091953638" })).toBeUndefined();
  });

  it("returns the only edition when there is one", () => {
    expect(selectEdition([hintedEdition], { isbn13: "9780091953638" })).toBe(
      hintedEdition,
    );
  });

  it("prefers hinted ISBN over a richer non-matching edition", () => {
    const selected = selectEdition([richEdition, hintedEdition], {
      isbn13: "9780091953638",
    });
    expect(selected).toBe(hintedEdition);
    expect(selected?.publisher?.name).toBe("Hinted Publisher");
  });

  it("matches isbn10 hint when isbn13 hint is absent", () => {
    const selected = selectEdition([richEdition, hintedEdition], {
      isbn10: "0091953635",
    });
    expect(selected).toBe(hintedEdition);
  });

  it("tie-breaks duplicate hinted ISBN rows by lowest edition id", () => {
    const duplicateA: HardcoverEdition = {
      id: 5,
      isbn_13: "9780091953638",
    };
    const duplicateB: HardcoverEdition = {
      id: 3,
      isbn_13: "9780091953638",
    };
    const selected = selectEdition([duplicateA, duplicateB], {
      isbn13: "9780091953638",
    });
    expect(selected).toBe(duplicateB);
  });

  it("falls back to lowest edition id when no ISBN hint matches", () => {
    const editionA: HardcoverEdition = { id: 8 };
    const editionB: HardcoverEdition = { id: 4 };
    expect(selectEdition([editionA, editionB])).toBe(editionB);
  });
});
