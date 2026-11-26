import type { BookIdentifierEntry } from "../../shared/book-metadata-field-kinds.js";
import {
  normalizeIsbn10,
  normalizeIsbn13,
} from "../../shared/identifier-normalization.js";
import type { OpenLibraryRecords } from "./types.js";
import { parseOpenLibrarySubjects } from "./subject-tags.js";
import {
  coverUrlFromId,
  extractTextValue,
  isNumericSeriesToken,
  joinList,
  normalizeLanguageKey,
  trimTrailingPunctuation,
} from "./utils.js";

const MAX_GENRES = 10;
const ASIN_PATTERN = /^B[\dA-Z]{9}$/i;

function workSubjects(records: OpenLibraryRecords): string[] | undefined {
  return (
    records.work?.subjects ??
    records.searchDoc?.subject ??
    undefined
  );
}

function editionSubjects(records: OpenLibraryRecords): string[] | undefined {
  return records.edition?.subjects ?? records.edition?.genres;
}

function parsedSubjects(records: OpenLibraryRecords) {
  const workParsed = parseOpenLibrarySubjects(workSubjects(records));
  const editionParsed = parseOpenLibrarySubjects(editionSubjects(records));
  return {
    work: workParsed,
    edition: editionParsed,
  };
}

function pickTitle(records: OpenLibraryRecords): string | undefined {
  return (
    records.work?.title?.trim() ||
    records.searchDoc?.title?.trim() ||
    records.edition?.title?.trim() ||
    records.searchEdition?.title?.trim() ||
    undefined
  );
}

function pickSubtitle(records: OpenLibraryRecords): string | undefined {
  if (!records.edition) return undefined;
  return (
    records.edition.subtitle?.trim() ||
    records.searchEdition?.subtitle?.trim() ||
    undefined
  );
}

function pickAuthors(records: OpenLibraryRecords): string[] | undefined {
  if (records.authorNames?.length) {
    return records.authorNames;
  }
  if (records.searchDoc?.author_name?.length) {
    return records.searchDoc.author_name.map((n) => n.trim()).filter(Boolean);
  }
  return undefined;
}

function pickContributors(records: OpenLibraryRecords): string[] | undefined {
  if (!records.edition) return undefined;
  const authors = new Set(
    (pickAuthors(records) ?? []).map((a) => a.toLowerCase()),
  );
  const fromEdition = records.edition.contributions
    ?.map((c) => c.trim())
    .filter((c) => c && !authors.has(c.toLowerCase()));
  if (fromEdition?.length) return fromEdition;
  return undefined;
}

function parseSeriesArray(
  series: string[] | undefined,
): { name?: string; position?: number } {
  if (!series?.length) return {};
  let name: string | undefined;
  let position: number | undefined;
  for (const entry of series) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (isNumericSeriesToken(trimmed)) {
      if (position === undefined) position = Number(trimmed);
      continue;
    }
    if (!name) name = trimTrailingPunctuation(trimmed);
  }
  return { name, position };
}

function pickSeries(
  records: OpenLibraryRecords,
): { name?: string; position?: number } {
  const parsed = parsedSubjects(records);

  if (records.edition) {
    const fromEditionArray = parseSeriesArray(records.edition.series);
    if (fromEditionArray.name) return fromEditionArray;

    if (parsed.edition.series) {
      return {
        name: parsed.edition.series,
        position: parsed.edition.seriesPosition,
      };
    }
  }

  if (parsed.work.series) {
    return {
      name: parsed.work.series,
      position: parsed.work.seriesPosition,
    };
  }

  const searchSeries = records.searchDoc?.series;
  if (searchSeries !== undefined) {
    const asArray = Array.isArray(searchSeries) ? searchSeries : [searchSeries];
    const fromSearch = parseSeriesArray(asArray);
    if (fromSearch.name) return fromSearch;
  }

  return {};
}

function collectIsbns(records: OpenLibraryRecords): string[] {
  if (!records.edition) return [];
  const values: string[] = [];
  const add = (list: string[] | undefined) => {
    for (const v of list ?? []) {
      if (v.trim()) values.push(v.trim());
    }
  };
  add(records.edition.isbn_13);
  add(records.edition.isbn_10);
  add(records.searchEdition?.isbn);
  return values;
}

