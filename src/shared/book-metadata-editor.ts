import type { MetadataSourceCategory } from "./metadata-source-category.js";
import type {
  FieldProvenance,
  ImportSourceAvailability,
} from "./metadata-provenance.js";

export interface MetadataEditorSourceColumn {
  key: string;
  label: string;
  category: MetadataSourceCategory;
  availability?: ImportSourceAvailability;
}

export interface MetadataEditorSourceCell {
  key: string;
  value: string | null;
  gap: boolean;
  availability?: ImportSourceAvailability;
  /** Cover artwork: file ID from Feylore storage */
  coverFileId?: string | null;
  /** Cover artwork: remote URL from provider payload */
  coverUrl?: string | null;
}

export interface MetadataEditorFieldRow {
  id: string;
  label: string;
  group: string;
  feyloreValue: string | null;
  isLocked: boolean;
  provenance: FieldProvenance | null;
  sources: MetadataEditorSourceCell[];
}

export type MetadataEditorProviderFieldKind = "text" | "number" | "rating";

export interface MetadataEditorProviderFieldRow {
  key: string;
  label: string;
  providerKey: string;
  providerLabel: string;
  kind: MetadataEditorProviderFieldKind;
  sources: MetadataEditorSourceCell[];
}

export interface BookMetadataEditorData {
  providerSources: MetadataEditorSourceColumn[];
  fields: MetadataEditorFieldRow[];
  providerSpecificFields: MetadataEditorProviderFieldRow[];
}

/** @deprecated Use providerSources */
export interface MetadataEditorProviderColumn {
  key: string;
  label: string;
}
