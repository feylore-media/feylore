import type { CanonicalFieldId } from "./metadata-fields.js";
import {
  getCanonicalFieldsForModule,
  FIELD_GROUP_ORDER,
  type MetadataFieldGroup,
} from "./metadata-fields.js";

export type BookMetadataFieldKind =
  | "text"
  | "textarea"
  | "commaList"
  | "number"
  | "identifiers"
  | "cover";

export type BookCanonicalStorage =
  | "bookColumn"
  | "association"
  | "series"
  | "scalar"
  | "artwork";

export interface BookIdentifierEntry {
  scheme?: string;
  value: string;
}

export interface BookCanonicalFieldSpec {
  id: CanonicalFieldId;
  kind: BookMetadataFieldKind;
  storage: BookCanonicalStorage;
  /** Whether automatic source merge may populate this field. */
  sourceMergeable: boolean;
  /** Payload key(s) in metadata_records; omitted when not mergeable from sources. */
  mergePayloadKeys?: string | string[];
  primary: boolean;
  /** When false, field is stored/merged internally but not shown or editable in UI. */
  userFacing?: boolean;
}

const BOOK_FIELD_SPECS: BookCanonicalFieldSpec[] = [
  { id: "title", kind: "text", storage: "bookColumn", sourceMergeable: true, mergePayloadKeys: "title", primary: true },
  { id: "subtitle", kind: "text", storage: "bookColumn", sourceMergeable: true, mergePayloadKeys: "subtitle", primary: true },
  { id: "authors", kind: "commaList", storage: "association", sourceMergeable: true, mergePayloadKeys: "authors", primary: true },
  { id: "contributors", kind: "commaList", storage: "association", sourceMergeable: true, mergePayloadKeys: "contributors", primary: false },
  { id: "series", kind: "text", storage: "series", sourceMergeable: true, mergePayloadKeys: "series", primary: true },
  { id: "seriesPosition", kind: "number", storage: "series", sourceMergeable: true, mergePayloadKeys: "seriesPosition", primary: false },
  { id: "isbn10", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "isbn10", primary: false },
  { id: "isbn13", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "isbn13", primary: true },
  { id: "asin", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "asin", primary: false },
  { id: "identifiers", kind: "identifiers", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "identifiers", primary: false, userFacing: false },
  { id: "publisher", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "publisher", primary: true },
  { id: "publicationDate", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: ["publicationDate", "date"], primary: true },
  { id: "copyrightDate", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "copyrightDate", primary: false },
  { id: "physicalFormat", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "physicalFormat", primary: false },
  { id: "edition", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "edition", primary: false },
  { id: "language", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "language", primary: true },
  { id: "originalLanguage", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "originalLanguage", primary: false },
  { id: "originalPublicationDate", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "originalPublicationDate", primary: false },
  { id: "publicationCountry", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "publicationCountry", primary: false },
  { id: "description", kind: "textarea", storage: "bookColumn", sourceMergeable: true, mergePayloadKeys: "description", primary: false },
  { id: "genres", kind: "commaList", storage: "association", sourceMergeable: true, mergePayloadKeys: ["genres", "subjects"], primary: true },
  { id: "tags", kind: "commaList", storage: "association", sourceMergeable: false, primary: false },
  { id: "pageCount", kind: "number", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "pageCount", primary: false },
  { id: "ageRange", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "ageRange", primary: false },
  { id: "contentRating", kind: "text", storage: "scalar", sourceMergeable: true, mergePayloadKeys: "contentRating", primary: false },
  { id: "cover", kind: "cover", storage: "artwork", sourceMergeable: true, mergePayloadKeys: "cover", primary: false },
];

const specById = new Map(BOOK_FIELD_SPECS.map((s) => [s.id, s]));

/** Display order for the book metadata editor matrix (cover first). */
export const BOOK_METADATA_EDITOR_FIELD_ORDER: CanonicalFieldId[] = [
  "cover",
  "title",
  "subtitle",
  "authors",
  "contributors",
  "series",
  "seriesPosition",
  "isbn10",
  "isbn13",
  "asin",
  "publisher",
  "publicationDate",
  "copyrightDate",
  "physicalFormat",
  "edition",
  "language",
  "originalLanguage",
  "originalPublicationDate",
  "publicationCountry",
  "description",
  "genres",
  "tags",
  "pageCount",
  "ageRange",
  "contentRating",
];

