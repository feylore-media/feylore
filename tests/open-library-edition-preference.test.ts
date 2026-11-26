import { describe, it, expect } from "vitest";
import {
  classifyEditionFormat,
  selectBestEditionCandidate,
} from "../src/providers/open-library/edition-resolution.js";
import { parseOpenLibrarySubjects } from "../src/providers/open-library/subject-tags.js";
import { mapCanonicalFields } from "../src/providers/open-library/canonical-map.js";
import {
  mapProviderFields,
  OPEN_LIBRARY_PROVIDER_FIELD_KEYS,
} from "../src/providers/open-library/provider-fields.js";
import { resolveEditionFormatPreference } from "../src/shared/metadata-edition-preference.js";

describe("edition format preference resolution", () => {
  it("defaults books to print-or-ebook", () => {
    expect(resolveEditionFormatPreference("books")).toBe("print-or-ebook");
    expect(resolveEditionFormatPreference("comics")).toBe("print-or-ebook");
  });

  it("defaults audiobooks to audiobook", () => {
    expect(resolveEditionFormatPreference("audiobooks")).toBe("audiobook");
  });

  it("uses configured preference when set", () => {
    expect(resolveEditionFormatPreference("books", "audiobook")).toBe(
      "audiobook",
    );
  });
});

describe("open-library edition classification", () => {
  it("classifies audiobook and print editions", () => {
    expect(
      classifyEditionFormat({ physical_format: "Audible Audiobook" }),
    ).toBe("audiobook");
    expect(classifyEditionFormat({ physical_format: "Paperback" })).toBe(
      "print",
    );
    expect(classifyEditionFormat({ physical_format: "Kindle Edition" })).toBe(
      "ebook",
    );
  });

  it("prefers print over audiobook for print-or-ebook preference", () => {
    const selected = selectBestEditionCandidate(
      [
        { key: "/books/OL1M", physical_format: "Audible Audiobook" },
        { key: "/books/OL2M", physical_format: "Paperback", isbn: ["978123"] },
      ],
      "print-or-ebook",
    );
    expect(selected?.key).toBe("/books/OL2M");
  });

  it("prefers ebook editions when importing epub files", () => {
    const selected = selectBestEditionCandidate(
      [
        { key: "/books/OL1M", physical_format: "Paperback" },
        { key: "/books/OL2M", physical_format: "Kindle Edition" },
      ],
      "print-or-ebook",
      { fileFormat: "epub" },
    );
    expect(selected?.key).toBe("/books/OL2M");
  });

  it("prefers language-matching editions as a tie-breaker", () => {
    const selected = selectBestEditionCandidate(
      [
        {
          key: "/books/OL1M",
          physical_format: "Paperback",
          language: ["fre"],
        },
        {
          key: "/books/OL2M",
          physical_format: "Paperback",
          language: ["eng"],
        },
      ],
      "print-or-ebook",
      { language: "en" },
    );
    expect(selected?.key).toBe("/books/OL2M");
  });
});

describe("open-library subject tags", () => {
  it("maps Dungeon Crawler Carl style subjects", () => {
    const parsed = parseOpenLibrarySubjects([
      "series:Dungeon Crawler Carl",
      "form:novel",
      "genre:LitRPG",
      "genre:science fantasy",
      "universe:Dungeon Crawler Carl",
    ]);

    expect(parsed.series).toBe("Dungeon Crawler Carl");
    expect(parsed.genres).toEqual(["LitRPG", "science fantasy"]);
    expect(parsed.universe).toBe("Dungeon Crawler Carl");
  });

  it("maps parsed subjects into canonical and provider fields", () => {
    const payload = mapCanonicalFields({
      work: {
        key: "/works/OL1W",
        title: "Dungeon Crawler Carl",
        subjects: [
          "series:Dungeon Crawler Carl",
          "form:novel",
          "genre:LitRPG",
          "genre:science fantasy",
          "universe:Dungeon Crawler Carl",
        ],
      },
      edition: {
        key: "/books/OL1M",
        physical_format: "Paperback",
        publishers: ["Soundbooth Theater"],
        publish_date: "2020",
        isbn_13: ["9781234567890"],
        number_of_pages: 300,
      },
      authorNames: ["Matt Dinniman"],
      resolvedEditionKind: "print",
    });

    expect(payload.series).toBe("Dungeon Crawler Carl");
    expect(payload.genres).toEqual(["LitRPG", "science fantasy"]);
    expect(payload.publisher).toBe("Soundbooth Theater");
    expect(payload.pageCount).toBe(300);
    expect(payload.physicalFormat).toBe("Paperback");

    const provider = mapProviderFields({
      work: {
        key: "/works/OL1W",
        subjects: [
          "series:Dungeon Crawler Carl",
          "universe:Dungeon Crawler Carl",
        ],
      },
      edition: {
        key: "/books/OL1M",
        physical_format: "Paperback",
        notes: { value: "Audiobook silence correction note" },
      },
    });

    expect(provider[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.universe]).toBe(
      "Dungeon Crawler Carl",
    );
    expect(provider[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.workId]).toBe("OL1W");
    expect(provider[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.editionId]).toBe("OL1M");
    expect(
      (provider as Record<string, string | undefined>)["open-library.physicalFormat"],
    ).toBeUndefined();
    expect(
      (provider as Record<string, string | undefined>)["open-library.notes"],
    ).toBeUndefined();
  });
});
