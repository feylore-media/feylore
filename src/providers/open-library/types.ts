/** Open Library API response shapes used by the provider parser. */

import type { EditionFormatKind } from "./edition-resolution.js";

export interface OpenLibraryTextValue {
  type?: string;
  value?: string;
}

export type OpenLibraryDescription =
  | string
  | OpenLibraryTextValue
  | undefined;

export interface OpenLibraryAuthorRef {
  key?: string;
  name?: string;
}

export interface OpenLibraryWorkAuthorRole {
  type?: { key?: string };
  author?: { key?: string; name?: string };
}

export interface OpenLibraryEdition {
  key?: string;
  title?: string;
  subtitle?: string;
  authors?: OpenLibraryAuthorRef[];
  works?: Array<{ key?: string }>;
  publishers?: string[];
  publish_date?: string;
  copyright_date?: string;
  publish_country?: string;
  publish_places?: string[];
  languages?: Array<{ key?: string }>;
  isbn_10?: string[];
  isbn_13?: string[];
  oclc_numbers?: string[];
  lccn?: string[];
  identifiers?: Record<string, string[]>;
  covers?: number[];
  number_of_pages?: number;
  edition_name?: string;
  by_statement?: string;
  contributions?: string[];
  series?: string[];
  genres?: string[];
  subjects?: string[];
  subject_place?: string[];
  description?: OpenLibraryDescription;
  notes?: OpenLibraryDescription;
  physical_format?: string;
  pagination?: string;
  lc_classifications?: string[];
  dewey_decimal_class?: string[];
  other_titles?: string[];
  age_range?: string;
  content_rating?: string;
  target_age?: string;
  reading_level?: string;
  /** Audiobook length in seconds when provided by Open Library. */
  duration?: number;
}

export interface OpenLibraryWork {
  key?: string;
  title?: string;
  subtitle?: string;
  description?: OpenLibraryDescription;
  subjects?: string[];
  subject_places?: string[];
  authors?: OpenLibraryWorkAuthorRole[];
  first_publish_date?: string;
  original_languages?: Array<{ key?: string }>;
  age_range?: string;
  content_rating?: string;
}

export interface OpenLibrarySearchEdition {
  key?: string;
  title?: string;
  subtitle?: string;
  isbn?: string[];
  cover_i?: number;
  language?: string[];
  number_of_pages?: number;
  physical_format?: string;
  publishers?: string[];
  publish_date?: string;
}

export interface OpenLibrarySearchDoc {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  publisher?: string[];
  publish_date?: string[];
  publish_year?: number;
  subject?: string[];
  isbn?: string[];
  cover_i?: number;
  first_publish_year?: number;
  first_sentence?: string[] | OpenLibraryTextValue;
  series?: string | string[];
  language?: string[];
  editions?: {
    docs?: OpenLibrarySearchEdition[];
  };
}

export interface OpenLibrarySearchResponse {
  docs?: OpenLibrarySearchDoc[];
}

export interface OpenLibraryWorkEditionSummary {
  key?: string;
  title?: string;
  subtitle?: string;
  isbn_10?: string[];
  isbn_13?: string[];
  covers?: number[];
  languages?: Array<{ key?: string }>;
  number_of_pages?: number;
  physical_format?: string;
  publishers?: string[];
  publish_date?: string;
}

export interface OpenLibraryWorkEditionsResponse {
  entries?: OpenLibraryWorkEditionSummary[];
}

export interface OpenLibraryAuthor {
  key?: string;
  name?: string;
}

/** Aggregated evidence from one or more OL API responses. */
export interface OpenLibraryRecords {
  edition?: OpenLibraryEdition;
  work?: OpenLibraryWork;
  searchDoc?: OpenLibrarySearchDoc;
  searchEdition?: OpenLibrarySearchEdition;
  /** Resolved author display names (from search or author API). */
  authorNames?: string[];
  /** Format classification of the selected edition. */
  resolvedEditionKind?: EditionFormatKind;
}
