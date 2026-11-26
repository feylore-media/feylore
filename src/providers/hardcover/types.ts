export interface HardcoverAuthor {
  name?: string;
}

export interface HardcoverContribution {
  author?: HardcoverAuthor;
}

export interface HardcoverPublisher {
  name?: string;
}

export interface HardcoverLanguage {
  language?: string;
}

export interface HardcoverEdition {
  id?: number;
  isbn_10?: string;
  isbn_13?: string;
  pages?: number;
  release_date?: string;
  physical_format?: string;
  publisher?: HardcoverPublisher;
  language?: HardcoverLanguage;
  book?: HardcoverBook;
}

export interface HardcoverBookSeries {
  position?: number;
  series?: { name?: string };
}

export type HardcoverCachedImage = string | { url?: string };

export type HardcoverCachedTags = Record<string, unknown>;

export interface HardcoverBook {
  id?: number;
  title?: string;
  subtitle?: string;
  description?: string;
  release_date?: string;
  pages?: number;
  rating?: number | string;
  slug?: string;
  cached_image?: HardcoverCachedImage;
  cached_tags?: HardcoverCachedTags;
  contributions?: HardcoverContribution[];
  book_series?: HardcoverBookSeries[];
  editions?: HardcoverEdition[];
}

export interface HardcoverRecords {
  book: HardcoverBook;
  editions: HardcoverEdition[];
}

export interface HardcoverGraphQlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}
