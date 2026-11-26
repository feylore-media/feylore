import { describe, it, expect } from "vitest";
import {
  isShareableQuoteAnnotation,
  quoteTextFromAnnotation,
} from "../src/shared/club-quotes.js";

describe("quoteTextFromAnnotation", () => {
  it("uses highlight text when available", () => {
    expect(
      quoteTextFromAnnotation({
        highlightText: "It was the best of times.",
        note: null,
      }),
    ).toBe("It was the best of times.");
  });

  it("combines highlight and note when both exist", () => {
    expect(
      quoteTextFromAnnotation({
        highlightText: "Call me Ishmael.",
        note: "Great opening",
      }),
    ).toBe("Call me Ishmael.\n\n— Great opening");
  });

  it("returns null when annotation has no shareable text", () => {
    expect(
      isShareableQuoteAnnotation({ highlightText: null, note: null }),
    ).toBe(false);
  });
});
