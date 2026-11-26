import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { MetadataService } from "./service.js";
import type { MetadataPolicyService } from "./policy.js";
import type { MetadataProvenanceService } from "./provenance.js";
import type { BooksService } from "../books/service.js";
import type { MetadataProviderRegistry } from "./registry.js";
import type {
  BookMetadataEditorData,
  MetadataEditorFieldRow,
  MetadataEditorSourceColumn,
  MetadataEditorSourceCell,
  MetadataEditorProviderFieldRow,
  MetadataEditorProviderFieldKind,
} from "../../../shared/book-metadata-editor.js";
import { mergeMetadataFields } from "./merge.js";
import {
  getMetadataSourceCategory,
  FEYLORE_SOURCE_KEY,
} from "../../../shared/metadata-source-category.js";
import {
  formatBookCanonicalValue,
  getBookCanonicalFieldSpecs,
  getBookEditorFieldOrder,
} from "../../../shared/book-metadata-field-kinds.js";
import { getCanonicalFieldsForModule } from "../../../shared/metadata-fields.js";
import {
  extractEditorPayloadValue,
  readBookCanonicalFieldValue,
} from "./book-canonical-values.js";

export type {
  BookMetadataEditorData,
  MetadataEditorFieldRow,
  MetadataEditorSourceColumn,
  MetadataEditorSourceCell,
};

function formatCoverSourceCell(
  payload: Record<string, unknown> | undefined,
): Pick<MetadataEditorSourceCell, "value" | "gap" | "coverFileId" | "coverUrl"> {
  if (!payload) {
    return { value: null, gap: true, coverFileId: null, coverUrl: null };
  }
  const raw = payload.cover;
  if (typeof raw === "string" && raw) {
    return {
      value: raw,
      gap: false,
      coverFileId: raw,
      coverUrl: null,
    };
  }
  if (typeof raw === "object" && raw !== null && "url" in raw) {
    const url = (raw as { url?: unknown }).url;
    if (typeof url === "string" && url) {
      return {
        value: url,
        gap: false,
        coverFileId: null,
        coverUrl: url,
      };
    }
  }
  return { value: null, gap: true, coverFileId: null, coverUrl: null };
}

function buildProviderColumns(
  keys: Set<string>,
  descriptorByKey: Map<string, { name: string }>,
): MetadataEditorSourceColumn[] {
  const result: MetadataEditorSourceColumn[] = [];
  for (const key of keys) {
    const meta = descriptorByKey.get(key);
    if (!meta) continue;
    result.push({
      key,
      label: meta.name,
      category: "provider",
    });
  }
  return result;
}

function formatProviderFieldValue(
  raw: unknown,
  kind: MetadataEditorProviderFieldKind,
): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (kind === "number" || kind === "rating") {
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    return null;
  }
  if (typeof raw === "object") return null;
  return String(raw);
}

function providerFieldHasValue(sources: MetadataEditorSourceCell[]): boolean {
  return sources.some(
    (source) =>
      source.value !== null &&
      source.value !== undefined &&
      source.value !== "" &&
      !source.gap,
  );
}

function buildProviderSpecificFields(
  registry: MetadataProviderRegistry,
  providerSources: MetadataEditorSourceColumn[],
  sourcePayloads: Map<string, Record<string, unknown>>,
): MetadataEditorProviderFieldRow[] {
  const providerKeys = new Set(providerSources.map((source) => source.key));
  const rows: MetadataEditorProviderFieldRow[] = [];

  for (const descriptor of registry.listDescriptors("books")) {
    if (!providerKeys.has(descriptor.id) || !descriptor.providerFields) continue;

    for (const field of descriptor.providerFields) {
      const kind = field.kind ?? "text";
      const sources: MetadataEditorSourceCell[] = providerSources.map((column) => {
        const payload = sourcePayloads.get(column.key);
        if (!payload) {
          return { key: column.key, value: null, gap: true };
        }
        const raw = payload[field.key];
        const formatted = formatProviderFieldValue(raw, kind);
        return {
          key: column.key,
          value: formatted,
          gap: formatted === null,
        };
      });

      if (!providerFieldHasValue(sources)) continue;

      rows.push({
        key: field.key,
        label: field.label,
        providerKey: descriptor.id,
        providerLabel: descriptor.name,
        kind,
        sources,
      });
    }
  }

  return rows.sort(
    (a, b) =>
      a.providerLabel.localeCompare(b.providerLabel) ||
      a.label.localeCompare(b.label),
  );
}

