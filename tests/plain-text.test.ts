import { describe, it, expect } from "vitest";
import { plainTextFromHtml } from "../src/shared/plain-text.js";

describe("plainTextFromHtml", () => {
  it("strips HTML tags", () => {
    expect(plainTextFromHtml("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello world",
    );
  });

  it("removes file:// links from text", () => {
    expect(
      plainTextFromHtml('<a href="file:///C:/secret">Download</a> notes'),
    ).toBe("Download notes");
  });

  it("decodes common entities", () => {
    expect(plainTextFromHtml("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });
});