export function getBookEditorFieldOrder(): CanonicalFieldId[] {
  return BOOK_METADATA_EDITOR_FIELD_ORDER.filter(
    (id) => specById.has(id) && isBookUserFacingField(id),
  );
}

export function isBookUserFacingField(fieldId: CanonicalFieldId): boolean {
  const spec = specById.get(fieldId);
  return spec ? spec.userFacing !== false : false;
}

export function getBookCanonicalFieldSpecs(): BookCanonicalFieldSpec[] {
  return BOOK_FIELD_SPECS;
}

export function getBookPrimaryFieldIds(): Set<CanonicalFieldId> {
  return new Set(
    BOOK_FIELD_SPECS.filter((spec) => spec.primary).map((spec) => spec.id),
  );
}

export function isBookFieldSourceMergeable(fieldId: CanonicalFieldId): boolean {
  return specById.get(fieldId)?.sourceMergeable ?? false;
}

export function getBookEditorFieldGroups(): MetadataFieldGroup[] {
  const groups = new Set<MetadataFieldGroup>();
  for (const def of getCanonicalFieldsForModule("books")) {
    if (def.id === "rating") continue;
    groups.add(def.group);
  }
  return FIELD_GROUP_ORDER.filter((group) => groups.has(group));
}

export function getBookCanonicalFieldSpec(
  fieldId: CanonicalFieldId,
): BookCanonicalFieldSpec | undefined {
  return specById.get(fieldId);
}

export function getBookFieldKind(fieldId: CanonicalFieldId): BookMetadataFieldKind {
  return specById.get(fieldId)?.kind ?? "text";
}

export function getBookFieldsForGroup(
  group: MetadataFieldGroup,
): BookCanonicalFieldSpec[] {
  const defs = getCanonicalFieldsForModule("books");
  const groupIds = new Set(defs.filter((d) => d.group === group).map((d) => d.id));
  return BOOK_FIELD_SPECS.filter((s) => groupIds.has(s.id));
}

export function getBookMergePayloadKeys(): Partial<
  Record<CanonicalFieldId, string | string[]>
> {
  const result: Partial<Record<CanonicalFieldId, string | string[]>> = {};
  for (const spec of BOOK_FIELD_SPECS) {
    if (spec.mergePayloadKeys) {
      result[spec.id] = spec.mergePayloadKeys;
    }
  }
  return result;
}

export function isBookEditorField(fieldId: CanonicalFieldId): boolean {
  return isBookUserFacingField(fieldId);
}

export function formatBookCanonicalValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (
      value.every(
        (v) =>
          typeof v === "object" &&
          v !== null &&
          "value" in (v as Record<string, unknown>),
      )
    ) {
      return (value as BookIdentifierEntry[])
        .map((id) => (id.scheme ? `${id.scheme}: ${id.value}` : id.value))
        .join(" · ");
    }
    return value.map(String).join(", ");
  }
  if (typeof value === "object") return null;
  return String(value);
}

export function parseBookFieldValueForSave(
  fieldId: CanonicalFieldId,
  raw: string,
): unknown {
  const kind = getBookFieldKind(fieldId);
  if (kind === "commaList") {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (kind === "number") {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : undefined;
  }
  if (kind === "identifiers") {
    return parseIdentifiersInput(raw);
  }
  return raw || undefined;
}

export function parseIdentifiersInput(raw: string): BookIdentifierEntry[] {
  const entries: BookIdentifierEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon > 0) {
      entries.push({
        scheme: trimmed.slice(0, colon).trim(),
        value: trimmed.slice(colon + 1).trim(),
      });
    } else {
      entries.push({ value: trimmed });
    }
  }
  return entries;
}

export function identifiersToInputText(
  value: unknown,
): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || !("value" in entry)) {
        return String(entry);
      }
      const e = entry as BookIdentifierEntry;
      return e.scheme ? `${e.scheme}: ${e.value}` : e.value;
    })
    .join("\n");
}
