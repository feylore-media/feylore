import type { OpenLibraryRecords } from "./types.js";
import { pickUniverse } from "./canonical-map.js";
import { bareOpenLibraryKey, extractTextValue, joinList, serializeRawValue } from "./utils.js";

/** Third-party identifier schemes mapped to open-library.* provider fields. */
export const OPEN_LIBRARY_THIRD_PARTY_IDENTIFIER_SCHEMES = [
  "goodreads",
  "isfdb",
  "wikidata",
  "librarything",
  "bookbrainz",
  "musicbrainz",
] as const;

export type OpenLibraryThirdPartyIdentifierScheme =
  (typeof OPEN_LIBRARY_THIRD_PARTY_IDENTIFIER_SCHEMES)[number];

/** Contract providerFields keys — must match descriptor.providerFields exactly. */
export const OPEN_LIBRARY_PROVIDER_FIELD_KEYS = {
  workId: "open-library.workId",
  editionId: "open-library.editionId",
  series: "open-library.series",
  universe: "open-library.universe",
  byStatement: "open-library.byStatement",
  pagination: "open-library.pagination",
  lcClassifications: "open-library.lcClassifications",
  deweyDecimalClass: "open-library.deweyDecimalClass",
  otherTitles: "open-library.otherTitles",
  subjectPlaces: "open-library.subjectPlaces",
  firstSentence: "open-library.firstSentence",
  goodreads: "open-library.goodreads",
  isfdb: "open-library.isfdb",
  wikidata: "open-library.wikidata",
  librarything: "open-library.librarything",
  bookbrainz: "open-library.bookbrainz",
  musicbrainz: "open-library.musicbrainz",
} as const;

export type OpenLibraryProviderFieldKey =
  (typeof OPEN_LIBRARY_PROVIDER_FIELD_KEYS)[keyof typeof OPEN_LIBRARY_PROVIDER_FIELD_KEYS];

const THIRD_PARTY_SCHEME_TO_KEY: Record<
  OpenLibraryThirdPartyIdentifierScheme,
  OpenLibraryProviderFieldKey
> = {
  goodreads: OPEN_LIBRARY_PROVIDER_FIELD_KEYS.goodreads,
  isfdb: OPEN_LIBRARY_PROVIDER_FIELD_KEYS.isfdb,
  wikidata: OPEN_LIBRARY_PROVIDER_FIELD_KEYS.wikidata,
  librarything: OPEN_LIBRARY_PROVIDER_FIELD_KEYS.librarything,
  bookbrainz: OPEN_LIBRARY_PROVIDER_FIELD_KEYS.bookbrainz,
  musicbrainz: OPEN_LIBRARY_PROVIDER_FIELD_KEYS.musicbrainz,
};

function mapThirdPartyIdentifiers(
  edition: NonNullable<OpenLibraryRecords["edition"]>,
): Record<string, string> {
  const payload: Record<string, string> = {};
  const idMap = edition.identifiers ?? {};

  for (const scheme of OPEN_LIBRARY_THIRD_PARTY_IDENTIFIER_SCHEMES) {
    const values = idMap[scheme];
    if (!values?.length) continue;
    const first = values.find((value) => value.trim());
    if (!first) continue;
    payload[THIRD_PARTY_SCHEME_TO_KEY[scheme]] = first.trim();
  }

  return payload;
}

export function mapProviderFields(
  records: OpenLibraryRecords,
): Record<string, string> {
  const edition = records.edition;
  const work = records.work;
  const searchDoc = records.searchDoc;
  const payload: Record<string, string> = {};

  const workId = bareOpenLibraryKey(work?.key ?? searchDoc?.key);
  if (workId) {
    payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.workId] = workId;
  }

  const editionId = bareOpenLibraryKey(
    edition?.key ?? records.searchEdition?.key,
  );
  if (editionId) {
    payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.editionId] = editionId;
  }

  const rawSeries =
    edition?.series ??
    (searchDoc?.series !== undefined
      ? Array.isArray(searchDoc.series)
        ? searchDoc.series
        : [searchDoc.series]
      : undefined);
  const seriesRaw = serializeRawValue(rawSeries);
  if (seriesRaw) {
    payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.series] = seriesRaw;
  }

  const universe = pickUniverse(records);
  if (universe) {
    payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.universe] = universe;
  }

  const hasDescription = work?.description;
  if (!hasDescription) {
    const firstSentence = extractTextValue(searchDoc?.first_sentence);
    if (firstSentence) {
      payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.firstSentence] = firstSentence;
    }
  }

  if (!edition) return payload;

  Object.assign(payload, mapThirdPartyIdentifiers(edition));

  const byStatement = edition.by_statement?.trim();
  if (byStatement) {
    payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.byStatement] = byStatement;
  }

  const pagination = edition.pagination?.trim();
  if (pagination) {
    payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.pagination] = pagination;
  }

  const lcClassifications = joinList(edition.lc_classifications);
  if (lcClassifications) {
    payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.lcClassifications] =
      lcClassifications;
  }

  const dewey = joinList(edition.dewey_decimal_class);
  if (dewey) {
    payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.deweyDecimalClass] = dewey;
  }

  const otherTitles = joinList(edition.other_titles);
  if (otherTitles) {
    payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.otherTitles] = otherTitles;
  }

  const subjectPlaces = joinList(
    edition.subject_place ?? work?.subject_places,
  );
  if (subjectPlaces) {
    payload[OPEN_LIBRARY_PROVIDER_FIELD_KEYS.subjectPlaces] = subjectPlaces;
  }

  return payload;
}
