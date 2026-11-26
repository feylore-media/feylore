import type { FileService } from "../files/service.js";
import type { MetadataService } from "./service.js";
import type { MetadataPolicyService } from "./policy.js";
import type { MusicService } from "../music/service.js";
import type { CoverPipeline } from "./cover.js";
import type { JobService } from "../jobs/service.js";
import type { MetadataFormattingService } from "./formatting.js";
import { applyIngestFormatting } from "./apply-ingest-formatting.js";
import { inferFormatFromPath } from "../../../shared/subject.js";
import {
  EXTRACTOR_MUSIC_TAGS,
  extractMusicTagsFromFile,
  musicTagsToPayload,
  type MusicTagBibliographic,
} from "./extractors/music-tags.js";
import {
  EXTRACTOR_FILENAME,
  extractFilenameMetadata,
} from "./extractors/filename.js";
import { mergeMetadataFields, filenameToPayload } from "./merge.js";

function extractRemoteCoverUrl(cover: unknown): string | undefined {
  if (typeof cover !== "object" || cover === null || !("url" in cover)) {
    return undefined;
  }
  const url = (cover as { url?: unknown }).url;
  return typeof url === "string" && url.startsWith("https://") ? url : undefined;
}

export interface MusicMetadataResolutionInput {
  fileId: string;
  albumId: string;
  trackId: string;
  representationId: string;
  manifestationId: string;
}

export interface MusicMetadataResolutionResult {
  title?: string;
  artists?: string[];
  album?: string;
  log: string[];
  merged: {
    title?: string;
    subtitle?: string;
    description?: string;
    artists?: string[];
    genres?: string[];
    releaseDate?: string;
  };
}

export async function runMusicMetadataResolution(
  files: FileService,
  metadata: MetadataService,
  metadataPolicy: MetadataPolicyService,
  music: MusicService,
  coverPipeline: CoverPipeline,
  input: MusicMetadataResolutionInput,
  jobs?: JobService,
  formatting?: MetadataFormattingService,
): Promise<MusicMetadataResolutionResult> {
  const { fileId, albumId, trackId, representationId } = input;
  const log: string[] = [];

  const file = await files.getFile(fileId);
  const format = inferFormatFromPath(file.relativePath);

  let tagData: MusicTagBibliographic | undefined;
  if (
    ["mp3", "m4a", "flac", "ogg", "opus", "aac", "wav", "audio"].includes(
      format,
    )
  ) {
    try {
      tagData = await extractMusicTagsFromFile(files, fileId);
      await metadata.storeTechnicalMetadata(
        fileId,
        EXTRACTOR_MUSIC_TAGS,
        tagData as unknown as Record<string, unknown>,
      );
      await metadata.storeExtractorRecord({
        providerKey: EXTRACTOR_MUSIC_TAGS,
        subjectType: "album",
        subjectId: albumId,
        payload: tagData as unknown as Record<string, unknown>,
      });
      log.push("music-tags");
      if (tagData.durationSeconds) {
        await metadata.storeTechnicalMetadata(fileId, "media.process", {
          durationSeconds: tagData.durationSeconds,
        });
      }
    } catch (err) {
      log.push(
        `music-tags-failed:${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  const filenameData = extractFilenameMetadata(file.relativePath);
  await metadata.storeTechnicalMetadata(
    fileId,
    EXTRACTOR_FILENAME,
    filenameData as unknown as Record<string, unknown>,
  );
  await metadata.storeExtractorRecord({
    providerKey: EXTRACTOR_FILENAME,
    subjectType: "album",
    subjectId: albumId,
    payload: filenameData as unknown as Record<string, unknown>,
  });
  log.push("filename");

  const hints: Record<string, unknown> = { format };
  if (tagData?.album) hints.title = tagData.album;
  if (tagData?.albumArtist) hints.artist = tagData.albumArtist;
  else if (tagData?.artists?.[0]) hints.artist = tagData.artists[0];
  if (tagData?.musicbrainzReleaseId) {
    hints.musicbrainzReleaseId = tagData.musicbrainzReleaseId;
  }
  if (tagData?.musicbrainzRecordingId) {
    hints.musicbrainzRecordingId = tagData.musicbrainzRecordingId;
  }

  let providerResults: Awaited<
    ReturnType<MetadataService["refreshMetadata"]>
  > = [];
  if (tagData?.musicbrainzReleaseId || tagData?.musicbrainzRecordingId) {
    try {
      providerResults = await metadata.refreshMetadata(
        "album",
        albumId,
        {
          fileId,
          subjectType: "album",
          subjectId: albumId,
          hints,
        },
        "music",
      );
      if (providerResults.length > 0) {
        log.push(`providers:${providerResults.length}`);
      } else {
        log.push("musicbrainz-unavailable");
      }
    } catch (err) {
      log.push(
        `providers-failed:${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  const sourcePayloads = new Map<string, Record<string, unknown>>();
  if (tagData) {
    sourcePayloads.set(EXTRACTOR_MUSIC_TAGS, musicTagsToPayload(tagData));
  }
  sourcePayloads.set(EXTRACTOR_FILENAME, filenameToPayload(filenameData));
  for (const result of providerResults) {
    sourcePayloads.set(result.providerKey, result.payload);
  }

  const fieldPolicies = await metadataPolicy.getFieldPriorities("music");
  const matchingRules = await metadataPolicy.getMatchingRules("music");
  const overrides = await metadata.getOverrides("album", albumId);
  const overriddenFields = new Set(overrides.map((o) => o.field));

  const { values } = mergeMetadataFields({
    fieldPolicies,
    sourcePayloads,
    overriddenFields,
    matchingRules,
  });

  const artists = values.authors
    ? Array.isArray(values.authors)
      ? (values.authors as string[])
      : [String(values.authors)]
    : tagData?.artists ??
      (tagData?.albumArtist ? [tagData.albumArtist] : undefined);

  const merged = {
    title: values.title as string | undefined,
    subtitle: values.subtitle as string | undefined,
    description: values.description as string | undefined,
    artists,
    genres: values.genres as string[] | undefined,
    releaseDate: values.releaseDate as string | undefined,
  };

  if (formatting) {
    await applyIngestFormatting(formatting, merged, overriddenFields, {
      module: "music",
      subjectId: albumId,
    });
  }

  await music.applyIngestedMetadata(albumId, { merged });
  log.push("metadata-applied");

  if (trackId && tagData?.title && !overriddenFields.has("title")) {
    await music.updateTrackTitleIfUnset(trackId, tagData.title);
  }

  try {
    const coverUrl = extractRemoteCoverUrl(values.cover);
    if (coverUrl) {
      const coverId = await coverPipeline.fetchAndStoreAlbumCoverFromUrl({
        albumId,
        representationId,
        coverUrl,
      });
      if (coverId) {
        log.push("cover");
      } else if (jobs) {
        await jobs.enqueue("artwork.fetch", {
          albumId,
          representationId,
          coverUrl,
        });
        log.push("cover-enqueued");
      }
    }
  } catch (err) {
    log.push(`cover-failed:${err instanceof Error ? err.message : "unknown"}`);
  }

  await music.indexAlbum(albumId);

  return {
    title: merged.title,
    artists: merged.artists,
    album: tagData?.album ?? merged.title,
    log,
    merged,
  };
}
