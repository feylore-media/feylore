import type { EditionFormatPreference } from "../../shared/metadata-edition-preference.js";
import type { OpenLibraryEdition, OpenLibrarySearchEdition } from "./types.js";

export type EditionFormatKind = "audiobook" | "ebook" | "print" | "unknown";

export interface EditionCandidate {
  key?: string;
  title?: string;
  physical_format?: string;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  isbn?: string[];
  cover_i?: number;
  language?: string[];
}

const AUDIOBOOK_FORMAT_RE =
  /\b(audiobook|audio\s*book|eaudiobook|e-audiobook|audio\s*cd|mp3|audible)\b/i;
const EBOOK_FORMAT_RE =
  /\b(ebook|e-book|kindle|epub|digital|nook)\b/i;
const PRINT_FORMAT_RE =
  /\b(hardcover|paperback|mass\s*market|trade\s*paperback|board\s*book|cloth)\b/i;

function normalizeFormatText(
  edition: EditionCandidate,
): string {
  const parts = [
    edition.physical_format,
    ...(edition.publishers ?? []),
    edition.title,
  ];
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

export function classifyEditionFormat(
  edition: EditionCandidate,
): EditionFormatKind {
  const text = normalizeFormatText(edition);
  if (!text) return "unknown";
  if (AUDIOBOOK_FORMAT_RE.test(text)) return "audiobook";
  if (EBOOK_FORMAT_RE.test(text)) return "ebook";
  if (PRINT_FORMAT_RE.test(text)) return "print";
  return "unknown";
}

function preferenceScore(
  kind: EditionFormatKind,
  preference: EditionFormatPreference,
): number {
  switch (preference) {
    case "audiobook":
      if (kind === "audiobook") return 100;
      return 0;
    case "ebook":
      if (kind === "ebook") return 100;
      if (kind === "unknown") return 40;
      return 0;
    case "print":
      if (kind === "print") return 100;
      if (kind === "unknown") return 40;
      return 0;
    case "print-or-ebook":
      if (kind === "audiobook") return 0;
      if (kind === "print" || kind === "ebook") return 100;
      return 50;
    default:
      return 0;
  }
}

export interface EditionSelectionOptions {
  fileFormat?: string;
  language?: string;
}

export function inferEditionBiasFromFileFormat(
  format: string | undefined,
): EditionFormatKind | undefined {
  if (!format) return undefined;
  const normalized = format.toLowerCase();
  if (["epub", "mobi", "azw3", "azw"].includes(normalized)) return "ebook";
  if (["pdf", "cbz", "cbr"].includes(normalized)) return "print";
  return undefined;
}

function normalizeLanguageCode(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutPrefix = trimmed.replace(/^\/languages\//, "");
  if (withoutPrefix === "eng") return "en";
  return withoutPrefix.slice(0, 3);
}

function languageMatchScore(
  edition: EditionCandidate,
  preferredLanguage: string | undefined,
): number {
  if (!preferredLanguage) return 0;
  const target = normalizeLanguageCode(preferredLanguage);
  if (!target) return 0;
  for (const lang of edition.language ?? []) {
    const candidate = normalizeLanguageCode(lang);
    if (candidate === target || candidate.startsWith(target)) return 8;
  }
  return 0;
}

function fileFormatBiasScore(
  kind: EditionFormatKind,
  preference: EditionFormatPreference,
  fileFormat: string | undefined,
): number {
  const bias = inferEditionBiasFromFileFormat(fileFormat);
  if (!bias || preference !== "print-or-ebook") return 0;
  if (kind === bias) return 12;
  if (kind === "unknown") return 4;
  return 0;
}

function editionRichnessScore(edition: EditionCandidate): number {
  let score = 0;
  if (edition.isbn?.length) score += 4;
  if (edition.number_of_pages) score += 2;
  if (edition.publish_date) score += 2;
  if (edition.cover_i) score += 1;
  if (edition.physical_format) score += 1;
  return score;
}

export function selectBestEditionCandidate<T extends EditionCandidate>(
  candidates: T[],
  preference: EditionFormatPreference,
  options?: EditionSelectionOptions,
): T | undefined {
  if (!candidates.length) return undefined;

  let best: T | undefined;
  let bestScore = -1;
  let bestRichness = -1;

  for (const candidate of candidates) {
    const kind = classifyEditionFormat(candidate);
    const score =
      preferenceScore(kind, preference) +
      fileFormatBiasScore(kind, preference, options?.fileFormat) +
      languageMatchScore(candidate, options?.language);
    if (score <= 0) continue;

    const richness = editionRichnessScore(candidate);
    if (score > bestScore || (score === bestScore && richness > bestRichness)) {
      best = candidate;
      bestScore = score;
      bestRichness = richness;
    }
  }

  return best;
}

export function editionMatchesPreference(
  edition: EditionCandidate,
  preference: EditionFormatPreference,
): boolean {
  return preferenceScore(classifyEditionFormat(edition), preference) > 0;
}

export function toEditionCandidate(
  edition: OpenLibraryEdition | OpenLibrarySearchEdition,
): EditionCandidate {
  return {
    key: edition.key,
    title: edition.title,
    physical_format:
      "physical_format" in edition ? edition.physical_format : undefined,
    publishers: "publishers" in edition ? edition.publishers : undefined,
    publish_date: "publish_date" in edition ? edition.publish_date : undefined,
    number_of_pages: edition.number_of_pages,
    isbn: "isbn" in edition ? edition.isbn : undefined,
    cover_i: "cover_i" in edition ? edition.cover_i : undefined,
    language: "language" in edition ? edition.language : undefined,
  };
}
