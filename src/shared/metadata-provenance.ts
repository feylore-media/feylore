import type { MetadataSourceCategory } from "./metadata-source-category.js";

export type {
  MetadataSourceCategory,
  FEYLORE_SOURCE_KEY,
} from "./metadata-source-category.js";

export type MetadataProvenanceOrigin =
  | "ingest"
  | "merge"
  | "adopt"
  | "edit";

export interface FieldProvenance {
  sourceKey: string;
  sourceCategory: MetadataSourceCategory;
  origin: MetadataProvenanceOrigin;
  updatedAt: string;
  updatedByUserId?: string;
}

export type ImportSourceAvailability =
  | "available"
  | "unavailable"
  | "stale"
  | "empty";
