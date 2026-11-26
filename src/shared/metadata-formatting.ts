import { z } from "zod";

export const VOCABULARY_KINDS = ["genre", "tag"] as const;
export type VocabularyKind = (typeof VOCABULARY_KINDS)[number];

export const SUGGESTION_STATUSES = ["open", "resolved", "ignored"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SUGGESTION_TYPES = [
  "similar_name",
  "suggest_alias",
  "placement",
] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];

export const SUGGESTION_RESOLVE_ACTIONS = [
  "accept_alias",
  "assign_existing_term",
  "ignore",
] as const;
export type SuggestionResolveAction = (typeof SUGGESTION_RESOLVE_ACTIONS)[number];

export const LANGUAGE_REPRESENTATIONS = ["simple", "locale"] as const;
export type LanguageRepresentation = (typeof LANGUAGE_REPRESENTATIONS)[number];

export const MAX_VOCABULARY_DEPTH = 3;

export const GENRE_MEDIA_TYPES = [
  "books",
  "audiobooks",
  "movies",
  "tv",
  "music",
  "podcasts",
  "ttrpg",
] as const;
export type GenreMediaType = (typeof GENRE_MEDIA_TYPES)[number];

export const metadataFormattingSettingsSchema = z.object({
  languageRepresentation: z.enum(LANGUAGE_REPRESENTATIONS).default("simple"),
});

export type MetadataFormattingSettings = z.infer<
  typeof metadataFormattingSettingsSchema
>;

export const createVocabularyTermSchema = z.object({
  kind: z.enum(VOCABULARY_KINDS),
  name: z.string().trim().min(1).max(200),
  parentId: z.string().uuid().nullable().optional(),
  mediaTypes: z.array(z.enum(GENRE_MEDIA_TYPES)).default([]),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().nullable().optional(),
});

export const updateVocabularyTermSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  parentId: z.string().uuid().nullable().optional(),
  mediaTypes: z.array(z.enum(GENRE_MEDIA_TYPES)).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().nullable().optional(),
});

export const setVocabularyAliasesSchema = z.object({
  aliases: z.array(z.string().trim().min(1).max(200)),
});

export const resolveSuggestionSchema = z.object({
  action: z.enum(SUGGESTION_RESOLVE_ACTIONS),
  termId: z.string().uuid().optional(),
});

export interface CanonicalLanguage {
  language: string;
  region?: string;
}

export interface VocabularyTermDto {
  id: string;
  kind: VocabularyKind;
  name: string;
  parentId: string | null;
  slug: string;
  aliases: string[];
  mediaTypes: GenreMediaType[];
  enabled: boolean;
  sortOrder: number | null;
  usageCount: number;
  children: VocabularyTermDto[];
}

export interface VocabularySearchMatchDto {
  term: {
    id: string;
    kind: VocabularyKind;
    name: string;
    parentId: string | null;
    slug: string;
    aliases: string[];
    mediaTypes: GenreMediaType[];
    enabled: boolean;
    sortOrder: number | null;
    usageCount: number;
  };
  ancestorIds: string[];
  matchedVia: "name" | "alias";
  matchedValue: string;
}

export interface FormattingSuggestionDto {
  id: string;
  kind: VocabularyKind;
  rawValue: string;
  normalizedValue: string;
  status: SuggestionStatus;
  suggestedTermId: string | null;
  suggestedTermName: string | null;
  suggestionType: SuggestionType;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export interface SimilarTermDto {
  termId: string;
  name: string;
  score: number;
}

export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeVocabularyKey(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

export function vocabularySlug(value: string): string {
  return collapseWhitespace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const LANGUAGE_NAME_ALIASES: Record<string, string> = {
  eng: "en",
  english: "en",
  jpn: "ja",
  japanese: "ja",
  fre: "fr",
  fra: "fr",
  french: "fr",
  ger: "de",
  deu: "de",
  german: "de",
  spa: "es",
  spanish: "es",
};

export function parseLanguageInput(raw: string | undefined): CanonicalLanguage | undefined {
  if (!raw) return undefined;
  const trimmed = collapseWhitespace(raw);
  if (!trimmed) return undefined;

  const lowered = trimmed.toLowerCase();
  if (LANGUAGE_NAME_ALIASES[lowered]) {
    return { language: LANGUAGE_NAME_ALIASES[lowered] };
  }

  const normalized = trimmed.replace(/_/g, "-");
  try {
    const locale = new Intl.Locale(normalized);
    const language = locale.language?.toLowerCase();
    if (!language) return undefined;
    const region = locale.region?.toUpperCase();
    return region ? { language, region } : { language };
  } catch {
    if (/^[a-z]{2,3}$/i.test(trimmed)) {
      return { language: trimmed.toLowerCase() };
    }
    return undefined;
  }
}

export function formatLanguageCanonical(canonical: CanonicalLanguage): string {
  return canonical.region
    ? `${canonical.language}-${canonical.region}`
    : canonical.language;
}

export function formatLanguage(
  canonical: CanonicalLanguage,
  representation: LanguageRepresentation,
): string {
  if (representation === "locale") {
    return formatLanguageCanonical(canonical);
  }
  try {
    const display = new Intl.DisplayNames("en", { type: "language" });
    return display.of(canonical.language) ?? formatLanguageCanonical(canonical);
  } catch {
    return formatLanguageCanonical(canonical);
  }
}

export function resolveLanguage(
  raw: string | undefined,
  representation: LanguageRepresentation,
): string | undefined {
  const canonical = parseLanguageInput(raw);
  if (!canonical) return raw ? collapseWhitespace(raw) : undefined;
  return formatLanguage(canonical, representation);
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[b.length]![a.length]!;
}

export function scoreTermSimilarity(query: string, candidate: string): number {
  const q = normalizeVocabularyKey(query);
  const c = normalizeVocabularyKey(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.startsWith(q) || q.startsWith(c)) return 80;
  if (c.includes(q) || q.includes(c)) return 60;
  const maxLen = Math.max(q.length, c.length);
  if (maxLen === 0) return 0;
  const distance = levenshteinDistance(q, c);
  const similarity = 1 - distance / maxLen;
  return Math.max(0, Math.round(similarity * 50));
}
