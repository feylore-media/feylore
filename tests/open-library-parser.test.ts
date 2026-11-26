import { describe, it, expect } from "vitest";
import { mapCanonicalFields } from "../src/providers/open-library/canonical-map.js";
import { openLibraryDescriptor } from "../src/providers/open-library/descriptor.js";
import { parseOpenLibraryRecords } from "../src/providers/open-library/parser.js";
import {
  mapProviderFields,
  OPEN_LIBRARY_PROVIDER_FIELD_KEYS,
} from "../src/providers/open-library/provider-fields.js";
import type { OpenLibraryRecords } from "../src/providers/open-library/types.js";

const editionFixture: OpenLibraryRecords["edition"] = {
  key: "/books/OL82563M",
  title: "Das moderne Theater Lateinamerikas",
  publishers: ["Vervuert Verlag"],
  publish_date: "1993",
  publish_country: "gw ",
  publish_places: ["Frankfurt am Main"],
  languages: [{ key: "/languages/ger" }],
  isbn_10: ["3893549129"],
  number_of_pages: 333,
  edition_name: "2nd ed.",
  by_statement: "Wilfried Floeck, Karl Kohut (Hrsg.).",
  contributions: [
    "Floeck, Wilfried, 1943-",
    "Kohut, Karl, 1936-",
    "Symposium contributor",
  ],
  series: ["Americana Eystettensia.", "11"],
  physical_format: "Paperback",
  copyright_date: "1992",
  pagination: "333 p. ;",
  lc_classifications: ["PN2309 .M63 1993"],
  dewey_decimal_class: ["792/.028"],
  other_titles: ["Theater Lateinamerikas"],
  notes: {
    type: "/type/text",
    value: "Includes bibliographical references and indexes.",
  },
  subject_place: ["Latin America"],
  oclc_numbers: ["31721296"],
  lccn: ["99188195"],
  identifiers: { goodreads: ["4481817"] },
  works: [{ key: "/works/OL18931307W" }],
};

const workFixture: OpenLibraryRecords["work"] = {
  key: "/works/OL18931307W",
  title: "Das moderne Theater Lateinamerikas",
  subjects: ["Theater", "Congresses"],
  first_publish_date: "1991",
};

describe("open-library canonical-map", () => {
  it("maps edition and work evidence to canonical fields", () => {
    const payload = mapCanonicalFields({
      edition: editionFixture,
      work: workFixture,
      authorNames: ["Wilfried Floeck", "Karl Kohut"],
    });

    expect(payload.title).toBe("Das moderne Theater Lateinamerikas");
    expect(payload.isbn10).toBe("3893549129");
    expect(payload.isbn13).toBeUndefined();
    expect(payload.asin).toBeUndefined();
    expect(payload.language).toBe("ger");
    expect(payload.originalLanguage).toBeUndefined();
    expect(payload.publicationCountry).toBe("Frankfurt am Main");
    expect(payload.pageCount).toBe(333);
    expect(payload.edition).toBe("2nd ed.");
    expect(payload.publicationDate).toBe("1993");
    expect(payload.copyrightDate).toBe("1992");
    expect(payload.physicalFormat).toBe("Paperback");
    expect(payload.originalPublicationDate).toBe("1991");
    expect(payload.series).toBe("Americana Eystettensia");
    expect(payload.seriesPosition).toBe(11);
    expect(payload.contributors).toEqual([
      "Floeck, Wilfried, 1943-",
      "Kohut, Karl, 1936-",
      "Symposium contributor",
    ]);
    expect(payload.genres).toEqual(["Theater", "Congresses"]);
    expect(payload.identifiers).toEqual(
      expect.arrayContaining([
        { scheme: "oclc", value: "31721296" },
        { scheme: "lccn", value: "99188195" },
      ]),
    );
    expect(payload.identifiers).not.toEqual(
      expect.arrayContaining([{ scheme: "goodreads", value: "4481817" }]),
    );
    expect(payload.ageRange).toBeUndefined();
    expect(payload.contentRating).toBeUndefined();
  });

  it("emits ASIN only from explicit amazon identifiers", () => {
    const withAsin = mapCanonicalFields({
      edition: {
        ...editionFixture,
        identifiers: { amazon: ["B012345678"], goodreads: ["1"] },
        isbn_13: ["9780091953638"],
      },
    });
    expect(withAsin.asin).toBe("B012345678");
    expect(withAsin.isbn13).toBe("9780091953638");

    const withoutAsin = mapCanonicalFields({
      edition: {
        ...editionFixture,
        isbn_13: ["9780091953638"],
        identifiers: { goodreads: ["1"] },
      },
    });
    expect(withoutAsin.isbn13).toBe("9780091953638");
    expect(withoutAsin.asin).toBeUndefined();
  });

  it("omits seriesPosition when series has no numeric token", () => {
    const payload = mapCanonicalFields({
      edition: {
        ...editionFixture,
        series: ["Buckram series"],
      },
    });
    expect(payload.series).toBe("Buckram series");
    expect(payload.seriesPosition).toBeUndefined();
  });

  it("maps publish places to canonical publicationCountry", () => {
    const withPlaces = mapCanonicalFields({
      edition: {
        ...editionFixture,
        publish_places: ["London"],
        publish_country: "enk",
      },
    });
    expect(withPlaces.publicationCountry).toBe("London");

    const countryOnly = mapCanonicalFields({
      edition: {
        ...editionFixture,
        publish_places: undefined,
        publish_country: "enk",
      },
    });
    expect(countryOnly.publicationCountry).toBe("enk");
  });

  it("prefers edition series array over work subject series tags", () => {
    const payload = mapCanonicalFields({
      edition: {
        ...editionFixture,
        series: ["Edition Series", "2"],
      },
      work: {
        ...workFixture,
        subjects: ["series:Work Subject Series", "genre:Fiction"],
      },
    });

    expect(payload.series).toBe("Edition Series");
    expect(payload.seriesPosition).toBe(2);
  });

  it("ignores unknown third-party identifier schemes in canonical identifiers", () => {
    const payload = mapCanonicalFields({
      edition: {
        ...editionFixture,
        identifiers: {
          goodreads: ["4481817"],
          unknown_service: ["12345"],
        },
      },
    });

    expect(payload.identifiers).toEqual(
      expect.arrayContaining([
        { scheme: "oclc", value: "31721296" },
        { scheme: "lccn", value: "99188195" },
      ]),
    );
    expect(payload.identifiers).not.toEqual(
      expect.arrayContaining([
        { scheme: "goodreads", value: "4481817" },
        { scheme: "unknown_service", value: "12345" },
      ]),
    );
  });

  it("uses first_sentence as description only when no work/edition description", () => {
    const payload = mapCanonicalFields({
      searchDoc: {
        key: "/works/OL1W",
        title: "Test Book",
        author_name: ["Author"],
        first_sentence: ["Opening line."],
      },
      authorNames: ["Author"],
    });
    expect(payload.description).toBe("Opening line.");
  });
});

