import type {
  MetadataSourceDescriptor,
  MetadataSourceType,
} from "./metadata-contract/index.js";

export type MetadataSourceCategory =
  | "provider"
  | "imported"
  | "canonical";

export const FEYLORE_SOURCE_KEY = "feylore" as const;

const IMPORTED_SOURCE_TYPES = new Set<MetadataSourceType>([
  "embedded",
  "parser",
  "local",
]);

const PROVIDER_SOURCE_TYPES = new Set<MetadataSourceType>([
  "api",
  "regional",
  "community",
]);

/** Classifies registered metadata sources only. Never returns "canonical". */
export function getMetadataSourceCategory(
  descriptor: Pick<MetadataSourceDescriptor, "sourceType" | "sourceCategory">,
): "provider" | "imported" {
  if (descriptor.sourceCategory) {
    return descriptor.sourceCategory;
  }
  if (IMPORTED_SOURCE_TYPES.has(descriptor.sourceType)) return "imported";
  if (PROVIDER_SOURCE_TYPES.has(descriptor.sourceType)) return "provider";
  return "imported";
}

/** Keys that are always treated as imported when category cannot be resolved from registry. */
const IMPORTED_KEY_PREFIXES = ["embedded.", "media.process"];

export function isImportedSourceKey(sourceKey: string): boolean {
  return IMPORTED_KEY_PREFIXES.some(
    (prefix) => sourceKey === prefix || sourceKey.startsWith(prefix),
  );
}

export function isProviderSourceKey(
  sourceKey: string,
  registryCategory?: "provider" | "imported",
): boolean {
  if (sourceKey === FEYLORE_SOURCE_KEY) return false;
  if (registryCategory) return registryCategory === "provider";
  return !isImportedSourceKey(sourceKey);
}

export function splitSourceOrderByCategory(
  sourceOrder: string[],
  getCategory: (key: string) => "provider" | "imported" | undefined,
): { providerSourceOrder: string[]; importSourceOrder: string[] } {
  const providerSourceOrder: string[] = [];
  const importSourceOrder: string[] = [];
  for (const key of sourceOrder) {
    const category = getCategory(key);
    if (category === "imported" || isImportedSourceKey(key)) {
      importSourceOrder.push(key);
    } else {
      providerSourceOrder.push(key);
    }
  }
  return { providerSourceOrder, importSourceOrder };
}

export function buildEffectiveSourceOrder(
  providerSourceOrder: string[],
  importSourceOrder: string[],
): string[] {
  return [...providerSourceOrder, ...importSourceOrder];
}
