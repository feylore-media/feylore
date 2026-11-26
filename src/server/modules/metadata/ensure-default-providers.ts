import { METADATA_PROVIDER_CONTRACT } from "../../../shared/metadata-contract/index.js";
import { getMetadataSourceCategory } from "../../../shared/metadata-source-category.js";
import type { MetadataProviderRegistry } from "./registry.js";
import type { MetadataService } from "./service.js";

/** Ensure config-free providers have a DB row and are enabled by default. */
export async function ensureDefaultMetadataProviders(
  metadata: MetadataService,
  registry: MetadataProviderRegistry,
): Promise<void> {
  for (const descriptor of registry.listDescriptors()) {
    if (descriptor.implemented === false) continue;
    if (getMetadataSourceCategory(descriptor) !== "provider") continue;

    const requiresConfig = descriptor.configSchema?.some((field) => field.required);
    if (requiresConfig) continue;

    const existing = await metadata.getProviderRow(descriptor.id);
    if (existing) continue;

    await metadata.upsertProvider({
      key: descriptor.id,
      contractVersion: METADATA_PROVIDER_CONTRACT,
      enabled: true,
    });
  }
}
