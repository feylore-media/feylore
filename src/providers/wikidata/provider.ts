import {
  METADATA_PROVIDER_CONTRACT,
  type MetadataFetchContext,
  type MetadataProvider,
} from "../../shared/metadata-contract/index.js";
import {
  fetchWikidataEntities,
  searchWikidataItems,
} from "./client.js";
import { wikidataDescriptor } from "./descriptor.js";
import {
  englishLabelOf,
  parseWikidataPerson,
  referencedQids,
} from "./parser.js";
import type { WikidataEntity, WikidataSearchItem } from "./types.js";

function qidFromHints(hints: Record<string, unknown> | undefined): string | undefined {
  if (typeof hints?.qid === "string") return hints.qid.trim();
  if (typeof hints?.wikidataId === "string") return hints.wikidataId.trim();
  return undefined;
}

function nameFromHints(hints: Record<string, unknown> | undefined): string | undefined {
  if (typeof hints?.name === "string") return hints.name.trim();
  if (typeof hints?.authorName === "string") return hints.authorName.trim();
  return undefined;
}

function selectBestSearchResult(results: WikidataSearchItem[]): WikidataSearchItem | undefined {
  if (results.length === 0) return undefined;
  return (
    results.find((item) => item.description?.toLowerCase().includes("human")) ??
    results[0]
  );
}

export const wikidataProvider: MetadataProvider = {
  key: wikidataDescriptor.id,
  contractVersion: METADATA_PROVIDER_CONTRACT,
  descriptor: wikidataDescriptor,
  async fetch(context: MetadataFetchContext) {
    const hints = context.hints ?? {};
    const qid = qidFromHints(hints);
    let entity: WikidataEntity | undefined;

    if (qid) {
      const entities = await fetchWikidataEntities([qid]);
      entity = entities[qid];
    }

    if (!entity) {
      const name = nameFromHints(hints);
      if (!name) return null;
      const results = await searchWikidataItems(name);
      const best = selectBestSearchResult(results);
      if (!best) return null;
      const entities = await fetchWikidataEntities([best.id]);
      entity = entities[best.id];
    }

    if (!entity) return null;

    const labelMap: Record<string, string> = {};
    const referenced = referencedQids(entity);
    if (referenced.length > 0) {
      const referencedEntities = await fetchWikidataEntities(referenced);
      for (const [id, referencedEntity] of Object.entries(referencedEntities)) {
        const label = englishLabelOf(referencedEntity);
        if (label) labelMap[id] = label;
      }
    }

    const parsed = parseWikidataPerson(entity, labelMap);
    if (!parsed || Object.keys(parsed.payload).length === 0) return null;
    return parsed;
  },
  async testConnection() {
    await searchWikidataItems("Ada Lovelace", 1);
    return { ok: true, message: "Connected" };
  },
};