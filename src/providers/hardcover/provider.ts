import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataFetchContext,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import {
  fetchHardcoverRecords,
  testHardcoverConnection,
} from "./client.js";
import { hardcoverDescriptor } from "./descriptor.js";
import { parseHardcoverRecords } from "./parser.js";
import { buildSearchPlan } from "./search-strategy.js";

export const hardcoverProvider: MetadataProvider = {
  key: hardcoverDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: hardcoverDescriptor,
  async fetch(context: MetadataFetchContext, config?: Record<string, unknown>) {
    const apiKey = config?.apiKey;
    if (typeof apiKey !== "string" || !apiKey) return null;

    const plan = buildSearchPlan(context.hints, context.matchingRules);
    if (!plan) return null;

    const records = await fetchHardcoverRecords(plan, apiKey);
    if (!records) return null;

    return parseHardcoverRecords(records, context.hints);
  },
  async testConnection(config: Record<string, unknown>) {
    const apiKey = config.apiKey;
    if (typeof apiKey !== "string" || !apiKey) {
      return { ok: false, message: "API key is required" };
    }
    return testHardcoverConnection(apiKey);
  },
};
