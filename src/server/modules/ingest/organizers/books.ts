import path from "node:path";
import { slugifySegment } from "./path-utils.js";

export function buildBookDestinationPath(params: {
  template: string;
  title: string;
  authors?: string[];
  series?: string;
  extension: string;
}): string {
  const author = params.authors?.[0] ?? "Unknown Author";
  const series = params.series ?? "Standalone";
  const title = params.title || "Untitled";
  const ext = params.extension.startsWith(".")
    ? params.extension
    : `.${params.extension}`;

  const segments = params.template
    .replace("{author}", slugifySegment(author))
    .replace("{series}", slugifySegment(series))
    .replace("{title}", slugifySegment(title))
    .split("/")
    .filter(Boolean);

  const dir = segments.slice(0, -1).join("/");
  const filename = `${slugifySegment(title)}${ext}`;
  return dir ? path.posix.join(dir, filename) : filename;
}

export function buildInPlaceDestinationPath(originalFilename: string): string {
  return path.posix.basename(originalFilename);
}
