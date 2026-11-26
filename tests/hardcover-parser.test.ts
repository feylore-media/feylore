import { describe, it, expect } from "vitest";
import { mapCanonicalFields } from "../src/providers/hardcover/canonical-map.js";
import { hardcoverDescriptor } from "../src/providers/hardcover/descriptor.js";
import { parseHardcoverRecords } from "../src/providers/hardcover/parser.js";
import {
  HARDCOVER_PROVIDER_FIELD_KEYS,
  mapProviderFields,
} from "../src/providers/hardcover/provider-fields.js";
import type { HardcoverBook, HardcoverRecords } from "../src/providers/hardcover/types.js";
import { getImageUrl } from "../src/providers/hardcover/utils.js";

const bookFixture: HardcoverBook = {
  id: 42,
  title: "The Left Hand of Darkness",
  subtitle: "A novel",
  description: "A science fiction classic.",
  release_date: "1969-03-01",
  pages: 304,
  rating: 4.2,
  slug: "the-left-hand-of-darkness",
  cached_image: { url: "https://assets.hardcover.app/cover.jpg" },
  cached_tags: {
    Genre: ["Science Fiction", "Fiction"],
  },
  contributions: [
    { author: { name: "Ursula K. Le Guin" } },
    { author: { name: "Ursula K. Le Guin" } },
  ],
  book_series: [{ position: 6, series: { name: "Hainish Cycle" } }],
  editions: [
    {
      id: 100,
      isbn_13: "9780441007318",
      isbn_10: "0441007317",
      pages: 320,
      physical_format: "Paperback",
      publisher: { name: "Ace Books" },
      language: { language: "English" },
    },
  ],
};

const recordsFixture: HardcoverRecords = {
  book: bookFixture,
  editions: bookFixture.editions ?? [],
};

describe("hardcover getImageUrl", () => {
  it("extracts URL from string value", () => {
    expect(getImageUrl("https://example.com/cover.jpg")).toBe(
      "https://example.com/cover.jpg",
    );
  });

  it("extracts URL from object value", () => {
    expect(getImageUrl({ url: "https://example.com/cover.jpg" })).toBe(
      "https://example.com/cover.jpg",
    );
  });

  it("returns undefined for empty or missing values", () => {
    expect(getImageUrl(null)).toBeUndefined();
    expect(getImageUrl(undefined)).toBeUndefined();
    expect(getImageUrl("")).toBeUndefined();
    expect(getImageUrl({})).toBeUndefined();
  });
});

describe("hardcover canonical-map", () => {
  it("maps book and edition evidence with explicit precedence", () => {
    const payload = mapCanonicalFields({
      book: bookFixture,
      selectedEdition: bookFixture.editions?.[0],
    });

    expect(payload.title).toBe("The Left Hand of Darkness");
    expect(payload.subtitle).toBe("A novel");
    expect(payload.description).toBe("A science fiction classic.");
    expect(payload.publicationDate).toBe("1969-03-01");
    expect(payload.authors).toEqual(["Ursula K. Le Guin"]);
    expect(payload.genres).toEqual(["Science Fiction", "Fiction"]);
    expect(payload.series).toBe("Hainish Cycle");
    expect(payload.seriesPosition).toBe(6);
    expect(payload.cover).toEqual({
      url: "https://assets.hardcover.app/cover.jpg",
    });
    expect(payload.isbn13).toBe("9780441007318");
    expect(payload.isbn10).toBe("0441007317");
    expect(payload.publisher).toBe("Ace Books");
    expect(payload.physicalFormat).toBe("Paperback");
    expect(payload.language).toBe("eng");
    expect(payload.pageCount).toBe(320);
  });

  it("uses edition pages before book pages", () => {
    const payload = mapCanonicalFields({
      book: { ...bookFixture, pages: 304 },
      selectedEdition: { id: 1, pages: 250 },
    });
    expect(payload.pageCount).toBe(250);
  });

  it("falls back to book pages when edition has no pages", () => {
    const payload = mapCanonicalFields({
      book: { ...bookFixture, pages: 304 },
      selectedEdition: { id: 1 },
    });
    expect(payload.pageCount).toBe(304);
  });

  it("omits edition-level fields when no edition is selected", () => {
    const payload = mapCanonicalFields({ book: bookFixture });
    expect(payload.title).toBe("The Left Hand of Darkness");
    expect(payload.pageCount).toBe(304);
    expect(payload.publisher).toBeUndefined();
    expect(payload.isbn13).toBeUndefined();
    expect(payload.language).toBeUndefined();
  });

  it("omits publisher when selected edition has none", () => {
    const payload = mapCanonicalFields({
      book: bookFixture,
      selectedEdition: { id: 1, isbn_13: "9780441007318" },
    });
    expect(payload.publisher).toBeUndefined();
    expect(payload.isbn13).toBe("9780441007318");
  });

  it("omits cover when cached_image is missing", () => {
    const payload = mapCanonicalFields({
      book: { ...bookFixture, cached_image: undefined },
      selectedEdition: bookFixture.editions?.[0],
    });
    expect(payload.cover).toBeUndefined();
  });

  it("omits series when book_series is missing", () => {
    const payload = mapCanonicalFields({
      book: { ...bookFixture, book_series: undefined },
      selectedEdition: bookFixture.editions?.[0],
    });
    expect(payload.series).toBeUndefined();
    expect(payload.seriesPosition).toBeUndefined();
  });

  it("omits genres when cached_tags has no Genre entries", () => {
    const payload = mapCanonicalFields({
      book: { ...bookFixture, cached_tags: {} },
      selectedEdition: bookFixture.editions?.[0],
    });
    expect(payload.genres).toBeUndefined();
  });

  it("preserves display language names when no known mapping exists", () => {
    const payload = mapCanonicalFields({
      book: bookFixture,
      selectedEdition: {
        id: 1,
        language: { language: "Français" },
      },
    });
    expect(payload.language).toBe("Français");
  });
});

describe("hardcover provider-fields", () => {
  it("maps rating, bookId, and slug", () => {
    const payload = mapProviderFields(bookFixture);
    expect(payload[HARDCOVER_PROVIDER_FIELD_KEYS.rating]).toBe(4.2);
    expect(payload[HARDCOVER_PROVIDER_FIELD_KEYS.bookId]).toBe("42");
    expect(payload[HARDCOVER_PROVIDER_FIELD_KEYS.slug]).toBe(
      "the-left-hand-of-darkness",
    );
  });
});

describe("hardcover parser", () => {
  it("parses full records into MetadataProviderResult", () => {
    const result = parseHardcoverRecords(recordsFixture, {
      isbn13: "9780441007318",
    });
    expect(result?.externalId).toBe("42");
    expect(result?.payload.title).toBe("The Left Hand of Darkness");
    expect(result?.payload.publisher).toBe("Ace Books");
    expect(result?.payload[HARDCOVER_PROVIDER_FIELD_KEYS.rating]).toBe(4.2);
  });

  it("handles missing editions with book-level fallback", () => {
    const result = parseHardcoverRecords({
      book: { ...bookFixture, editions: undefined },
      editions: [],
    });
    expect(result?.payload.title).toBe("The Left Hand of Darkness");
    expect(result?.payload.pageCount).toBe(304);
    expect(result?.payload.publisher).toBeUndefined();
  });

  it("descriptor providerFields keys match provider-fields constants", () => {
    const descriptorKeys = hardcoverDescriptor.providerFields?.map((f) => f.key) ?? [];
    expect(descriptorKeys).toEqual(Object.values(HARDCOVER_PROVIDER_FIELD_KEYS));
  });
});
