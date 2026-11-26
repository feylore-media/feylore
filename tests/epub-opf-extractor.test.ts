import { describe, it, expect } from "vitest";
import {
  parseOpf,
  detectIsbn,
  toBibliographic,
  readEpubContainer,
} from "../src/server/modules/metadata/extractors/epub-opf.js";
import { buildMinimalEpub } from "./fixtures/epub/build-minimal-epub.js";
import JSZip from "jszip";

describe("EPUB OPF bibliographic extractor", () => {
  it("parses title, authors, subjects, description, and language", async () => {
    const buffer = await buildMinimalEpub({
      title: "The Great Novel",
      subtitle: "Volume One",
      authors: ["Jane Author", "John Coauthor"],
      subjects: ["Fiction", "Adventure"],
    });
    const zip = await JSZip.loadAsync(buffer);
    const { opfDir, opfXml } = await readEpubContainer(zip);
    const parsed = parseOpf(opfXml, opfDir);
    const bib = toBibliographic(parsed);

    expect(bib.title).toBe("The Great Novel");
    expect(bib.subtitle).toBe("Volume One");
    expect(bib.authors).toEqual(["Jane Author", "John Coauthor"]);
    expect(bib.subjects).toEqual(["Fiction", "Adventure"]);
    expect(bib.description).toBe("A test description");
    expect(bib.language).toBe("en");
  });

  it("detects ISBN identifiers", async () => {
    const buffer = await buildMinimalEpub({
      isbn: "978-0-123456-78-9",
    });
    const zip = await JSZip.loadAsync(buffer);
    const { opfDir, opfXml } = await readEpubContainer(zip);
    const parsed = parseOpf(opfXml, opfDir);

    const isbn = detectIsbn(parsed.identifiers);
    expect(isbn).not.toBeNull();
    expect(isbn!.type).toBe("isbn");
    expect(isbn!.value).toBe("978-0-123456-78-9");
  });

  it("finds cover-image manifest item", async () => {
    const buffer = await buildMinimalEpub({
      title: "Cover Book",
      withCover: true,
    });
    const zip = await JSZip.loadAsync(buffer);
    const { opfDir, opfXml } = await readEpubContainer(zip);
    const parsed = parseOpf(opfXml, opfDir);

    expect(parsed.cover).toBeDefined();
    expect(parsed.cover!.href).toBe("cover.jpg");
    expect(parsed.cover!.mediaType).toBe("image/jpeg");
  });

  it("preserves reader spine and nav fields", async () => {
    const buffer = await buildMinimalEpub({
      withToc: true,
      withMediaOverlay: true,
    });
    const zip = await JSZip.loadAsync(buffer);
    const { opfDir, opfXml } = await readEpubContainer(zip);
    const parsed = parseOpf(opfXml, opfDir);

    expect(parsed.readingOrder).toHaveLength(1);
    expect(parsed.navHref).toBeDefined();
    expect(parsed.mediaOverlayMeta?.activeClass).toBe(
      "-epub-media-overlay-active",
    );
  });
});

describe("detectIsbn", () => {
  it("recognizes ISBN-13 without scheme", () => {
    const result = detectIsbn([{ value: "9780123456789" }]);
    expect(result?.type).toBe("isbn");
  });
});

describe("opfToPayload", () => {
  it("maps subjects to genres only and normalizes ISBN fields", async () => {
    const { opfToPayload } = await import("../src/server/modules/metadata/merge.js");
    const payload = opfToPayload({
      title: "Test",
      subjects: ["Fantasy", "Adventure"],
      identifiers: [
        { value: "978-0-123456-78-9", scheme: "ISBN" },
        { value: "0123456789", scheme: "ISBN" },
      ],
    });

    expect(payload.genres).toEqual(["Fantasy", "Adventure"]);
    expect(payload.tags).toBeUndefined();
    expect(payload.isbn13).toBe("9780123456789");
    expect(payload.isbn10).toBe("0123456789");
    expect(payload.identifiers).toEqual([
      { scheme: "ISBN", value: "978-0-123456-78-9" },
      { scheme: "ISBN", value: "0123456789" },
    ]);
  });

  it("does not invent page count from spine or HTML statistics", async () => {
    const { opfToPayload } = await import("../src/server/modules/metadata/merge.js");
    const payload = opfToPayload({
      title: "Test",
      subjects: ["Fiction"],
    });
    expect(payload.pageCount).toBeUndefined();
  });
});
