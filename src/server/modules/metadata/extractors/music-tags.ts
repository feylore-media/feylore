import { parseBuffer } from "music-metadata";
import type { FileService } from "../../files/service.js";

export const EXTRACTOR_MUSIC_TAGS = "embedded.music.tags";

export interface MusicTagBibliographic {
  title?: string;
  album?: string;
  albumArtist?: string;
  artists?: string[];
  genres?: string[];
  discNumber?: number;
  trackNumber?: number;
  durationSeconds?: number;
  releaseDate?: string;
  musicbrainzRecordingId?: string;
  musicbrainzReleaseId?: string;
  musicbrainzArtistId?: string;
  musicbrainzAlbumArtistId?: string;
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

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === "string" && v.trim());
    if (typeof first === "string") return first.trim();
  }
  return undefined;
}

export async function extractMusicTagsFromFile(
  files: FileService,
  fileId: string,
): Promise<MusicTagBibliographic> {
  const file = await files.getFile(fileId);
  const buffer = await readFileBuffer(files, fileId);

  const metadata = await parseBuffer(buffer, {
    mimeType: file.mediaType ?? undefined,
  });

  const common = metadata.common;
  const format = metadata.format;

  const artists: string[] = [];
  if (common.artist) artists.push(common.artist);
  for (const artist of common.artists ?? []) {
    if (!artists.includes(artist)) artists.push(artist);
  }

  const albumArtist =
    common.albumartist ??
    (common.artists?.length === 1 ? common.artists[0] : undefined);

  const genres = [...(common.genre ?? [])];

  const musicbrainzRecordingId = firstString(
    common.musicbrainz_recordingid ?? common.musicbrainz_trackid,
  );
  const musicbrainzReleaseId = firstString(common.musicbrainz_albumid);
  const musicbrainzArtistId = firstString(common.musicbrainz_artistid);
  const musicbrainzAlbumArtistId = firstString(
    common.musicbrainz_albumartistid,
  );

  let releaseDate: string | undefined;
  const year = common.year;
  if (typeof year === "number" && year > 0) {
    releaseDate = String(year);
  }
  const date = common.date;
  if (typeof date === "string" && date.trim()) {
    releaseDate = date.trim();
  }

  return {
    title: common.title,
    album: common.album,
    albumArtist,
    artists: artists.length > 0 ? artists : undefined,
    genres: genres.length > 0 ? genres : undefined,
    discNumber: common.disk?.no ?? undefined,
    trackNumber: common.track?.no ?? undefined,
    durationSeconds:
      format.duration && format.duration > 0
        ? Math.round(format.duration)
        : undefined,
    releaseDate,
    musicbrainzRecordingId,
    musicbrainzReleaseId,
    musicbrainzArtistId,
    musicbrainzAlbumArtistId,
  };
}

export function musicTagsToPayload(
  data: MusicTagBibliographic,
): Record<string, unknown> {
  const artists =
    data.artists ??
    (data.albumArtist ? [data.albumArtist] : undefined);

  return {
    title: data.album ?? data.title,
    trackTitle: data.title,
    album: data.album,
    authors: artists,
    artists,
    genres: data.genres,
    releaseDate: data.releaseDate,
    runtime: data.durationSeconds,
    musicbrainzRecordingId: data.musicbrainzRecordingId,
    musicbrainzReleaseId: data.musicbrainzReleaseId,
    musicbrainzArtistId: data.musicbrainzArtistId,
    musicbrainzAlbumArtistId: data.musicbrainzAlbumArtistId,
  };
}
