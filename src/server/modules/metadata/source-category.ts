import {
  getMetadataSourceCategory,
  isImportedSourceKey,
} from "../../../shared/metadata-source-category.js";
import type { MetadataProviderRegistry } from "./registry.js";
import type { MetadataSourceCategory } from "../../../shared/metadata-source-category.js";
import { FEYLORE_SOURCE_KEY } from "../../../shared/metadata-source-category.js";

export function resolveSourceCategory(
  sourceKey: string,
  registry: MetadataProviderRegistry,
): MetadataSourceCategory {
  if (sourceKey === FEYLORE_SOURCE_KEY) return "canonical";
  const descriptor = registry.getDescriptor(sourceKey);
  if (descriptor) return getMetadataSourceCategory(descriptor);
  return isImportedSourceKey(sourceKey) ? "imported" : "provider";
}
