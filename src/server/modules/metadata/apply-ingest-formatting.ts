import type { MetadataFormattingService } from "./formatting.js";

export async function applyIngestFormatting(
  formatting: MetadataFormattingService,
  merged: {
    genres?: string[];
    tags?: string[];
    language?: string;
  },
  overriddenFields: Set<string>,
  context?: Record<string, unknown>,
): Promise<void> {
  const { languageRepresentation } = await formatting.getSettings();

  if (merged.genres && !overriddenFields.has("genres")) {
    merged.genres = await formatting.resolveGenres(merged.genres, context);
  }
  if (merged.tags && !overriddenFields.has("tags")) {
    merged.tags = await formatting.resolveTags(merged.tags, context);
  }
  if (merged.language && !overriddenFields.has("language")) {
    merged.language =
      formatting.resolveLanguageValue(merged.language, languageRepresentation) ??
      merged.language;
  }
}