function pickIsbns(records: OpenLibraryRecords): {
  isbn10?: string;
  isbn13?: string;
} {
  const result: { isbn10?: string; isbn13?: string } = {};
  for (const raw of collectIsbns(records)) {
    const isbn13 = normalizeIsbn13(raw);
    if (isbn13 && !result.isbn13) result.isbn13 = isbn13;
    const isbn10 = normalizeIsbn10(raw);
    if (isbn10 && !result.isbn10) result.isbn10 = isbn10;
  }
  return result;
}

function pickAsin(records: OpenLibraryRecords): string | undefined {
  if (!records.edition) return undefined;
  const amazon = records.edition.identifiers?.amazon;
  if (!amazon?.length) return undefined;
  for (const candidate of amazon) {
    const trimmed = candidate.trim();
    if (ASIN_PATTERN.test(trimmed)) return trimmed.toUpperCase();
  }
  return undefined;
}

function collectIdentifiers(records: OpenLibraryRecords): BookIdentifierEntry[] {
  if (!records.edition) return [];
  const entries: BookIdentifierEntry[] = [];
  const seen = new Set<string>();

  const add = (scheme: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = `${scheme}:${trimmed}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ scheme, value: trimmed });
  };

  for (const oclc of records.edition.oclc_numbers ?? []) {
    add("oclc", oclc);
  }
  for (const lccn of records.edition.lccn ?? []) {
    add("lccn", lccn);
  }

  return entries;
}

function pickDescription(records: OpenLibraryRecords): string | undefined {
  return (
    extractTextValue(records.work?.description) ??
    extractTextValue(records.searchDoc?.first_sentence)
  );
}

function pickPublisher(records: OpenLibraryRecords): string | undefined {
  if (!records.edition) return undefined;
  const fromEdition = records.edition.publishers?.[0]?.trim();
  if (fromEdition) return fromEdition;
  return undefined;
}

function pickPublicationDate(records: OpenLibraryRecords): string | undefined {
  if (!records.edition) return undefined;
  const editionDate = records.edition.publish_date?.trim();
  if (editionDate) return editionDate;
  const searchDate = records.searchEdition?.publish_date?.trim();
  return searchDate || undefined;
}

function pickCopyrightDate(records: OpenLibraryRecords): string | undefined {
  if (!records.edition) return undefined;
  const value = records.edition.copyright_date?.trim();
  return value || undefined;
}

function pickPhysicalFormat(records: OpenLibraryRecords): string | undefined {
  if (!records.edition) return undefined;
  const value = records.edition.physical_format?.trim();
  return value || undefined;
}

function pickOriginalPublicationDate(
  records: OpenLibraryRecords,
): string | undefined {
  const workDate = records.work?.first_publish_date?.trim();
  if (workDate) return workDate;
  if (records.searchDoc?.first_publish_year !== undefined) {
    return String(records.searchDoc.first_publish_year);
  }
  return undefined;
}

function pickEdition(records: OpenLibraryRecords): string | undefined {
  if (!records.edition) return undefined;
  return records.edition.edition_name?.trim() || undefined;
}

function pickLanguage(records: OpenLibraryRecords): string | undefined {
  if (!records.edition) return undefined;
  const editionLang = records.edition.languages?.[0]?.key;
  const normalized = normalizeLanguageKey(editionLang);
  if (normalized) return normalized;

  const searchEditionLang = records.searchEdition?.language?.[0];
  return normalizeLanguageKey(
    searchEditionLang?.startsWith("/")
      ? searchEditionLang
      : searchEditionLang
        ? `/languages/${searchEditionLang}`
        : undefined,
  );
}

function pickOriginalLanguage(records: OpenLibraryRecords): string | undefined {
  const original = records.work?.original_languages?.[0]?.key;
  return normalizeLanguageKey(original);
}

function pickPublicationCountry(records: OpenLibraryRecords): string | undefined {
  if (!records.edition) return undefined;
  const places = joinList(records.edition.publish_places);
  if (places) return places;
  const country = records.edition.publish_country?.trim();
  return country || undefined;
}

function pickGenres(records: OpenLibraryRecords): string[] | undefined {
  const parsed = parsedSubjects(records);
  const genres = [...parsed.work.genres];
  for (const genre of parsed.edition.genres) {
    if (!genres.some((g) => g.toLowerCase() === genre.toLowerCase())) {
      genres.push(genre);
    }
  }
  if (!genres.length) return undefined;
  return genres.slice(0, MAX_GENRES);
}

function pickPageCount(records: OpenLibraryRecords): number | undefined {
  if (!records.edition) return undefined;
  const pages =
    records.edition.number_of_pages ?? records.searchEdition?.number_of_pages;
  if (pages === undefined || pages === null) return undefined;
  if (!Number.isInteger(pages) || pages <= 0) return undefined;
  return pages;
}

function pickAgeRange(records: OpenLibraryRecords): string | undefined {
  return (
    records.work?.age_range?.trim() ||
    records.edition?.age_range?.trim() ||
    records.edition?.target_age?.trim() ||
    records.edition?.reading_level?.trim() ||
    undefined
  );
}

function pickContentRating(records: OpenLibraryRecords): string | undefined {
  return (
    records.work?.content_rating?.trim() ||
    records.edition?.content_rating?.trim() ||
    undefined
  );
}

function pickCover(records: OpenLibraryRecords): { url: string } | undefined {
  const coverId =
    records.edition?.covers?.[0] ??
    records.searchEdition?.cover_i ??
    records.searchDoc?.cover_i;
  const url = coverUrlFromId(coverId);
  return url ? { url } : undefined;
}

function pickExternalId(records: OpenLibraryRecords): string | undefined {
  const workKey = records.work?.key ?? records.searchDoc?.key;
  if (workKey) return workKey.replace(/^\//, "");
  const editionKey = records.edition?.key ?? records.searchEdition?.key;
  return editionKey?.replace(/^\//, "");
}

export function mapCanonicalFields(
  records: OpenLibraryRecords,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  const title = pickTitle(records);
  if (title) payload.title = title;

  const subtitle = pickSubtitle(records);
  if (subtitle) payload.subtitle = subtitle;

  const authors = pickAuthors(records);
  if (authors?.length) payload.authors = authors;

  const contributors = pickContributors(records);
  if (contributors?.length) payload.contributors = contributors;

  const { name: seriesName, position: seriesPosition } = pickSeries(records);
  if (seriesName) payload.series = seriesName;
  if (seriesPosition !== undefined) payload.seriesPosition = seriesPosition;

  const { isbn10, isbn13 } = pickIsbns(records);
  if (isbn10) payload.isbn10 = isbn10;
  if (isbn13) payload.isbn13 = isbn13;

  const asin = pickAsin(records);
  if (asin) payload.asin = asin;

  const identifiers = collectIdentifiers(records);
  if (identifiers.length) payload.identifiers = identifiers;

  const description = pickDescription(records);
  if (description) payload.description = description;

  const publisher = pickPublisher(records);
  if (publisher) payload.publisher = publisher;

  const publicationDate = pickPublicationDate(records);
  if (publicationDate) payload.publicationDate = publicationDate;

  const copyrightDate = pickCopyrightDate(records);
  if (copyrightDate) payload.copyrightDate = copyrightDate;

  const physicalFormat = pickPhysicalFormat(records);
  if (physicalFormat) payload.physicalFormat = physicalFormat;

  const originalPublicationDate = pickOriginalPublicationDate(records);
  if (originalPublicationDate) {
    payload.originalPublicationDate = originalPublicationDate;
  }

  const edition = pickEdition(records);
  if (edition) payload.edition = edition;

  const language = pickLanguage(records);
  if (language) payload.language = language;

  const originalLanguage = pickOriginalLanguage(records);
  if (originalLanguage) payload.originalLanguage = originalLanguage;

  const publicationCountry = pickPublicationCountry(records);
  if (publicationCountry) payload.publicationCountry = publicationCountry;

  const genres = pickGenres(records);
  if (genres?.length) payload.genres = genres;

  const pageCount = pickPageCount(records);
  if (pageCount !== undefined) payload.pageCount = pageCount;

  const ageRange = pickAgeRange(records);
  if (ageRange) payload.ageRange = ageRange;

  const contentRating = pickContentRating(records);
  if (contentRating) payload.contentRating = contentRating;

  const cover = pickCover(records);
  if (cover) payload.cover = cover;

  return payload;
}

export function resolveExternalId(records: OpenLibraryRecords): string | undefined {
  return pickExternalId(records);
}

export function pickUniverse(records: OpenLibraryRecords): string | undefined {
  const parsed = parsedSubjects(records);
  return parsed.work.universe ?? parsed.edition.universe;
}
