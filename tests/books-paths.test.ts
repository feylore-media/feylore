import { describe, it, expect } from "vitest";
import {
  bookPath,
  bookMetadataPath,
  bookJournalPath,
  bookDnaPath,
  bookHistoryPath,
  bookEditPath,
} from "../src/web/routes/paths";

describe("book path helpers", () => {
  it("builds detail tab paths", () => {
    const slug = "the-hobbit";
    expect(bookPath(slug)).toBe("/books/the-hobbit");
    expect(bookMetadataPath(slug)).toBe("/books/the-hobbit/metadata");
    expect(bookJournalPath(slug)).toBe("/books/the-hobbit/journal");
    expect(bookDnaPath(slug)).toBe("/books/the-hobbit/dna");
    expect(bookHistoryPath(slug)).toBe("/books/the-hobbit/history");
    expect(bookEditPath(slug)).toBe("/books/the-hobbit/edit");
  });
});
