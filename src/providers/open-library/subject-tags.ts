import { isNumericSeriesToken, trimTrailingPunctuation } from "./utils.js";

export interface ParsedOpenLibrarySubjects {
  series?: string;
  seriesPosition?: number;
  genres: string[];
  universe?: string;
}

const OMIT_PREFIXES = new Set([
  "form",
  "audible",
  "notes",
  "note",
]);

export function parseOpenLibrarySubjects(
  subjects: string[] | undefined,
): ParsedOpenLibrarySubjects {
  const genres: string[] = [];
  let series: string | undefined;
  let seriesPosition: number | undefined;
  let universe: string | undefined;

  const addGenre = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length >= 120) return;
    if (!genres.some((g) => g.toLowerCase() === trimmed.toLowerCase())) {
      genres.push(trimmed);
    }
  };

  for (const raw of subjects ?? []) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const prefix = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const value = trimmed.slice(colonIdx + 1).trim();
      if (!value || OMIT_PREFIXES.has(prefix)) continue;

      switch (prefix) {
        case "series":
          if (!series) {
            series = trimTrailingPunctuation(value);
          } else if (seriesPosition === undefined && isNumericSeriesToken(value)) {
            seriesPosition = Number(value);
          }
          break;
        case "genre":
          addGenre(value);
          break;
        case "universe":
          if (!universe) universe = value;
          break;
        default:
          break;
      }
      continue;
    }

    addGenre(trimmed);
  }

  return { series, seriesPosition, genres, universe };
}
