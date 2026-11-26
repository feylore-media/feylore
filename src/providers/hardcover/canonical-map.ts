import {
  normalizeIsbn10,
  normalizeIsbn13,
} from "../../shared/identifier-normalization.js";
import type { HardcoverBook, HardcoverEdition } from "./types.js";
import { getImageUrl, normalizeHardcoverLanguage } from "./utils.js";

const MAX_GENRES = 10;

export interface HardcoverCanonicalInput {
  book: HardcoverBook;
  selectedEdition?: HardcoverEdition;
}

function pickAuthors(book: HardcoverBook): string[] | undefined {
  const names = book.contributions
    ?.map((c) => c.author?.name?.trim())
    .filter((name): name is string => !!name);
  if (!names?.length) return undefined;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique.length ? unique : undefined;
}

function pickGenres(book: HardcoverBook): string[] | undefined {
  const tags = book.cached_tags;
  if (!tags || typeof tags !== "object") return undefined;
  const genreValue = tags.Genre ?? tags.genre;
  if (!Array.isArray(genreValue)) return undefined;
  const genres = genreValue
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_GENRES);
  return genres.length ? genres : undefined;
}

function pickSeries(book: HardcoverBook): {
  series?: string;
  seriesPosition?: number;
} {
  const entry = book.book_series?.[0];
  if (!entry) return {};
  const series = entry.series?.name?.trim();
  const position =
    typeof entry.position === "number" && Number.isFinite(entry.position)
      ? entry.position
      : undefined;
  return {
    series: series || undefined,
    seriesPosition: position,
  };
}

function pickPageCount(
  book: HardcoverBook,
  edition?: HardcoverEdition,
): number | undefined {
  if (
    typeof edition?.pages === "number" &&
    Number.isFinite(edition.pages) &&
    edition.pages > 0
  ) {
    return edition.pages;
  }
  if (
    typeof book.pages === "number" &&
    Number.isFinite(book.pages) &&
    book.pages > 0
  ) {
    return book.pages;
  }
  return undefined;
}

export function mapCanonicalFields(
  input: HardcoverCanonicalInput,
): Record<string, unknown> {
  const { book, selectedEdition } = input;
  const payload: Record<string, unknown> = {};

  const title = book.title?.trim();
  if (title) payload.title = title;

  const subtitle = book.subtitle?.trim();
  if (subtitle) payload.subtitle = subtitle;

  const description = book.description?.trim();
  if (description) payload.description = description;

  const publicationDate = book.release_date?.trim();
  if (publicationDate) payload.publicationDate = publicationDate;

  const authors = pickAuthors(book);
  if (authors) payload.authors = authors;

  const genres = pickGenres(book);
  if (genres) payload.genres = genres;

  const { series, seriesPosition } = pickSeries(book);
  if (series) payload.series = series;
  if (seriesPosition !== undefined) payload.seriesPosition = seriesPosition;

  const coverUrl = getImageUrl(book.cached_image);
  if (coverUrl) payload.cover = { url: coverUrl };

  const pageCount = pickPageCount(book, selectedEdition);
  if (pageCount !== undefined) payload.pageCount = pageCount;

  if (selectedEdition) {
    if (selectedEdition.isbn_13) {
      const isbn13 = normalizeIsbn13(selectedEdition.isbn_13);
      if (isbn13) payload.isbn13 = isbn13;
    }
    if (selectedEdition.isbn_10) {
      const isbn10 = normalizeIsbn10(selectedEdition.isbn_10);
      if (isbn10) payload.isbn10 = isbn10;
    }

    const publisher = selectedEdition.publisher?.name?.trim();
    if (publisher) payload.publisher = publisher;

    const physicalFormat = selectedEdition.physical_format?.trim();
    if (physicalFormat) payload.physicalFormat = physicalFormat;

    const language = normalizeHardcoverLanguage(
      selectedEdition.language?.language,
    );
    if (language) payload.language = language;
  }

  return payload;
}

export function resolveExternalId(book: HardcoverBook): string | undefined {
  return book.id != null ? String(book.id) : undefined;
}
