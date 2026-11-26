import { FEYLORE_SOURCE_KEY } from "@shared/metadata-source-category";
import type { FieldProvenance } from "@shared/metadata-provenance";

export function buildSourceLabelMap(
  sources: Array<{ key: string; label: string }>,
): Map<string, string> {
  return new Map(sources.map((s) => [s.key, s.label]));
}

export function provenanceDisplayLabel(
  provenance: FieldProvenance | null | undefined,
  sourceLabels: Map<string, string>,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!provenance) return null;
  if (
    provenance.sourceCategory === "canonical" ||
    provenance.sourceKey === FEYLORE_SOURCE_KEY
  ) {
    return t("metadataProvenanceEditedInFeylore");
  }
  const label = sourceLabels.get(provenance.sourceKey) ?? provenance.sourceKey;
  return t("metadataProvenanceFromSource", { source: label });
}

export function provenanceDisplayLabelFromField(
  provenance: BookMetadataProvenance | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!provenance) return null;
  if (provenance.sourceCategory === "canonical") {
    return t("metadataProvenanceEditedInFeylore");
  }
  const label = provenance.sourceLabel ?? provenance.sourceKey;
  return t("metadataProvenanceFromSource", { source: label });
}

interface BookMetadataProvenance {
  sourceKey: string;
  sourceCategory: string;
  sourceLabel?: string;
}
