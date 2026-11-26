import type { CanonicalFieldId } from "../../../shared/metadata-fields.js";
import type { MetadataMatchingRules } from "../../../shared/metadata-settings.js";
import {
  getBookCanonicalFieldSpec,
  getBookCanonicalFieldSpecs,
} from "../../../shared/book-metadata-field-kinds.js";

export interface MergeInput {
  fieldPolicies: Map<CanonicalFieldId, string[]>;
  sourcePayloads: Map<string, Record<string, unknown>>;
  overriddenFields: Set<string>;
  matchingRules: MetadataMatchingRules;
}

export interface MergeResult {
  values: Partial<Record<CanonicalFieldId, unknown>>;
  provenance: Partial<Record<CanonicalFieldId, string>>;
}

function buildFieldPayloadKeys(): Partial<
  Record<CanonicalFieldId, string | string[]>
> {
  const result: Partial<Record<CanonicalFieldId, string | string[]>> = {
    narrator: "narrator",
    runtime: "runtime",
    director: "director",
    cast: "cast",
    releaseDate: "releaseDate",
    studio: "studio",
    rating: "rating",
  };
  for (const spec of getBookCanonicalFieldSpecs()) {
    if (spec.mergePayloadKeys) {
      result[spec.id] = spec.mergePayloadKeys;
    }
  }
  return result;
}

const FIELD_PAYLOAD_KEYS = buildFieldPayloadKeys();

export function extractPayloadValueForField(
  payload: Record<string, unknown>,
  fieldId: CanonicalFieldId,
): unknown {
  return extractFieldValue(payload, fieldId);
}

function extractFieldValue(
  payload: Record<string, unknown>,
  fieldId: CanonicalFieldId,
): unknown {
  const keys = FIELD_PAYLOAD_KEYS[fieldId];
  if (!keys) return undefined;
  const keyList = Array.isArray(keys) ? keys : [keys];
  for (const key of keyList) {
    const val = payload[key];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return undefined;
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export function mergeMetadataFields(input: MergeInput): MergeResult {
  const values: Partial<Record<CanonicalFieldId, unknown>> = {};
  const provenance: Partial<Record<CanonicalFieldId, string>> = {};

  for (const [fieldId, sourceOrder] of input.fieldPolicies) {
    if (input.overriddenFields.has(fieldId)) continue;
    const bookSpec = getBookCanonicalFieldSpec(fieldId);
    if (bookSpec && !bookSpec.sourceMergeable) continue;

    for (const sourceId of sourceOrder) {
      const payload = input.sourcePayloads.get(sourceId);
      if (!payload) continue;
      const value = extractFieldValue(payload, fieldId);
      if (isEmptyValue(value)) continue;
      values[fieldId] = value;
      provenance[fieldId] = sourceId;
      break;
    }

    if (
      input.matchingRules.fillMissingFromLowerPriority &&
      isEmptyValue(values[fieldId])
    ) {
      for (const sourceId of sourceOrder) {
        const payload = input.sourcePayloads.get(sourceId);
        if (!payload) continue;
        const value = extractFieldValue(payload, fieldId);
        if (!isEmptyValue(value)) {
          values[fieldId] = value;
          provenance[fieldId] = sourceId;
          break;
        }
      }
    }
  }

  return { values, provenance };
}

/** Map OPF bibliographic data to canonical field payload shape. */
export function opfToPayload(opf: {
  title?: string;
  subtitle?: string;
  description?: string;
  authors?: string[];
  subjects?: string[];
  publisher?: string;
  date?: string;
  language?: string;
  identifiers?: Array<{ value: string; scheme?: string }>;
  cover?: unknown;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (opf.title) payload.title = opf.title;
  if (opf.subtitle) payload.subtitle = opf.subtitle;
  if (opf.description) payload.description = opf.description;
  if (opf.authors?.length) payload.authors = opf.authors;
  if (opf.subjects?.length) payload.genres = opf.subjects;
  if (opf.publisher) payload.publisher = opf.publisher;
  if (opf.date) payload.publicationDate = opf.date;
  if (opf.language) payload.language = opf.language;
  if (opf.cover) payload.cover = opf.cover;

  const identifierEntries = (opf.identifiers ?? []).map((id) => ({
    scheme: id.scheme,
    value: id.value,
  }));
  if (identifierEntries.length > 0) {
    payload.identifiers = identifierEntries;
  }

  for (const id of opf.identifiers ?? []) {
    const normalized = id.value.replace(/[-\s]/g, "");
    if (/^97[89]\d{10}$/.test(normalized)) {
      payload.isbn13 = normalized;
    } else if (/^\d{9}[\dXx]$/.test(normalized)) {
      payload.isbn10 = normalized.toUpperCase();
    }
  }

  return payload;
}

export function filenameToPayload(data: {
  title?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (data.title) payload.title = data.title;
  return payload;
}