describe("open-library provider-fields", () => {
  it("preserves provider-specific bibliographic evidence", () => {
    const fields = mapProviderFields({
      edition: editionFixture,
      work: workFixture,
    });

    expect(fields[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.series]).toBe(
      JSON.stringify(["Americana Eystettensia.", "11"]),
    );
    expect(fields[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.byStatement]).toBe(
      "Wilfried Floeck, Karl Kohut (Hrsg.).",
    );
    expect(fields[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.workId]).toBe("OL18931307W");
    expect(fields[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.editionId]).toBe("OL82563M");
    expect(fields[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.goodreads]).toBe("4481817");
    expect(fields[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.pagination]).toBe("333 p. ;");
    expect(fields[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.subjectPlaces]).toBe(
      "Latin America",
    );
  });

  it("emits firstSentence only when description is absent", () => {
    const fields = mapProviderFields({
      searchDoc: {
        first_sentence: ["A hook."],
      },
    });
    expect(fields[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.firstSentence]).toBe(
      "A hook.",
    );

    const withDescription = mapProviderFields({
      edition: editionFixture,
      work: { description: "Work description" },
      searchDoc: { first_sentence: ["A hook."] },
    });
    expect(
      withDescription[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.firstSentence],
    ).toBeUndefined();
  });

  it("does not emit unknown third-party identifier provider fields", () => {
    const fields = mapProviderFields({
      edition: {
        ...editionFixture,
        identifiers: {
          goodreads: ["4481817"],
          unknown_service: ["999"],
        },
      },
    });

    expect(fields[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.goodreads]).toBe("4481817");
    expect(
      (fields as Record<string, string | undefined>)["open-library.unknown_service"],
    ).toBeUndefined();
  });
});

describe("open-library parser", () => {
  it("merges canonical and provider-specific payload keys", () => {
    const result = parseOpenLibraryRecords({
      edition: editionFixture,
      work: workFixture,
      authorNames: ["Wilfried Floeck"],
    });

    expect(result?.externalId).toBe("works/OL18931307W");
    expect(result?.payload.title).toBe("Das moderne Theater Lateinamerikas");
    expect(result?.payload.series).toBe("Americana Eystettensia");
    expect(result?.payload.physicalFormat).toBe("Paperback");
    expect(result?.payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.workId]).toBe(
      "OL18931307W",
    );
    expect(result?.payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.editionId]).toBe(
      "OL82563M",
    );
    expect(
      (result?.payload as Record<string, unknown>)["open-library.physicalFormat"],
    ).toBeUndefined();
    expect(
      Object.values(result?.payload ?? {}).some(
        (value) =>
          typeof value === "string" &&
          /^urn:uuid:/i.test(value),
      ),
    ).toBe(false);
  });

  it("returns null when no evidence is available", () => {
    expect(parseOpenLibraryRecords({})).toBeNull();
  });
});

describe("open-library descriptor contract", () => {
  it("declares every providerFields key the parser can emit", () => {
    const declared = new Set(
      openLibraryDescriptor.providerFields?.map((f) => f.key) ?? [],
    );
    for (const key of Object.values(OPEN_LIBRARY_PROVIDER_FIELD_KEYS)) {
      expect(declared.has(key)).toBe(true);
    }
  });
});
