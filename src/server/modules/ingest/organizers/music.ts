import path from "node:path";
import { slugifySegment } from "./path-utils.js";

export function buildMusicDestinationPath(params: {
  template: string;
  artist: string;
  album: string;
  track: string;
  extension: string;
}): string {
  const artist = params.artist || "Unknown Artist";
  const album = params.album || "Unknown Album";
  const track = params.track || "Unknown Track";
  const ext = params.extension.startsWith(".")
    ? params.extension
    : `.${params.extension}`;

  const segments = params.template
    .replace("{artist}", slugifySegment(artist))
    .replace("{album}", slugifySegment(album))
    .replace("{track}", slugifySegment(track))
    .replace("{title}", slugifySegment(track))
    .split("/")
    .filter(Boolean);

  const dir = segments.slice(0, -1).join("/");
  const filename = `${slugifySegment(track)}${ext}`;
  return dir ? path.posix.join(dir, filename) : filename;
}
