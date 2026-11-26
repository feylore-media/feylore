import { z } from "zod";
import { slugStatusSchema } from "./media-identity.js";
import {
  locatorTextSchema,
  readingLocatorSchema,
  type LocatorText,
  type ReadingLocator,
} from "./reading-progress.js";

export {
  locatorTextSchema,
  readingLocatorSchema,
  type LocatorText,
  type ReadingLocator,
};

export { readingProgressUpdateSchema as progressUpdateSchema } from "./reading-progress.js";

export const BOOK_IMPORT_FILE_LIMIT = 10;

export const bookImportSchema = z.object({
  fileIds: z
    .array(z.string().uuid())
    .min(1)
    .max(BOOK_IMPORT_FILE_LIMIT),
});

export const BOOK_SORT_FIELDS = [
  "title",
  "addedAt",
  "updatedAt",
  "author",
] as const;

export type BookSortField = (typeof BOOK_SORT_FIELDS)[number];

export const bookListQuerySchema = z.object({
  q: z.string().optional(),
  author: z.string().optional(),
  series: z.string().uuid().optional(),
  genre: z.string().optional(),
  favorite: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  physicalOwned: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  physicalWithoutDigital: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  view: z.enum(["all", "continue", "recent"]).optional(),
  sort: z.enum(BOOK_SORT_FIELDS).default("title"),
  order: z.enum(["asc", "desc"]).default("asc"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type BookListQuery = z.infer<typeof bookListQuerySchema>;

export const createBookSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  authors: z.array(z.string().min(1)).optional(),
  genres: z.array(z.string().min(1)).optional(),
});

export const updateBookSchema = createBookSchema.partial();

export const setAuthorsSchema = z.object({
  authors: z.array(z.string().min(1)),
});

export const setGenresSchema = z.object({
  genres: z.array(z.string().min(1)),
});

export const setSeriesSchema = z.object({
  seriesId: z.string().uuid().nullable(),
  position: z.number().int().positive().optional(),
});

export const fieldOverrideSchema = z.object({
  field: z.string().min(1),
  value: z.unknown(),
  sourceKey: z.string().min(1).optional(),
});

export const updateBookMetadataFieldsSchema = z.object({
  fields: z.record(z.unknown()),
});

export const ratingUpdateSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
});

export const favoriteUpdateSchema = z.object({
  favorite: z.boolean(),
});

export const bookmarkCreateSchema = z.object({
  label: z.string().optional(),
  locator: readingLocatorSchema,
  representationId: z.string().uuid().optional(),
});

export const annotationCreateSchema = z.object({
  locator: readingLocatorSchema,
  highlightText: z.string().optional(),
  note: z.string().optional(),
  color: z.string().optional(),
  representationId: z.string().uuid().optional(),
});

export const annotationUpdateSchema = annotationCreateSchema.partial();

export const relationshipCreateSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  relationshipType: z.string().min(1),
});

