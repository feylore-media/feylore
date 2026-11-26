import path from "node:path";

export interface ParsedTvPath {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
}

const SEASON_EPISODE_PATTERNS = [
  /\bS(\d{1,2})E(\d{1,3})\b/i,
  /\b(\d{1,2})x(\d{1,3})\b/i,
  /\bSeason\s*(\d{1,2})\s*Episode\s*(\d{1,3})\b/i,
];

const SPECIALS_FOLDER = /^(specials?|extras?)$/i;

function parseSeasonEpisodeToken(
  text: string,
): { seasonNumber: number; episodeNumber: number } | null {
  for (const pattern of SEASON_EPISODE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return {
        seasonNumber: Number.parseInt(match[1]!, 10),
        episodeNumber: Number.parseInt(match[2]!, 10),
      };
    }
  }
  return null;
}

function cleanEpisodeTitle(raw: string): string | null {
  const trimmed = raw
    .replace(/\bS\d{1,2}E\d{1,3}\b/gi, "")
    .replace(/\b\d{1,2}x\d{1,3}\b/gi, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}

function seasonNumberFromFolder(folderName: string): number | null {
  if (SPECIALS_FOLDER.test(folderName)) return 0;
  const seasonMatch = /^Season\s*(\d{1,2})$/i.exec(folderName);
  if (seasonMatch) return Number.parseInt(seasonMatch[1]!, 10);
  const shortMatch = /^S(\d{1,2})$/i.exec(folderName);
  if (shortMatch) return Number.parseInt(shortMatch[1]!, 10);
  return null;
}

export function parseTvPath(relativePath: string): ParsedTvPath | null {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const filename = parts[parts.length - 1]!;
  const basename = path.basename(filename, path.extname(filename));

  let seasonNumber: number | null = null;
  let episodeNumber: number | null = null;
  let episodeTitle: string | null = null;
  let showTitle: string | null = null;

  const token = parseSeasonEpisodeToken(basename);
  if (token) {
    seasonNumber = token.seasonNumber;
    episodeNumber = token.episodeNumber;
    episodeTitle = cleanEpisodeTitle(basename);
  }

  for (let i = parts.length - 2; i >= 0; i--) {
    const part = parts[i]!;
    if (seasonNumber == null) {
      const fromFolder = seasonNumberFromFolder(part);
      if (fromFolder != null) {
        seasonNumber = fromFolder;
        continue;
      }
    }

    const fromPart = parseSeasonEpisodeToken(part);
    if (fromPart && seasonNumber == null) {
      seasonNumber = fromPart.seasonNumber;
      episodeNumber = episodeNumber ?? fromPart.episodeNumber;
    }

    if (!showTitle && !parseSeasonEpisodeToken(part) && !seasonNumberFromFolder(part)) {
      showTitle = part.replace(/[-_.]+/g, " ").trim();
    }
  }

  if (seasonNumber == null || episodeNumber == null) {
    const fallback = parseSeasonEpisodeToken(normalized);
    if (!fallback) return null;
    seasonNumber = fallback.seasonNumber;
    episodeNumber = fallback.episodeNumber;
    episodeTitle = episodeTitle ?? cleanEpisodeTitle(basename);
  }

  if (!showTitle) {
    if (parts.length >= 2) {
      showTitle = parts[parts.length - 2]!
        .replace(/[-_.]+/g, " ")
        .trim();
    } else {
      showTitle = basename.replace(/\bS\d{1,2}E\d{1,3}\b/gi, "").trim();
    }
  }

  if (!showTitle) return null;

  return {
    showTitle,
    seasonNumber,
    episodeNumber,
    episodeTitle,
  };
}
