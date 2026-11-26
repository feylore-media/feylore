import { outboundFetchJson } from "../../server/modules/metadata/outbound-fetch.js";
import type { EditionFormatPreference } from "../../shared/metadata-edition-preference.js";
import {
  classifyEditionFormat,
  editionMatchesPreference,
  selectBestEditionCandidate,
  toEditionCandidate,
  type EditionFormatKind,
  type EditionSelectionOptions,
} from "./edition-resolution.js";
import type { OpenLibrarySearchPlan } from "./search-strategy.js";
import type {
  OpenLibraryAuthor,
  OpenLibraryEdition,
  OpenLibraryRecords,
  OpenLibrarySearchEdition,
  OpenLibrarySearchResponse,
  OpenLibraryWork,
  OpenLibraryWorkEditionsResponse,
} from "./types.js";

const USER_AGENT = "Feylore/1.0";
const API_BASE = "https://openlibrary.org";
const MAX_WORK_EDITIONS = 50;

const SEARCH_FIELDS = [
  "key",
  "title",
  "subtitle",
  "author_name",
  "first_publish_year",
  "subject",
  "series",
  "publisher",
  "publish_date",
  "publish_year",
  "isbn",
  "cover_i",
  "first_sentence",
  "language",
  "editions",
  "editions.key",
  "editions.title",
  "editions.subtitle",
  "editions.isbn",
  "editions.cover_i",
  "editions.language",
  "editions.number_of_pages",
  "editions.physical_format",
  "editions.publishers",
  "editions.publish_date",
].join(",");

const fetchOptions = {
  headers: { "User-Agent": USER_AGENT },
};

function olPath(key: string): string {
  const path = key.startsWith("/") ? key : `/${key}`;
  return `${API_BASE}${path}.json`;
}

async function fetchEditionByIsbn(isbn: string): Promise<OpenLibraryEdition | null> {
  try {
    return await outboundFetchJson<OpenLibraryEdition>(
      `${API_BASE}/isbn/${encodeURIComponent(isbn)}.json`,
      fetchOptions,
    );
  } catch {
    return null;
  }
}

async function fetchEditionByKey(key: string): Promise<OpenLibraryEdition | null> {
  try {
    return await outboundFetchJson<OpenLibraryEdition>(olPath(key), fetchOptions);
  } catch {
    return null;
  }
}

async function fetchWork(key: string): Promise<OpenLibraryWork | null> {
  try {
    return await outboundFetchJson<OpenLibraryWork>(olPath(key), fetchOptions);
  } catch {
    return null;
  }
}

