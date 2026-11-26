import type { FileService } from "../files/service.js";
import type { MetadataService } from "./service.js";
import type { MetadataPolicyService } from "./policy.js";
import type { AudiobooksService } from "../audiobooks/service.js";
import type { CoverPipeline } from "./cover.js";
import type { JobService } from "../jobs/service.js";
import type { MetadataFormattingService } from "./formatting.js";
import { applyIngestFormatting } from "./apply-ingest-formatting.js";
import { inferFormatFromPath } from "../../../shared/subject.js";
import {
  EXTRACTOR_AUDIO_TAGS,
  extractAudioTagsFromFile,
  type AudioTagBibliographic,
} from "./extractors/audio-tags.js";
import {
  EXTRACTOR_FILENAME,
  extractFilenameMetadata,
} from "./extractors/filename.js";
import { mergeMetadataFields, filenameToPayload } from "./merge.js";
import { detectAsinFromText } from "../../../shared/audio-ingest.js";

function extractRemoteCoverUrl(cover: unknown): string | undefined {
  if (typeof cover !== "object" || cover === null || !("url" in cover)) {
    return undefined;
  }
  const url = (cover as { url?: unknown }).url;
  return typeof url === "string" && url.startsWith("https://") ? url : undefined;
}

export interface AudiobookMetadataResolutionInput {
  fileId: string;
  audiobookId: string;
  representationId: string;
  manifestationId: string;
}

export interface AudiobookMetadataResolutionResult {
  title?: string;
  authors?: string[];
  narrators?: string[];
  series?: string;
  log: string[];
  merged: {
    title?: string;
    subtitle?: string;
    description?: string;
    authors?: string[];
    narrators?: string[];
    genres?: string[];
    asin?: string;
  };
}

function tagsToPayload(data: AudioTagBibliographic) {
  return {
    title: data.title,
    subtitle: data.subtitle,
    description: data.description,
    authors: data.authors,
    narrator: data.narrators?.[0],
    genres: data.genres,
    series: data.series,
    asin: data.asin,
    runtime: data.durationSeconds,
  };
}

export async function runAudiobookMetadataResolution(
  files: FileService,
  metadata: MetadataService,
  metadataPolicy: MetadataPolicyService,
  audiobooks: AudiobooksService,
  coverPipeline: CoverPipeline,
  input: AudiobookMetadataResolutionInput,
  jobs?: JobService,
  formatting?: MetadataFormattingService,
): Promise<AudiobookMetadataResolutionResult> {
  const { fileId, audiobookId, representationId, manifestationId } = input;
  const log: string[] = [];

  const file = await files.getFile(fileId);
  const format = inferFormatFromPath(file.relativePath);

  let tagData: AudioTagBibliographic | undefined;
  if (
    ["m4b", "mp3", "m4a", "flac", "ogg", "opus", "aac", "audio"].includes(
      format,
    )
  ) {
    try {
      tagData = await extractAudioTagsFromFile(files, fileId);
      await metadata.storeTechnicalMetadata(
        fileId,
        EXTRACTOR_AUDIO_TAGS,
        tagData as unknown as Record<string, unknown>,
      );
      await metadata.storeExtractorRecord({
        providerKey: EXTRACTOR_AUDIO_TAGS,
        subjectType: "audiobook",
        subjectId: audiobookId,
        payload: tagData as unknown as Record<string, unknown>,
      });
      log.push("audio-tags");
      if (tagData.durationSeconds) {
        await metadata.storeTechnicalMetadata(fileId, "media.process", {
          durationSeconds: tagData.durationSeconds,
        });
      }
    } catch (err) {
      log.push(
        `audio-tags-failed:${err instanceof Error ? err.message : "unknown"}`,
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
    subjectType: "audiobook",
    subjectId: audiobookId,
    payload: filenameData as unknown as Record<string, unknown>,
  });
  log.push("filename");

  const asin =
    tagData?.asin ??
    detectAsinFromText(file.relativePath) ??
    detectAsinFromText(filenameData.title ?? "");

  const hints: Record<string, unknown> = { format };
  if (tagData?.title) hints.title = tagData.title;
  if (tagData?.authors?.[0]) hints.author = tagData.authors[0];
  if (asin) hints.asin = asin;

  let providerResults: Awaited<
    ReturnType<MetadataService["refreshMetadata"]>
  > = [];
  if (asin) {
    try {
      providerResults = await metadata.refreshMetadata(
        "audiobook",
        audiobookId,
        {
          fileId,
          subjectType: "audiobook",
          subjectId: audiobookId,
          hints,
        },
        "audiobooks",
      );
      if (providerResults.length > 0) {
        log.push(`providers:${providerResults.length}`);
      } else {
        log.push("audnexus-unavailable");
      }
    } catch (err) {
      log.push(
        `providers-failed:${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  const sourcePayloads = new Map<string, Record<string, unknown>>();
  if (tagData) {
    sourcePayloads.set(EXTRACTOR_AUDIO_TAGS, tagsToPayload(tagData));
  }
  sourcePayloads.set(EXTRACTOR_FILENAME, filenameToPayload(filenameData));
  for (const result of providerResults) {
    sourcePayloads.set(result.providerKey, result.payload);
  }

  const fieldPolicies = await metadataPolicy.getFieldPriorities("audiobooks");
  const matchingRules = await metadataPolicy.getMatchingRules("audiobooks");
  const overrides = await metadata.getOverrides("audiobook", audiobookId);
  const overriddenFields = new Set(overrides.map((o) => o.field));

  const { values } = mergeMetadataFields({
    fieldPolicies,
    sourcePayloads,
    overriddenFields,
    matchingRules,
  });

  const narrators = values.narrator
    ? [String(values.narrator)]
    : tagData?.narrators;

  const merged = {
    title: values.title as string | undefined,
    subtitle: values.subtitle as string | undefined,
    description: values.description as string | undefined,
    authors: values.authors as string[] | undefined,
    narrators,
    genres: values.genres as string[] | undefined,
    asin: asin ?? undefined,
  };

  if (formatting) {
    await applyIngestFormatting(formatting, merged, overriddenFields, {
      module: "audiobooks",
      subjectId: audiobookId,
    });
  }

  await audiobooks.applyIngestedMetadata(audiobookId, {
    merged,
    manifestationId,
  });
  log.push("metadata-applied");

  try {
    const coverUrl = extractRemoteCoverUrl(values.cover);
    if (coverUrl) {
      const coverId = await coverPipeline.fetchAndStoreAudiobookCoverFromUrl({
        audiobookId,
        representationId,
        coverUrl,
      });
      if (coverId) {
        log.push("cover");
      } else if (jobs) {
        await jobs.enqueue("artwork.fetch", {
          audiobookId,
          representationId,
          coverUrl,
        });
        log.push("cover-enqueued");
      }
    }
  } catch (err) {
    log.push(`cover-failed:${err instanceof Error ? err.message : "unknown"}`);
  }

  await audiobooks.indexAudiobook(audiobookId);

  return {
    title: merged.title,
    authors: merged.authors,
    narrators: merged.narrators,
    series: values.series as string | undefined,
    log,
    merged,
  };
}
