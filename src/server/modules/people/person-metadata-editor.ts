import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { MetadataService } from "../metadata/service.js";
import type { MetadataPolicyService } from "../metadata/policy.js";
import type { MetadataProvenanceService } from "../metadata/provenance.js";
import type { MetadataProviderRegistry } from "../metadata/registry.js";
import type { PeopleService } from "./service.js";
import type { PersonEvidenceLink, PersonEvidenceIdentifier } from "../../../shared/person-metadata-editor.js";
import type {
  PersonMetadataEditorData,
  PersonProviderStatus,
} from "../../../shared/person-metadata-editor.js";
import type {
  MetadataEditorFieldRow,
  MetadataEditorSourceCell,
  MetadataEditorSourceColumn,
} from "../../../shared/book-metadata-editor.js";
import {
  getMetadataSourceCategory,
  FEYLORE_SOURCE_KEY,
} from "../../../shared/metadata-source-category.js";
import {
  formatPersonCanonicalValue,
  getPersonEditorFieldOrder,
  getPersonMergePayloadKeys,
} from "../../../shared/person-metadata-field-kinds.js";
import { getCanonicalFieldsForModule } from "../../../shared/metadata-fields.js";

export type {
  PersonMetadataEditorData,
  PersonProviderStatus,
};

function extractPersonPayloadValue(
  payload: Record<string, unknown>,
  fieldId: string,
): unknown {
  const keys = getPersonMergePayloadKeys();
  const candidates = keys[fieldId as keyof typeof keys];
  const list = Array.isArray(candidates)
    ? candidates
    : [candidates].filter(Boolean);
  for (const key of list) {
    if (key && payload[key] !== undefined) return payload[key];
  }
  return undefined;
}

function formatPhotoSourceCell(
  payload: Record<string, unknown> | undefined,
): Pick<MetadataEditorSourceCell, "value" | "gap" | "coverFileId" | "coverUrl"> {
  if (!payload) {
    return { value: null, gap: true, coverFileId: null, coverUrl: null };
  }
  const raw = payload.photo;
  if (typeof raw === "string" && raw) {
    return {
      value: raw,
      gap: false,
      coverFileId: null,
      coverUrl: raw,
    };
  }
  return { value: null, gap: true, coverFileId: null, coverUrl: null };
}

function buildProviderColumns(
  keys: Set<string>,
  nameByKey: Map<string, string>,
): MetadataEditorSourceColumn[] {
  const columns: MetadataEditorSourceColumn[] = [];
  for (const key of keys) {
    const name = nameByKey.get(key);
    if (!name) continue;
    columns.push({ key, label: name, category: "provider" });
  }
  return columns;
}

