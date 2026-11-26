import type {
  MetadataProvider,
  MetadataProviderRegistration,
  MetadataSourceDescriptor,
} from "../../../shared/metadata-contract/index.js";
import type { MediaModuleId } from "../../../shared/media-modules.js";

export class MetadataProviderRegistry {
  private providers = new Map<string, MetadataProviderRegistration>();

  register(registration: MetadataProviderRegistration) {
    this.providers.set(registration.key, registration);
  }

  get(key: string): MetadataProvider | undefined {
    return this.providers.get(key)?.provider;
  }

  getDescriptor(id: string): MetadataSourceDescriptor | undefined {
    return this.providers.get(id)?.provider.descriptor;
  }

  listDescriptors(mediaModule?: MediaModuleId): MetadataSourceDescriptor[] {
    const all = [...this.providers.values()].map((r) => r.provider.descriptor);
    if (!mediaModule) return all;
    return all.filter((d) => d.mediaModules.includes(mediaModule));
  }

  list(): Array<{ key: string; contractVersion: string }> {
    return [...this.providers.values()].map((r) => ({
      key: r.key,
      contractVersion: r.contractVersion,
    }));
  }

  async fetchFromEnabled(
    enabledKeys: string[],
    context: Parameters<MetadataProvider["fetch"]>[0],
    configs: Map<string, Record<string, unknown>> = new Map(),
  ) {
    const results = [];
    for (const key of enabledKeys) {
      const provider = this.get(key);
      if (!provider) continue;
      if (provider.descriptor.implemented === false) continue;
      const config = configs.get(key);
      const result = await provider.fetch(context, config);
      if (result) results.push({ providerKey: key, ...result });
    }
    return results;
  }
}
