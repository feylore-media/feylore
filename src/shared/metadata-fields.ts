import type { MediaModuleId } from "./media-modules.js";

/** Canonical metadata field identifiers (Feylore-defined). */
export const CANONICAL_FIELD_IDS = [
  "title",
  "subtitle",
  "authors",
  "contributors",
  "isbn10",
  "isbn13",
  "asin",
  "identifiers",
  "description",
  "publisher",
  "publicationDate",
  "copyrightDate",
  "physicalFormat",
  "edition",
  "language",
  "originalLanguage",
  "originalPublicationDate",
  "publicationCountry",
  "genres",
  "tags",
  "pageCount",
  "ageRange",
  "contentRating",
  "cover",
  "narrator",
  "runtime",
  "series",
  "seriesPosition",
  "director",
  "cast",
  "releaseDate",
  "studio",
  "rating",
  "photo",
  "name",
  "sortName",
  "alternateNames",
  "bio",
  "pronouns",
  "personalUrl",
  "birthDate",
  "deathDate",
  "birthPlace",
  "deathPlace",
] as const;

export type CanonicalFieldId = (typeof CANONICAL_FIELD_IDS)[number];

export type MetadataFieldGroup =
  | "identity"
  | "publication"
  | "content"
  | "artwork"
  | "people"
  | "production";

export interface CanonicalFieldDefinition {
  id: CanonicalFieldId;
  label: string;
  group: MetadataFieldGroup;
  mediaModules: MediaModuleId[];
}