export async function buildBookMetadataEditor(
  db: Database,
  metadata: MetadataService,
  metadataPolicy: MetadataPolicyService,
  provenanceService: MetadataProvenanceService,
  registry: MetadataProviderRegistry,
  books: BooksService,
  bookId: string,
): Promise<BookMetadataEditorData> {
  const book = await books.getBook(bookId);
  const authors = await books.getAuthorNames(bookId);
  const contributors = await books.getContributorNames(bookId);
  const genres = await books.getGenreNames(bookId);
  const tags = await books.getTagNames(bookId);
  const series = await books.getSeriesForBook(bookId);

  const records = await db
    .select()
    .from(schema.metadataRecords)
    .where(
      and(
        eq(schema.metadataRecords.subjectType, "book"),
        eq(schema.metadataRecords.subjectId, bookId),
      ),
    )
    .orderBy(desc(schema.metadataRecords.fetchedAt));

  const sourcePayloads = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    if (!sourcePayloads.has(record.providerKey)) {
      sourcePayloads.set(record.providerKey, record.payload);
    }
  }

  const overrides = await metadata.getOverrides("book", bookId);
  const overriddenFields = new Set(overrides.map((o) => o.field));
  const overrideMap: Record<string, unknown> = {};
  for (const o of overrides) {
    overrideMap[o.field] = o.value;
  }

  const fieldPolicies = await metadataPolicy.getProviderFieldPriorities("books");
  const matchingRules = await metadataPolicy.getMatchingRules("books");
  const providerPayloads = new Map<string, Record<string, unknown>>();
  for (const [key, payload] of sourcePayloads) {
    const descriptor = registry.getDescriptor(key);
    if (descriptor && getMetadataSourceCategory(descriptor) === "provider") {
      providerPayloads.set(key, payload);
    }
  }
  const merged = mergeMetadataFields({
    fieldPolicies,
    sourcePayloads: providerPayloads,
    overriddenFields,
    matchingRules,
  });

  const provenanceMap = await provenanceService.listProvenance("book", bookId);

  const ctx = {
    title: book.title,
    subtitle: book.subtitle,
    description: book.description,
    authors,
    contributors,
    genres,
    tags,
    seriesName: series?.name,
    seriesPosition: series?.position,
    coverFileId: book.coverFileId,
  };

  const sourceKeys = new Set<string>();
  for (const record of records) {
    const descriptor = registry.getDescriptor(record.providerKey);
    if (
      record.providerKey !== FEYLORE_SOURCE_KEY &&
      descriptor &&
      getMetadataSourceCategory(descriptor) === "provider"
    ) {
      sourceKeys.add(record.providerKey);
    }
  }
  for (const sources of fieldPolicies.values()) {
    for (const key of sources) {
      if (key !== FEYLORE_SOURCE_KEY) sourceKeys.add(key);
    }
  }

  const descriptors = await metadata.listProvidersWithDescriptors("books");
  const descriptorByKey = new Map(
    descriptors
      .filter((d) => d.sourceCategory === "provider")
      .map((d) => [d.key, { name: d.name }]),
  );

  const providerSources = buildProviderColumns(sourceKeys, descriptorByKey);

  const fieldDefById = new Map(
    getCanonicalFieldsForModule("books")
      .filter((f) => f.id !== "rating")
      .map((f) => [f.id, f]),
  );
  const specById = new Map(
    getBookCanonicalFieldSpecs().map((spec) => [spec.id, spec]),
  );

  const fields: MetadataEditorFieldRow[] = [];

  for (const fieldId of getBookEditorFieldOrder()) {
    const def = fieldDefById.get(fieldId);
    const spec = specById.get(fieldId);
    if (!def || !spec) continue;

    const feyloreRaw = overriddenFields.has(def.id)
      ? overrideMap[def.id]
      : readBookCanonicalFieldValue(fieldId, ctx, overrideMap, merged.values);
    const feyloreValue = formatBookCanonicalValue(feyloreRaw);

    const sourceCells: MetadataEditorSourceCell[] = providerSources.map((column) => {
      const payload = sourcePayloads.get(column.key);
      if (fieldId === "cover") {
        return {
          key: column.key,
          ...formatCoverSourceCell(payload),
        };
      }
      if (!payload) {
        return {
          key: column.key,
          value: null,
          gap: true,
        };
      }
      const raw = extractEditorPayloadValue(payload, fieldId);
      const formatted = formatBookCanonicalValue(raw);
      return {
        key: column.key,
        value: formatted,
        gap: formatted === null,
      };
    });

    fields.push({
      id: def.id,
      label: def.label,
      group: def.group,
      feyloreValue,
      isLocked: overriddenFields.has(def.id),
      provenance: provenanceMap.get(def.id) ?? null,
      sources: sourceCells,
    });
  }

  const providerSpecificFields = buildProviderSpecificFields(
    registry,
    providerSources,
    sourcePayloads,
  );

  return { providerSources, fields, providerSpecificFields };
}

export function resolveAdoptSourceCategory(
  sourceKey: string,
  registry: MetadataProviderRegistry,
): "imported" | "provider" {
  const descriptor = registry.getDescriptor(sourceKey);
  if (!descriptor) {
    return sourceKey.startsWith("embedded.") ? "imported" : "provider";
  }
  return getMetadataSourceCategory(descriptor);
}