async function fetchWorkEditionSummaries(
  workKey: string,
): Promise<OpenLibrarySearchEdition[]> {
  try {
    const path = workKey.startsWith("/") ? workKey : `/${workKey}`;
    const data = await outboundFetchJson<OpenLibraryWorkEditionsResponse>(
      `${API_BASE}${path}/editions.json?limit=${MAX_WORK_EDITIONS}`,
      fetchOptions,
    );
    return (data.entries ?? []).map((entry) => ({
      key: entry.key,
      title: entry.title,
      subtitle: entry.subtitle,
      isbn: entry.isbn_13 ?? entry.isbn_10,
      cover_i: entry.covers?.[0],
      language: entry.languages?.map((lang) =>
        lang.key?.replace(/^\/languages\//, "") ?? "",
      ),
      number_of_pages: entry.number_of_pages,
      physical_format: entry.physical_format,
      publishers: entry.publishers,
      publish_date: entry.publish_date,
    }));
  } catch {
    return [];
  }
}

async function searchOpenLibrary(
  query: string,
): Promise<OpenLibrarySearchResponse["docs"]> {
  const url =
    `${API_BASE}/search.json?q=${encodeURIComponent(query)}` +
    `&limit=1&fields=${encodeURIComponent(SEARCH_FIELDS)}`;
  const data = await outboundFetchJson<OpenLibrarySearchResponse>(url, fetchOptions);
  return data.docs ?? [];
}

async function resolveAuthorNames(
  edition: OpenLibraryEdition | undefined,
  work: OpenLibraryWork | undefined,
): Promise<string[] | undefined> {
  const names: string[] = [];

  const addName = (name: string | undefined) => {
    const trimmed = name?.trim();
    if (trimmed && !names.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      names.push(trimmed);
    }
  };

  for (const role of work?.authors ?? []) {
    addName(role.author?.name);
  }

  for (const author of edition?.authors ?? []) {
    if (author.name) {
      addName(author.name);
      continue;
    }
    if (!author.key) continue;
    try {
      const fetched = await outboundFetchJson<OpenLibraryAuthor>(
        olPath(author.key),
        fetchOptions,
      );
      addName(fetched.name);
    } catch {
      // omit unresolvable author
    }
  }

  return names.length ? names : undefined;
}

function collectEditionCandidates(
  searchEditions: OpenLibrarySearchEdition[] | undefined,
  workEditions: OpenLibrarySearchEdition[],
  fallbackEdition?: OpenLibraryEdition,
): OpenLibrarySearchEdition[] {
  const byKey = new Map<string, OpenLibrarySearchEdition>();

  const add = (candidate: OpenLibrarySearchEdition | OpenLibraryEdition) => {
    const mapped = toEditionCandidate(candidate);
    if (!mapped.key) return;
    byKey.set(mapped.key, {
      key: mapped.key,
      title: mapped.title,
      subtitle: "subtitle" in candidate ? candidate.subtitle : undefined,
      isbn: mapped.isbn,
      cover_i: mapped.cover_i,
      language: mapped.language,
      number_of_pages: mapped.number_of_pages,
      physical_format: mapped.physical_format,
      publishers: mapped.publishers,
      publish_date: mapped.publish_date,
    });
  };

  for (const edition of searchEditions ?? []) add(edition);
  for (const edition of workEditions) add(edition);
  if (fallbackEdition) add(fallbackEdition);

  return [...byKey.values()];
}

async function resolveEditionForWork(
  workKey: string | undefined,
  searchEditions: OpenLibrarySearchEdition[] | undefined,
  preference: EditionFormatPreference,
  fallbackEdition?: OpenLibraryEdition,
  selectionOptions?: EditionSelectionOptions,
): Promise<{
  edition?: OpenLibraryEdition;
  searchEdition?: OpenLibrarySearchEdition;
  resolvedEditionKind?: EditionFormatKind;
}> {
  const workEditions = workKey ? await fetchWorkEditionSummaries(workKey) : [];
  const candidates = collectEditionCandidates(
    searchEditions,
    workEditions,
    fallbackEdition,
  );

  const selectedSummary = selectBestEditionCandidate(
    candidates,
    preference,
    selectionOptions,
  );
  if (!selectedSummary?.key) {
    if (fallbackEdition && editionMatchesPreference(fallbackEdition, preference)) {
      return {
        edition: fallbackEdition,
        resolvedEditionKind: classifyEditionFormat(
          toEditionCandidate(fallbackEdition),
        ),
      };
    }
    return {
      resolvedEditionKind: fallbackEdition
        ? classifyEditionFormat(toEditionCandidate(fallbackEdition))
        : undefined,
    };
  }

  const edition =
    (selectedSummary.key
      ? await fetchEditionByKey(selectedSummary.key)
      : null) ??
    (fallbackEdition?.key === selectedSummary.key ? fallbackEdition : undefined);
  const resolvedEditionKind = classifyEditionFormat(
    toEditionCandidate(edition ?? selectedSummary),
  );

  return {
    edition: edition ?? undefined,
    searchEdition: selectedSummary,
    resolvedEditionKind,
  };
}

export async function fetchOpenLibraryRecords(
  plan: OpenLibrarySearchPlan,
  preference: EditionFormatPreference = "print-or-ebook",
  selectionOptions?: EditionSelectionOptions,
): Promise<OpenLibraryRecords | null> {
  if (plan.type === "isbn") {
    const isbnEdition = await fetchEditionByIsbn(plan.isbn);
    if (!isbnEdition) return null;

    const workKey = isbnEdition.works?.[0]?.key;
    const work = workKey ? await fetchWork(workKey) : null;

    const resolved = await resolveEditionForWork(
      workKey,
      undefined,
      preference,
      isbnEdition,
      selectionOptions,
    );

    const edition = resolved.edition;
    const authorNames = await resolveAuthorNames(edition, work ?? undefined);

    return {
      edition,
      work: work ?? undefined,
      searchEdition: resolved.searchEdition,
      authorNames,
      resolvedEditionKind: resolved.resolvedEditionKind,
    };
  }

  const q = plan.author ? `${plan.title} ${plan.author}` : plan.title;
  const docs = await searchOpenLibrary(q);
  const searchDoc = docs?.[0];
  if (!searchDoc) return null;

  const workKey = searchDoc.key;
  const work = workKey ? await fetchWork(workKey) : null;

  const resolved = await resolveEditionForWork(
    workKey,
    searchDoc.editions?.docs,
    preference,
    undefined,
    selectionOptions,
  );

  const edition = resolved.edition;
  const authorNames =
    searchDoc.author_name?.map((n) => n.trim()).filter(Boolean) ??
    (await resolveAuthorNames(edition, work ?? undefined));

  return {
    edition,
    work: work ?? undefined,
    searchDoc,
    searchEdition: resolved.searchEdition,
    authorNames: authorNames?.length ? authorNames : undefined,
    resolvedEditionKind: resolved.resolvedEditionKind,
  };
}

export async function testOpenLibraryConnection(): Promise<void> {
  await outboundFetchJson<{ numFound?: number }>(
    `${API_BASE}/search.json?q=test&limit=1`,
    fetchOptions,
  );
}
