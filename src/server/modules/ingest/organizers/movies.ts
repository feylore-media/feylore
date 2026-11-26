import path from "node:path";
import { slugifyTitle } from "../../../../shared/media-identity.js";

export function parseMovieFilename(filename: string): {
  title: string;
  year?: string;
} {
  const base = path.basename(filename, path.extname(filename));
  const parenMatch = /^(.*)\s+\((\d{4})\)\s*$/.exec(base);
  if (parenMatch) {
    return { title: parenMatch[1]!.trim(), year: parenMatch[2] };
  }
  const dashMatch = /^(.*)\s+-\s+(\d{4})\s*$/.exec(base);
  if (dashMatch) {
    return { title: dashMatch[1]!.trim(), year: dashMatch[2] };
  }
  return { title: base.trim() };
}

export function buildMovieDestinationPath(
  libraryRoot: string,
  movieSlug: string,
  filename: string,
): string {
  return path.posix.join(libraryRoot, "movies", movieSlug, filename);
}

export function movieSlugFromTitle(title: string): string | null {
  return slugifyTitle(title);
}
