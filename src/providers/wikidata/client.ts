import { outboundFetchJson } from "../../server/modules/metadata/outbound-fetch.js";
import type {
  WikidataEntity,
  WikidataEntityResponse,
  WikidataSearchItem,
  WikidataSearchResponse,
} from "./types.js";

const API_BASE = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "Feylore/1.0";
const LANGUAGES = "en";
const MAX_ENTITY_BATCH = 50;

const fetchOptions = {
  headers: { "User-Agent": USER_AGENT },
  timeoutMs: 15_000,
  maxBytes: 2 * 1024 * 1024,
};

export function wikidataEntityUrl(ids: string[]): string {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.slice(0, MAX_ENTITY_BATCH).join("|"),
    props: "claims|labels|descriptions|aliases|sitelinks",
    languages: LANGUAGES,
    format: "json",
  });
  return `${API_BASE}?${params.toString()}`;
}

export async function fetchWikidataEntities(
  ids: string[],
): Promise<Record<string, WikidataEntity>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return {};
  try {
    const data = await outboundFetchJson<WikidataEntityResponse>(
      wikidataEntityUrl(unique),
      fetchOptions,
    );
    return data.entities ?? {};
  } catch {
    return {};
  }
}

export async function searchWikidataItems(
  name: string,
  limit = 5,
): Promise<WikidataSearchItem[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: name,
    language: LANGUAGES,
    uselang: LANGUAGES,
    type: "item",
    limit: String(limit),
    format: "json",
  });
  try {
    const data = await outboundFetchJson<WikidataSearchResponse>(
      `${API_BASE}?${params.toString()}`,
      fetchOptions,
    );
    return data.search ?? [];
  } catch {
    return [];
  }
}