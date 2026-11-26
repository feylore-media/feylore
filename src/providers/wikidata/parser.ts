import type { WikidataEntity, WikidataStatement } from "./types.js";
import type { PersonLinkKind } from "../../shared/people.js";

export interface ParsedWikidataPerson {
  externalId: string;
  payload: Record<string, unknown>;
}

export interface WikidataLinkCandidate {
  kind: PersonLinkKind;
  label: string;
  url: string;
}

export interface WikidataIdentifierCandidate {
  provider: string;
  identifier: string;
}

const COMMONS_FILE_PATH_BASE = "https://commons.wikimedia.org/wiki/Special:FilePath/";

export function englishLabelOf(entity: WikidataEntity): string | null {
  const label = entity.labels?.en?.value;
  if (label) return label;
  const first = Object.values(entity.labels ?? {})[0];
  return first?.value ?? null;
}

export function commonsFilePathUrl(filename: string, width = 400): string {
  return `${COMMONS_FILE_PATH_BASE}${encodeURIComponent(filename)}?width=${width}`;
}

function preferredClaim(
  entity: WikidataEntity,
  property: string,
): WikidataStatement | undefined {
  const statements = entity.claims?.[property];
  if (!statements || statements.length === 0) return undefined;
  const usable = statements.filter(
    (st) =>
      st.rank !== "deprecated" &&
      st.mainsnak?.snaktype === "value" &&
      st.mainsnak?.datavalue?.value !== undefined,
  );
  if (usable.length === 0) return undefined;
  return usable.find((st) => st.rank === "preferred") ?? usable[0];
}

function claimTextValue(
  entity: WikidataEntity,
  property: string,
  labelMap?: Record<string, string>,
): string | undefined {
  const claim = preferredClaim(entity, property);
  const value = claim?.mainsnak?.datavalue?.value;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && value.id) {
    return labelMap?.[value.id] ?? value.id;
  }
  return undefined;
}

function claimQid(
  entity: WikidataEntity,
  property: string,
): string | undefined {
  const claim = preferredClaim(entity, property);
  const value = claim?.mainsnak?.datavalue?.value;
  if (value && typeof value === "object" && "id" in value && value.id) {
    return value.id;
  }
  return undefined;
}

function claimDate(
  entity: WikidataEntity,
  property: string,
): string | undefined {
  const claim = preferredClaim(entity, property);
  const value = claim?.mainsnak?.datavalue?.value;
  if (!value || typeof value !== "object" || !("time" in value)) {
    return undefined;
  }
  const match = /^\+(\d{4})-(\d{2})-(\d{2})T/.exec(value.time ?? "");
  if (!match) return undefined;
  const [, year, month, day] = match;
  const precision = value.precision ?? 11;
  if (precision >= 11) return `${year}-${month}-${day}`;
  if (precision === 10) return `${year}-${month}`;
  if (precision === 9) return year;
  return undefined;
}

function listLabels(
  entity: WikidataEntity,
  property: string,
  labelMap: Record<string, string>,
): string[] {
  return (entity.claims?.[property] ?? [])
    .map((st) => {
      const value = st.mainsnak?.datavalue?.value;
      if (
        st.rank === "deprecated" ||
        st.mainsnak?.snaktype !== "value" ||
        !value ||
        typeof value !== "object" ||
        !("id" in value) ||
        !value.id
      ) {
        return undefined;
      }
      return labelMap[value.id] ?? value.id;
    })
    .filter((label): label is string => Boolean(label));
}

export function referencedQids(entity: WikidataEntity): string[] {
  const qids: string[] = [];
  for (const property of ["P19", "P20", "P106", "P27"]) {
    const qid = claimQid(entity, property);
    if (qid) qids.push(qid);
  }
  return qids;
}

function safeSegment(value: string): string | null {
  const trimmed = value.trim();
  return trimmed && !/[/?#\\\s]/.test(trimmed) ? encodeURIComponent(trimmed) : null;
}

function wikipediaUrl(entity: WikidataEntity): string | null {
  const title = entity.sitelinks?.enwiki?.title;
  return title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}` : null;
}

export function wikidataLinkCandidates(entity: WikidataEntity): WikidataLinkCandidate[] {
  const links: WikidataLinkCandidate[] = [];
  const wikipedia = wikipediaUrl(entity);
  if (wikipedia) links.push({ kind: "wikipedia", label: "Wikipedia", url: wikipedia });
  const mapped: Array<[string, PersonLinkKind, string, string]> = [
    ["P345", "imdb", "IMDb", "https://www.imdb.com/name/"],
    ["P434", "musicbrainz", "MusicBrainz", "https://musicbrainz.org/artist/"],
    ["P648", "openlibrary", "Open Library", "https://openlibrary.org/authors/"],
    ["P2003", "instagram", "Instagram", "https://www.instagram.com/"],
    ["P12361", "bluesky", "Bluesky", "https://bsky.app/profile/"],
    ["P2013", "facebook", "Facebook", "https://www.facebook.com/"],
    ["P2002", "x", "X", "https://x.com/"],
  ];
  for (const [property, kind, label, base] of mapped) {
    const raw = claimTextValue(entity, property);
    const segment = raw && safeSegment(raw);
    if (segment) links.push({ kind, label, url: `${base}${segment}` });
  }
  return links;
}

export function wikidataIdentifierCandidates(entity: WikidataEntity): WikidataIdentifierCandidate[] {
  const identifiers: WikidataIdentifierCandidate[] = [
    { provider: "wikidata", identifier: entity.id },
  ];
  for (const [property, provider] of [
    ["P345", "imdb"],
    ["P434", "musicbrainz"],
    ["P648", "openlibrary"],
  ]) {
    const identifier = claimTextValue(entity, property);
    if (identifier) identifiers.push({ provider, identifier });
  }
  return identifiers;
}

export function parseWikidataPerson(
  entity: WikidataEntity,
  labelMap: Record<string, string> = {},
): ParsedWikidataPerson | null {
  if (!entity?.claims) return null;
  const name = englishLabelOf(entity);
  if (!name) return null;

  const payload: Record<string, unknown> = {
    name,
    wikidataQid: entity.id,
  };

  const alternates = Object.values(entity.aliases ?? {})
    .flat()
    .map((alias) => alias.value)
    .filter((value, index, all) => all.indexOf(value) === index);
  if (alternates.length > 0) payload.alternateNames = alternates;

  const description = entity.descriptions?.en?.value;
  if (description) payload.shortDescription = description;

  const birthDate = claimDate(entity, "P569");
  if (birthDate) payload.birthDate = birthDate;

  const deathDate = claimDate(entity, "P570");
  if (deathDate) payload.deathDate = deathDate;

  const birthPlace = claimTextValue(entity, "P19", labelMap);
  if (birthPlace) payload.birthPlace = birthPlace;

  const deathPlace = claimTextValue(entity, "P20", labelMap);
  if (deathPlace) payload.deathPlace = deathPlace;

  const image = claimTextValue(entity, "P18");
  if (image) payload.photo = commonsFilePathUrl(image);

  const website = claimTextValue(entity, "P856");
  if (website) payload.personalUrl = website;

  const nationality = listLabels(entity, "P27", labelMap);
  if (nationality.length > 0) payload.nationality = nationality;

  const occupations = listLabels(entity, "P106", labelMap);
  if (occupations.length > 0) payload.occupations = occupations;

  payload.links = wikidataLinkCandidates(entity);
  payload.identifiers = wikidataIdentifierCandidates(entity);

  return { externalId: entity.id, payload };
}
