import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseOpf, readEpubContainer, toBibliographic } from "../src/server/modules/metadata/extractors/epub-opf.js";
import {
  applyBibliographicToOpf,
  canonicalFieldsToBibliographic,
} from "../src/server/modules/metadata/epub-opf-write.js";
import { buildMinimalEpub } from "./fixtures/epub/build-minimal-epub.js";

describe("epub OPF write", () => {
  it("round-trips bibliographic fields through OPF update", async () => {
    const original = await buildMinimalEpub({
      title: "Original Title",
      authors: ["Original Author"],
      subjects: ["Fiction"],
      isbn: "9780000000000",
    });

    const zip = await JSZip.loadAsync(original);
    const { opfDir, opfXml } = await readEpubContainer(zip);
    const parsed = parseOpf(opfXml, opfDir);

    const updated = applyBibliographicToOpf(
      opfXml,
      canonicalFieldsToBibliographic({
        title: "Updated Title",
        subtitle: "Updated Subtitle",
        authors: ["Author One", "Author Two"],
        description: "Updated description",
        genres: ["Science Fiction", "Adventure"],
        language: "en-GB",
        publisher: "Feylore Press",
        publicationDate: "2024-01-01",
        isbn13: "9781234567897",
      }),
    );

    const reparsed = parseOpf(updated, opfDir);
    const bibliographic = toBibliographic(reparsed);

    expect(bibliographic.title).toBe("Updated Title");
    expect(bibliographic.subtitle).toBe("Updated Subtitle");
    expect(bibliographic.authors).toEqual(["Author One", "Author Two"]);
    expect(bibliographic.description).toBe("Updated description");
    expect(bibliographic.subjects).toEqual(["Science Fiction", "Adventure"]);
    expect(bibliographic.language).toBe("en-GB");
    expect(bibliographic.publisher).toBe("Feylore Press");
    expect(bibliographic.date).toBe("2024-01-01");
    expect(
      bibliographic.identifiers.some((id) => id.value.includes("9781234567897")),
    ).toBe(true);

    expect(parsed.title).toBe("Original Title");
  });
});