export async function buildPersonMetadataEditor(
  db: Database,
  metadata: MetadataService,
  metadataPolicy: MetadataPolicyService,
  provenanceService: MetadataProvenanceService,
  registry: MetadataProviderRegistry,
  people: PeopleService,
  personId: string,
): Promise<PersonMetadataEditorData> {
  const person = await people.getPersonRow(personId);
  if (!person) {
    throw new Error("People entity not found");
  }

  const [overrides, provenanceMap, links, credits] = await Promise.all([
      metadata.getOverrides("person", personId),
      provenanceService.listProvenance("person", personId),
      people.listPersonLinks(personId),
      people.creditCountsForPerson(personId),
    ]);

  const records = await db
    .select()
    .from(schema.metadataRecords)
    .where(
      and(
        eq(schema.metadataRecords.subjectType, "person"),
        eq(schema.metadataRecords.subjectId, personId),
      ),
    )
    .orderBy(desc(schema.metadataRecords.fetchedAt));

  const sourcePayloads = new Map<string, Record<string, unknown>>();
  const fetchedAtByKey = new Map<string, string>();
  for (const record of records) {
    if (!sourcePayloads.has(record.providerKey)) {
      sourcePayloads.set(record.providerKey, record.payload);
      fetchedAtByKey.set(record.providerKey, record.fetchedAt.toISOString());
    }
  }

  const overriddenFields = new Set(overrides.map((o) => o.field));
  const overrideMap: Record<string, unknown> = {};
  for (const o of overrides) {
    overrideMap[o.field] = o.value;
  }

  const policySources = await metadataPolicy.getProviderFieldPriorities(
    "people",
  );
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
  for (const sources of policySources.values()) {
    for (const key of sources) {
      if (key !== FEYLORE_SOURCE_KEY) sourceKeys.add(key);
    }
  }

  const descriptors = await metadata.listProvidersWithDescriptors("people");
  const nameByKey = new Map<string, string>();
  for (const d of descriptors) {
    if (d.sourceCategory === "provider") {
      nameByKey.set(d.key, d.name);
    }
  }

  const providerSources = buildProviderColumns(sourceKeys, nameByKey);

  const fieldDefById = new Map(
    getCanonicalFieldsForModule("people").map((f) => [f.id, f]),
  );

  const fields: MetadataEditorFieldRow[] = [];
  for (const fieldId of getPersonEditorFieldOrder()) {
    const def = fieldDefById.get(fieldId);
    if (!def) continue;

    const feyloreRaw = overriddenFields.has(def.id)
      ? overrideMap[def.id]
      : people.readPersonCanonicalColumn(person, fieldId);
    const feyloreValue = formatPersonCanonicalValue(feyloreRaw);

    const sourceCells: MetadataEditorSourceCell[] = providerSources.map(
      (column) => {
        const payload = sourcePayloads.get(column.key);
        if (fieldId === "photo") {
          return { key: column.key, ...formatPhotoSourceCell(payload) };
        }
        if (!payload) {
          return { key: column.key, value: null, gap: true };
        }
        const raw = extractPersonPayloadValue(payload, fieldId);
        const formatted = formatPersonCanonicalValue(raw);
        return {
          key: column.key,
          value: formatted,
          gap: formatted === null,
        };
      },
    );

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

  const providers: PersonProviderStatus[] = providerSources.map((column) => ({
    key: column.key,
    label: column.label,
    fetchedAt: fetchedAtByKey.get(column.key) ?? null,
    available: true,
  }));

  const identifiers = (await people.listPersonProviderIdentifiers(personId)).map(
    (row) => ({
      provider: row.provider,
      providerLabel: nameByKey.get(row.provider) ?? row.provider,
      identifier: row.identifier,
      sourceLabel: row.sourceLabel ?? null,
    }),
  );

  const linkCandidates: PersonEvidenceLink[] = [];
  const identifierCandidates: PersonEvidenceIdentifier[] = [];
  for (const [sourceKey, payload] of sourcePayloads) {
    if (Array.isArray(payload.links)) {
      for (const candidate of payload.links) {
        if (candidate && typeof candidate === "object" &&
          typeof candidate.kind === "string" && typeof candidate.label === "string" &&
          typeof candidate.url === "string") {
          linkCandidates.push({ kind: candidate.kind as PersonEvidenceLink["kind"],
            label: candidate.label, url: candidate.url, sourceKey });
        }
      }
    }
    if (Array.isArray(payload.identifiers)) {
      for (const candidate of payload.identifiers) {
        if (candidate && typeof candidate === "object" &&
          typeof candidate.provider === "string" && typeof candidate.identifier === "string") {
          identifierCandidates.push({ provider: candidate.provider,
            identifier: candidate.identifier, sourceKey });
        }
      }
    }
  }

  const creditCounts: Record<string, number> = {};
  for (const [targetType, n] of credits) {
    creditCounts[targetType] = n;
  }

  return {
    person: {
      id: person.id,
      slug: person.slug,
      entityType: person.entityType,
      name: person.name,
      sortName: person.sortName,
      alternateNames: person.alternateNames ?? [],
      bio: person.bio,
      pronouns: person.pronouns,
      personalUrl: person.personalUrl,
      birthDate: person.birthDate,
      deathDate: person.deathDate,
      birthPlace: person.birthPlace,
      deathPlace: person.deathPlace,
      photoFileId: person.photoFileId,
      creditCounts,
      roleLabels: await people.roleLabelsForPerson(personId),
    },
    providerSources,
    fields,
    links,
    linkCandidates,
    identifiers,
    identifierCandidates,
    providers,
  };
}
