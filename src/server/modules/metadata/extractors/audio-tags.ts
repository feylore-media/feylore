import { parseBuffer } from "music-metadata";
import type { FileService } from "../../files/service.js";
import { detectAsinFromText } from "../../../../shared/audio-ingest.js";

export const EXTRACTOR_AUDIO_TAGS = "embedded.audio.tags";

export interface AudioTagBibliographic {
  title?: string;
  subtitle?: string;
  description?: string;
  authors?: string[];
  narrators?: string[];
  genres?: string[];
  series?: string;
  seriesPart?: number;
  asin?: string;
  discNumber?: number;
  trackNumber?: number;
  durationSeconds?: number;
}

async function readFileBuffer(
  files: FileService,
  fileId: string,
): Promise<Buffer> {
  const { stream } = await files.getStream(fileId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function extractAudioTagsFromFile(
  files: FileService,
  fileId: string,
): Promise<AudioTagBibliographic> {
  const file = await files.getFile(fileId);
  const buffer = await readFileBuffer(files, fileId);

  const metadata = await parseBuffer(buffer, {
    mimeType: file.mediaType ?? undefined,
  });

  const common = metadata.common;
  const format = metadata.format;

  const authors: string[] = [];
  if (common.artist) authors.push(common.artist);
  if (common.albumartist && !authors.includes(common.albumartist)) {
    authors.push(common.albumartist);
  }
  for (const artist of common.artists ?? []) {
    if (!authors.includes(artist)) authors.push(artist);
  }

  const narrators: string[] = [];
  const composer =
    typeof common.composer === "string" ? common.composer : undefined;
  if (composer) narrators.push(composer);

  const commentText = (common.comment ?? [])
    .map((c) => (typeof c === "string" ? c : c.text))
    .join("\n");
  const narratorMatch = commentText.match(/narrator:\s*(.+)/i);
  if (narratorMatch?.[1]) narrators.push(narratorMatch[1].trim());

  const genres = [...(common.genre ?? [])];

  const asin =
    detectAsinFromText(file.relativePath) ??
    detectAsinFromText(commentText);

  return {
    title: common.title ?? common.album,
    subtitle: Array.isArray(common.subtitle)
      ? common.subtitle[0]
      : common.subtitle,
    description: commentText || undefined,
    authors: authors.length > 0 ? authors : undefined,
    narrators: narrators.length > 0 ? narrators : undefined,
    genres: genres.length > 0 ? genres : undefined,
    asin,
    discNumber: common.disk?.no ?? undefined,
    trackNumber: common.track?.no ?? undefined,
    durationSeconds:
      format.duration && format.duration > 0
        ? Math.round(format.duration)
        : undefined,
  };
}

export function audioTagsToPayload(
  data: AudioTagBibliographic,
): Record<string, unknown> {
  return { ...data };
}