export const CANONICAL_FIELDS: CanonicalFieldDefinition[] = [
  {
    id: "title",
    label: "Title",
    group: "identity",
    mediaModules: ["books", "comics", "audiobooks", "music", "video"],
  },
  {
    id: "subtitle",
    label: "Subtitle",
    group: "identity",
    mediaModules: ["books", "comics"],
  },
  {
    id: "authors",
    label: "Author",
    group: "identity",
    mediaModules: ["books", "comics", "music"],
  },
  {
    id: "contributors",
    label: "Contributors",
    group: "identity",
    mediaModules: ["books"],
  },
  {
    id: "isbn10",
    label: "ISBN-10",
    group: "identity",
    mediaModules: ["books"],
  },
  {
    id: "isbn13",
    label: "ISBN-13",
    group: "identity",
    mediaModules: ["books", "comics"],
  },
  {
    id: "asin",
    label: "ASIN",
    group: "identity",
    mediaModules: ["books"],
  },
  {
    id: "identifiers",
    label: "Identifiers",
    group: "identity",
    mediaModules: ["books"],
  },
  {
    id: "description",
    label: "Description",
    group: "content",
    mediaModules: ["books", "comics", "audiobooks", "music", "video"],
  },
  {
    id: "publisher",
    label: "Publisher",
    group: "publication",
    mediaModules: ["books", "comics"],
  },
  {
    id: "publicationDate",
    label: "Publication date",
    group: "publication",
    mediaModules: ["books", "comics"],
  },
  {
    id: "copyrightDate",
    label: "Copyright date",
    group: "publication",
    mediaModules: ["books"],
  },
  {
    id: "physicalFormat",
    label: "Format",
    group: "publication",
    mediaModules: ["books", "comics"],
  },
  {
    id: "edition",
    label: "Edition",
    group: "publication",
    mediaModules: ["books"],
  },
  {
    id: "language",
    label: "Language",
    group: "publication",
    mediaModules: ["books", "comics"],
  },
  {
    id: "originalLanguage",
    label: "Original language",
    group: "publication",
    mediaModules: ["books"],
  },
  {
    id: "originalPublicationDate",
    label: "Original publication date",
    group: "publication",
    mediaModules: ["books"],
  },
  {
    id: "publicationCountry",
    label: "Country / region",
    group: "publication",
    mediaModules: ["books"],
  },
  {
    id: "genres",
    label: "Genres",
    group: "content",
    mediaModules: ["books", "comics", "audiobooks", "music", "video"],
  },
  {
    id: "tags",
    label: "Tags",
    group: "content",
    mediaModules: ["books"],
  },
  {
    id: "pageCount",
    label: "Page count",
    group: "content",
    mediaModules: ["books"],
  },
  {
    id: "ageRange",
    label: "Age range",
    group: "content",
    mediaModules: ["books"],
  },
  {
    id: "contentRating",
    label: "Content rating",
    group: "content",
    mediaModules: ["books"],
  },
  {
    id: "cover",
    label: "Cover",
    group: "artwork",
    mediaModules: ["books", "comics", "audiobooks", "music", "video"],
  },
  {
    id: "narrator",
    label: "Narrator",
    group: "people",
    mediaModules: ["audiobooks"],
  },
  {
    id: "runtime",
    label: "Runtime",
    group: "content",
    mediaModules: ["audiobooks", "music", "video"],
  },
  {
    id: "series",
    label: "Series",
    group: "identity",
    mediaModules: ["books", "audiobooks", "video"],
  },
  {
    id: "seriesPosition",
    label: "Series position",
    group: "identity",
    mediaModules: ["books", "audiobooks", "video"],
  },
  {
    id: "director",
    label: "Director",
    group: "people",
    mediaModules: ["video"],
  },
  {
    id: "cast",
    label: "Cast",
    group: "people",
    mediaModules: ["video"],
  },
  {
    id: "releaseDate",
    label: "Release date",
    group: "publication",
    mediaModules: ["video", "audiobooks", "music"],
  },
  {
    id: "studio",
    label: "Studio",
    group: "publication",
    mediaModules: ["video"],
  },
  {
    id: "rating",
    label: "Rating",
    group: "content",
    mediaModules: ["video"],
  },
  {
    id: "photo",
    label: "Portrait",
    group: "artwork",
    mediaModules: ["people"],
  },
  {
    id: "name",
    label: "Name",
    group: "identity",
    mediaModules: ["people"],
  },
  {
    id: "sortName",
    label: "Sort name",
    group: "identity",
    mediaModules: ["people"],
  },
  {
    id: "alternateNames",
    label: "Alternate names",
    group: "identity",
    mediaModules: ["people"],
  },
  {
    id: "bio",
    label: "Bio",
    group: "content",
    mediaModules: ["people"],
  },
  {
    id: "pronouns",
    label: "Pronouns",
    group: "identity",
    mediaModules: ["people"],
  },
  {
    id: "personalUrl",
    label: "Personal site",
    group: "identity",
    mediaModules: ["people"],
  },
  {
    id: "birthDate",
    label: "Birth date",
    group: "identity",
    mediaModules: ["people"],
  },
  {
    id: "deathDate",
    label: "Death date",
    group: "identity",
    mediaModules: ["people"],
  },
  {
    id: "birthPlace",
    label: "Birth place",
    group: "identity",
    mediaModules: ["people"],
  },
  {
    id: "deathPlace",
    label: "Death place",
    group: "identity",
    mediaModules: ["people"],
  },
];

export const FIELD_GROUP_ORDER: MetadataFieldGroup[] = [
  "identity",
  "publication",
  "content",
  "artwork",
  "people",
  "production",
];

export const FIELD_GROUP_LABELS: Record<MetadataFieldGroup, string> = {
  identity: "Identity",
  publication: "Publication",
  content: "Content",
  artwork: "Artwork",
  people: "People",
  production: "Production",
};

export function getCanonicalFieldsForModule(
  moduleId: MediaModuleId,
): CanonicalFieldDefinition[] {
  return CANONICAL_FIELDS.filter((f) => f.mediaModules.includes(moduleId));
}

export function getCanonicalFieldsByGroup(
  moduleId: MediaModuleId,
): Map<MetadataFieldGroup, CanonicalFieldDefinition[]> {
  const grouped = new Map<MetadataFieldGroup, CanonicalFieldDefinition[]>();
  for (const field of getCanonicalFieldsForModule(moduleId)) {
    const list = grouped.get(field.group) ?? [];
    list.push(field);
    grouped.set(field.group, list);
  }
  return grouped;
}

/** Custom field types (Feylore-owned, not provider capabilities). */
export const CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "boolean",
  "date",
  "select",
  "multi_select",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export function isCanonicalFieldId(value: string): value is CanonicalFieldId {
  return (CANONICAL_FIELD_IDS as readonly string[]).includes(value);
}
