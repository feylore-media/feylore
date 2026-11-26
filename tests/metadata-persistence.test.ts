import { describe, it, expect } from "vitest";
import {
  canonicalFieldsToBibliographic,
} from "../src/server/modules/metadata/epub-opf-write.js";
import { sidecarPathForFile, SIDECAR_SUFFIX } from "../src/server/modules/metadata/metadata-persistence-sync.js";

describe("metadata persistence helpers", () => {
  it("maps canonical fields to bibliographic shape", () => {
    const bibliographic = canonicalFieldsToBibliographic({
      title: "Dune",
      subtitle: "Book One",
      authors: ["Frank Herbert"],
      genres: ["Science Fiction"],
      isbn13: "9780441172719",
    });

    expect(bibliographic.title).toBe("Dune");
    expect(bibliographic.subtitle).toBe("Book One");
    expect(bibliographic.authors).toEqual(["Frank Herbert"]);
    expect(bibliographic.subjects).toEqual(["Science Fiction"]);
    expect(bibliographic.identifiers[0]?.value).toBe("9780441172719");
  });

  it("uses Feylore sidecar suffix adjacent to file path", () => {
    expect(sidecarPathForFile("books/Dune.epub")).toBe(
      `books/Dune.epub${SIDECAR_SUFFIX}`,
    );
  });
});
