import { z } from "zod";
import { CANONICAL_FIELD_IDS } from "./metadata-fields.js";
import {
  MEDIA_MODULE_IDS,
  type MediaModuleId,
} from "./media-modules.js";

export {
  createCustomFieldSchema,
  updateCustomFieldSchema,
  reorderCustomFieldsSchema,
  setCustomFieldValuesSchema,
} from "./custom-metadata-fields.js";

/** API / internal value; UI label for `neither` is "Feylore only". */
export const METADATA_PERSISTENCE_VALUES = [
  "write_to_file",
  "write_to_sidecar",
  "neither",
] as const;

export type MetadataPersistence = (typeof METADATA_PERSISTENCE_VALUES)[number];

export const metadataPersistenceSchema = z.enum(METADATA_PERSISTENCE_VALUES);

export function isMetadataPersistence(value: unknown): value is MetadataPersistence {
  return (
    typeof value === "string" &&
    (METADATA_PERSISTENCE_VALUES as readonly string[]).includes(value)
  );
}

export const DEFAULT_METADATA_PERSISTENCE: Record<
  MediaModuleId,
  MetadataPersistence
> = Object.fromEntries(
  MEDIA_MODULE_IDS.map((id) => [id, "neither" as const]),
) as Record<MediaModuleId, MetadataPersistence>;

export const updateMetadataPersistenceSchema = z.object({
  persistence: metadataPersistenceSchema,
});

export const metadataMatchingRulesSchema = z.object({
  preferIsbnMatching: z.boolean().default(true),
  fillMissingFromLowerPriority: z.boolean().default(true),
  preferExactEditionMatch: z.boolean().default(true),
});

export type MetadataMatchingRules = z.infer<typeof metadataMatchingRulesSchema>;

export const updateFieldPrioritiesSchema = z.object({
  priorities: z.array(
    z.object({
      fieldId: z.enum(CANONICAL_FIELD_IDS),
      providerSourceOrder: z.array(z.string()),
    }),
  ),
});

export const updateMatchingRulesSchema = metadataMatchingRulesSchema.partial();

export const providerConfigPatchSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export const providerConfigTestSchema = z.object({
  config: z.record(z.unknown()).optional(),
});

export type SourceAvailabilityStatus =
  | "available"
  | "configured"
  | "configuration_required"
  | "not_implemented"
  | "connection_error";

export type ConnectionStatus = "connected" | "disconnected" | "unknown" | "error";