export interface BookPublic {
  id: string;
  slug: string;
  slugStatus: z.infer<typeof slugStatusSchema>;
  title: string;
  subtitle: string | null;
  description: string | null;
  coverFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookAuthorPublic {
  id: string;
  name: string;
  sortOrder: number;
  peopleId: string | null;
  peopleSlug: string | null;
}

export interface BookSeriesPublic {
  id: string;
  name: string;
  position: number | null;
}

export interface BookListItem extends BookPublic {
  authors: string[];
  genres: string[];
  series: BookSeriesPublic | null;
  favorite: boolean;
  rating: number | null;
  progress: ReadingLocator | null;
  addedAt: string | null;
  representationFormats: string[];
}

export interface BookMetadataField {
  id: string;
  label: string;
  value: string;
  group: string;
  prominence: "primary" | "secondary";
  provenance?: {
    sourceKey: string;
    sourceCategory: string;
    origin: string;
    sourceLabel?: string;
  } | null;
}

export interface BookCustomField {
  key: string;
  displayName: string;
  type: string;
  value: unknown;
  displayValue: string | null;
}

export interface SeriesMemberReadingState {
  progress: ReadingLocator | null;
  finished: boolean;
}

export interface SeriesMember {
  work: BookListItem;
  position: number | null;
  current: boolean;
  readingState?: SeriesMemberReadingState;
}

export interface BookSeriesDetail {
  id: string;
  name: string;
  description: string | null;
  members: SeriesMember[];
}

export interface JournalSummaryItem {
  kind: "bookmark" | "annotation";
  id: string;
  label?: string;
  highlightText?: string;
  note?: string;
  locator: ReadingLocator;
  representationId?: string | null;
}

export interface BookJournalSummary {
  bookmarkCount: number;
  annotationCount: number;
  /** Interim UI approximation only — not a domain field. */
  quoteCountApprox?: number;
  journalEntryCount: number;
  recent: JournalSummaryItem[];
}

export interface BookReadingStateDetail {
  progress: ReadingLocator | null;
  progressRepresentationId: string | null;
  progressUpdatedAt: string | null;
  activeRepresentationLabel: string | null;
  finished: boolean;
  started: boolean;
  canContinueInReader: boolean;
  readerTargetRepresentationId: string | null;
}

export interface RepresentationCapabilities {
  epubVersion?: string;
  mediaOverlays?: boolean;
  layout?: "fixed" | "reflowable";
}

export interface EpubTechnicalSummary {
  epubVersion?: string;
  mediaOverlays?: boolean;
  layout?: "fixed" | "reflowable";
  language?: string;
  readingDirection?: string;
  hasNavigation?: boolean;
  validationStatus?: string;
  accessibility?: string;
  drmStatus?: string;
  fileSize?: number;
  checksum?: string;
  mediaType?: string | null;
}

export interface BookRepresentationDetail {
  id: string;
  manifestationId: string | null;
  format: string;
  domainModule: string;
  unavailableAt: string | null;
  createdAt: string;
  updatedAt: string;
  capabilities?: RepresentationCapabilities;
  technical?: EpubTechnicalSummary;
  files: Array<{
    id: string;
    mediaType: string | null;
    size: number;
    role: string | null;
    checksum?: string | null;
  }>;
}

export interface BookRelationshipDetail {
  id: string;
  targetType: string;
  targetId: string;
  relationshipType: string;
  createdAt?: string;
  targetTitle?: string;
  targetSlug?: string;
  targetHref?: string;
}

export interface PhysicalHoldingPublic {
  id: string;
  workType: "book";
  workId: string;
  manifestationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const physicalHoldingCreateSchema = z.object({
  manifestationId: z.string().uuid().optional(),
});

export const physicalHoldingIdentifySchema = z.object({
  manifestationId: z.string().uuid(),
});

export const physicalHoldingIsbnSchema = z.object({
  isbn: z.string().trim().min(1).max(32),
});

export const physicalHoldingsQuerySchema = z.object({
  withoutDigital: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export interface BookDeletionPreview {
  representations: number;
  files: number;
  manifestations: number;
  physicalHoldings: {
    holdings: number;
    users: number;
  };
  journal: {
    bookmarks: number;
    annotations: number;
  };
  reviews: number;
  relationships: number;
}

export interface BookDetail extends BookPublic {
  authors: BookAuthorPublic[];
  genres: string[];
  series: BookSeriesPublic | null;
  expressions: Array<{ id: string; label: string | null; createdAt: string }>;
  manifestations: Array<{
    id: string;
    expressionId: string;
    label: string | null;
    externalIdType: string | null;
    externalId: string | null;
    createdAt: string;
  }>;
  representations: BookRepresentationDetail[];
  relationships: BookRelationshipDetail[];
  userState: {
    favorite: boolean;
    rating: number | null;
    progress: ReadingLocator | null;
    progressRepresentationId: string | null;
  };
  overrides: Record<string, unknown>;
  /** Current user's physical holding, or null when not physically owned. */
  physicalHolding: PhysicalHoldingPublic | null;
  metadataFields: BookMetadataField[];
  customFields: BookCustomField[];
  seriesBooks: SeriesMember[];
  journalSummary: BookJournalSummary;
  readingState: BookReadingStateDetail;
}

export interface BookBookmarkPublic {
  id: string;
  label: string | null;
  locator: ReadingLocator;
  representationId: string | null;
  createdAt: string;
}

export interface BookAnnotationPublic {
  id: string;
  locator: ReadingLocator;
  highlightText: string | null;
  note: string | null;
  color: string | null;
  representationId: string | null;
  createdAt: string;
  updatedAt: string;
}
