import path from "node:path";
import { parseTvPath } from "../../tv/import-heuristics.js";

export { parseTvPath };

export function seasonFolderName(seasonNumber: number): string {
  if (seasonNumber === 0) return "Specials";
  return `Season ${String(seasonNumber).padStart(2, "0")}`;
}

export function buildTvFilename(input: {
  showSlug: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string | null;
  ext: string;
}): string {
  const seasonToken = `S${String(input.seasonNumber).padStart(2, "0")}`;
  const episodeToken = `E${String(input.episodeNumber).padStart(2, "0")}`;
  const titlePart = input.episodeTitle
    ? ` - ${input.episodeTitle.replace(/[\\/:*?"<>|]+/g, " ").trim()}`
    : "";
  return `${input.showSlug} - ${seasonToken}${episodeToken}${titlePart}.${input.ext}`;
}

export function buildTvDestinationPath(
  libraryRoot: string,
  showSlug: string,
  seasonNumber: number,
  filename: string,
): string {
  return path.posix.join(
    libraryRoot,
    "tv",
    showSlug,
    seasonFolderName(seasonNumber),
    filename,
  );
}
