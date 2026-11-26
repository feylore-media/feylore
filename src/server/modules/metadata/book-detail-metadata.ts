import { eq, and } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { MetadataService } from "./service.js";
import type { MetadataPolicyService } from "./policy.js";
import type { MetadataProvenanceService } from "./provenance.js";
import { mergeMetadataFields } from "./merge.js";
import {
  buildBookMetadataFields,
  type BookCanonicalReadContext,
} from "./book-canonical-values.js";

export async function resolveBookMetadataFields(
  db: Database,
  metadata: MetadataService,
  metadataPolicy: MetadataPolicyService,
  provenanceService: MetadataProvenanceService,
  bookId: string,
  book: BookCanonicalReadContext,
): Promise<ReturnType<typeof buildBookMetadataFields>> {
  const records = await db
    .select()
    .from(schema.metadataRecords)
    .where(
      and(
        eq(schema.metadataRecords.subjectType, "book"),
        eq(schema.metadataRecords.subjectId, bookId),
      ),
    );

  const sourcePayloads = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    sourcePayloads.set(record.providerKey, record.payload);
  }

  const overrides = await metadata.getOverrides("book", bookId);
  const overriddenFields = new Set(overrides.map((o) => o.field));
  const overrideMap: Record<string, unknown> = {};
  for (const o of overrides) {
    overrideMap[o.field] = o.value;
  }

  const fieldPolicies = await metadataPolicy.getFieldPriorities("books");
  const matchingRules = await metadataPolicy.getMatchingRules("books");
  const merged = mergeMetadataFields({
    fieldPolicies,
    sourcePayloads,
    overriddenFields,
    matchingRules,
  });

  const provenanceMap = await provenanceService.listProvenance("book", bookId);
  const providers = await metadata.listProvidersWithDescriptors("books");
  const sourceLabels = new Map(providers.map((p) => [p.key, p.name]));

  return buildBookMetadataFields({
    ctx: book,
    overrideMap,
    mergedValues: merged.values,
    provenanceMap,
    sourceLabels,
  });
}
