import type { CanonicalFieldId } from "./metadata-fields.js";

export type PersonMetadataFieldKind =
  | "text"
  | "textarea"
  | "commaList"
  | "cover";

export interface PersonCanonicalFieldSpec {
  id: CanonicalFieldId;
  kind: PersonMetadataFieldKind;
  /** Whether automatic source merge may populate this field. */
  sourceMergeable: boolean;
  /** Payload key(s) in metadata_records for this field. */
  mergePayloadKeys?: string | string[];
  primary: boolean;
  /** When false, field is stored internally but not shown or editable in UI. */
  userFacing?: boolean;
}

export const PERSON_FIELD_SPECS: PersonCanonicalFieldSpec[] = [
  {
    id: "photo",
    kind: "cover",
    sourceMergeable: true,
    mergePayloadKeys: "photo",
    primary: false,
  },
  {
    id: "name",
    kind: "text",
    sourceMergeable: true,
    mergePayloadKeys: "name",
    primary: true,
  },
  {
    id: "sortName",
    kind: "text",
    sourceMergeable: true,
    mergePayloadKeys: "sortName",
    primary: false,
  },
  {
    id: "alternateNames",
    kind: "commaList",
    sourceMergeable: true,
    mergePayloadKeys: "alternateNames",
    primary: false,
  },
  {
    id: "bio",
    kind: "textarea",
    sourceMergeable: true,
    mergePayloadKeys: "bio",
    primary: false,
  },
  {
    id: "pronouns",
    kind: "text",
    sourceMergeable: true,
    mergePayloadKeys: "pronouns",
    primary: false,
  },
  {
    id: "personalUrl",
    kind: "text",
    sourceMergeable: true,
    mergePayloadKeys: "personalUrl",
    primary: false,
  },
  {
    id: "birthDate",
    kind: "text",
    sourceMergeable: true,
    mergePayloadKeys: ["birthDate", "dateOfBirth"],
    primary: false,
  },
  {
    id: "deathDate",
    kind: "text",
    sourceMergeable: true,
    mergePayloadKeys: ["deathDate", "dateOfDeath"],
    primary: false,
  },
  {
    id: "birthPlace",
    kind: "text",
    sourceMergeable: true,
    mergePayloadKeys: ["birthPlace", "placeOfBirth"],
    primary: false,
  },
  {
    id: "deathPlace",
    kind: "text",
    sourceMergeable: true,
    mergePayloadKeys: ["deathPlace", "placeOfDeath"],
    primary: false,
  },
];

const specById = new Map(PERSON_FIELD_SPECS.map((s) => [s.id, s]));

/** Display order for the person metadata editor matrix (portrait first). */
export const PERSON_METADATA_EDITOR_FIELD_ORDER: CanonicalFieldId[] = [
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
];

export function getPersonEditorFieldOrder(): CanonicalFieldId[] {
  return PERSON_METADATA_EDITOR_FIELD_ORDER.filter(
    (id) => specById.has(id) && isPersonUserFacingField(id),
  );
}

export function isPersonUserFacingField(fieldId: CanonicalFieldId): boolean {
  const spec = specById.get(fieldId);
  return spec ? spec.userFacing !== false : false;
}

export function getPersonCanonicalFieldSpecs(): PersonCanonicalFieldSpec[] {
  return PERSON_FIELD_SPECS;
}

export function getPersonPrimaryFieldIds(): Set<CanonicalFieldId> {
  return new Set(
    PERSON_FIELD_SPECS.filter((spec) => spec.primary).map((spec) => spec.id),
  );
}

export function isPersonFieldSourceMergeable(
  fieldId: CanonicalFieldId,
): boolean {
  return specById.get(fieldId)?.sourceMergeable ?? false;
}

export function getPersonCanonicalFieldSpec(
  fieldId: CanonicalFieldId,
): PersonCanonicalFieldSpec | undefined {
  return specById.get(fieldId);
}

export function getPersonFieldKind(
  fieldId: CanonicalFieldId,
): PersonMetadataFieldKind {
  return specById.get(fieldId)?.kind ?? "text";
}

export function getPersonMergePayloadKeys(): Partial<
  Record<CanonicalFieldId, string | string[]>
> {
  const result: Partial<Record<CanonicalFieldId, string | string[]>> = {};
  for (const spec of PERSON_FIELD_SPECS) {
    if (spec.mergePayloadKeys) {
      result[spec.id] = spec.mergePayloadKeys;
    }
  }
  return result;
}

export function isPersonEditorField(fieldId: CanonicalFieldId): boolean {
  return isPersonUserFacingField(fieldId);
}

export function formatPersonCanonicalValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.map(String).join(", ");
  }
  if (typeof value === "object") return null;
  return String(value);
}

export function parsePersonFieldValueForSave(
  fieldId: CanonicalFieldId,
  raw: string,
): unknown {
  const kind = getPersonFieldKind(fieldId);
  if (kind === "commaList" || fieldId === "alternateNames") {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}