import type { BookMetadataField } from "@shared/books";

/** Shown in the overview hero/description; omit from inline metadata grids there. */
const OVERVIEW_METADATA_EXCLUDED = new Set(["title", "subtitle", "description"]);

export function metadataFieldsForOverview(
  fields: BookMetadataField[],
): BookMetadataField[] {
  return fields.filter((field) => !OVERVIEW_METADATA_EXCLUDED.has(field.id));
}
