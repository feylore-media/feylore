import type { CanonicalFieldId } from "../../../shared/metadata-fields.js";
import { getCanonicalFieldsForModule } from "../../../shared/metadata-fields.js";
import {
  formatBookCanonicalValue,
  getBookCanonicalFieldSpec,
  getBookCanonicalFieldSpecs,
  getBookPrimaryFieldIds,
  isBookUserFacingField,
} from "../../../shared/book-metadata-field-kinds.js";
import type { BookMetadataField } from "../../../shared/books.js";
import type { FieldProvenance } from "../../../shared/metadata-provenance.js";
import { FEYLORE_SOURCE_KEY } from "../../../shared/metadata-source-category.js";
import { extractPayloadValueForField } from "./merge.js";

export interface BookCanonicalReadContext {
  title: string;
  subtitle: string | null;
  description: string | null;
  authors: string[];
  contributors: string[];
  genres: string[];
  tags: string[];
  seriesName?: string | null;
  seriesPosition?: number | null;
  coverFileId?: string | null;
  manifestationIsbn?: string | null;
}

export function getBookMetadataFieldIds(): CanonicalFieldId[] {
  return getCanonicalFieldsForModule("books")
    .filter((f) => f.id !== "rating")
    .map((f) => f.id);
}

export function readBookCanonicalFieldValue(
  fieldId: CanonicalFieldId,
  ctx: BookCanonicalReadContext,
  overrideMap: Record<string, unknown>,
  mergedValues: Partial<Record<CanonicalFieldId, unknown>>,
): unknown {
  const spec = getBookCanonicalFieldSpec(fieldId);
  if (!spec) return undefined;

  switch (spec.storage) {
    case "bookColumn": {
      if (fieldId === "title") return ctx.title;
      if (fieldId === "subtitle") return ctx.subtitle;
      if (fieldId === "description") return ctx.description;
      return undefined;
    }
    case "association": {
      if (fieldId === "authors") {
        return ctx.authors.length ? ctx.authors : mergedValues.authors;
      }
      if (fieldId === "contributors") {
        return ctx.contributors.length
          ? ctx.contributors
          : mergedValues.contributors;
      }
      if (fieldId === "genres") {
        return ctx.genres.length ? ctx.genres : mergedValues.genres;
      }
      if (fieldId === "tags") {
        return ctx.tags.length ? ctx.tags : undefined;
      }
      return undefined;
    }
    case "series": {
      if (fieldId === "series") {
        return ctx.seriesName ?? mergedValues.series;
      }
      if (fieldId === "seriesPosition") {
        return ctx.seriesPosition ?? mergedValues.seriesPosition;
      }
      return undefined;
    }
    case "artwork": {
      if (fieldId === "cover") {
        return ctx.coverFileId ?? mergedValues.cover;
      }
      return undefined;
    }
    case "scalar": {
      if (fieldId === "isbn13") {
        return (
          overrideMap.isbn13 ??
          mergedValues.isbn13 ??
          ctx.manifestationIsbn
        );
      }
      return overrideMap[fieldId] ?? mergedValues[fieldId];
    }
    default:
      return undefined;
  }
}

export function buildBookMetadataFields(input: {
  ctx: BookCanonicalReadContext;
  overrideMap: Record<string, unknown>;
  mergedValues: Partial<Record<CanonicalFieldId, unknown>>;
  provenanceMap: Map<string, FieldProvenance>;
  sourceLabels: Map<string, string>;
}): BookMetadataField[] {
  const fields: BookMetadataField[] = [];
  const primaryIds = getBookPrimaryFieldIds();

  for (const spec of getBookCanonicalFieldSpecs()) {
    if (!isBookUserFacingField(spec.id)) continue;
    const def = getCanonicalFieldsForModule("books").find((f) => f.id === spec.id);
    if (!def) continue;

    const value = readBookCanonicalFieldValue(
      spec.id,
      input.ctx,
      input.overrideMap,
      input.mergedValues,
    );
    const formatted = formatBookCanonicalValue(value);
    const provenance = input.provenanceMap.get(spec.id) ?? null;

    if (!formatted && !provenance) continue;

    fields.push({
      id: spec.id,
      label: def.label,
      value: formatted ?? "—",
      group: def.group,
      prominence: primaryIds.has(spec.id) ? "primary" : "secondary",
      provenance: withSourceLabel(provenance, input.sourceLabels),
    });
  }

  return fields;
}

function withSourceLabel(
  provenance: FieldProvenance | null,
  sourceLabels: Map<string, string>,
): BookMetadataField["provenance"] {
  if (!provenance) return null;
  const sourceLabel =
    provenance.sourceKey === FEYLORE_SOURCE_KEY ||
    provenance.sourceCategory === "canonical"
      ? undefined
      : (sourceLabels.get(provenance.sourceKey) ?? provenance.sourceKey);
  return {
    sourceKey: provenance.sourceKey,
    sourceCategory: provenance.sourceCategory,
    origin: provenance.origin,
    sourceLabel,
  };
}

export function extractEditorPayloadValue(
  payload: Record<string, unknown>,
  fieldId: CanonicalFieldId,
): unknown {
  return extractPayloadValueForField(payload, fieldId);
}
