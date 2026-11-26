import { createHash } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { normalizeRelativePath } from "../../security/paths.js";
import type { FileService } from "../files/service.js";
import type { RepresentationService } from "../representations/service.js";
import type { JobService } from "../jobs/service.js";
import { outboundFetchBuffer, OutboundFetchError } from "../metadata/outbound-fetch.js";
import { validateEnclosureAudio } from "./enclosure-validation.js";

export const MAX_ENCLOSURE_BYTES = 500 * 1024 * 1024;

const AUDIO_MIME_PREFIXES = ["audio/"];

function extForMime(mime: string, url: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (base) {
    case "audio/mpeg":
      return ".mp3";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return ".m4a";
    case "audio/ogg":
      return ".ogg";
    case "audio/flac":
      return ".flac";
    case "audio/aac":
      return ".aac";
    default: {
      const fromUrl = url.split("?")[0]?.split(".").pop()?.toLowerCase();
      if (fromUrl && fromUrl.length <= 5) return `.${fromUrl}`;
      return ".mp3";
    }
  }
}

function isAudioMime(mime: string): boolean {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return AUDIO_MIME_PREFIXES.some((p) => base.startsWith(p));
}

function enclosureFetchErrorMessage(err: unknown): string {
  if (err instanceof OutboundFetchError) {
    switch (err.code) {
      case "redirect":
        return "Audio download redirected too many times";
      case "timeout":
        return "Timed out while downloading episode audio";
      case "size":
        return "Episode audio file is too large";
      case "scheme":
        return "Episode audio must use HTTPS";
      case "http":
        return err.message;
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : "Enclosure fetch failed";
}

export async function runPodcastEnclosureFetch(
  db: Database,
  files: FileService,
  representations: RepresentationService,
  jobs: JobService | undefined,
  episodeId: string,
): Promise<void> {
  const episode = await db.query.podcastEpisodes.findFirst({
    where: eq(schema.podcastEpisodes.id, episodeId),
  });
  if (!episode) throw new Error("Episode not found");

  if (episode.prepareStatus === "ready" && episode.representationId) {
    const links = await representations.listFilesForRepresentation(
      episode.representationId,
    );
    if (links.length > 0) return;
  }

  if (!episode.enclosureUrl) {
    await db
      .update(schema.podcastEpisodes)
      .set({
        prepareStatus: "failed",
        prepareError: "Episode has no enclosure URL",
        updatedAt: new Date(),
      })
      .where(eq(schema.podcastEpisodes.id, episodeId));
    throw new Error("Episode has no enclosure URL");
  }

  await db
    .update(schema.podcastEpisodes)
    .set({
      prepareStatus: "pending",
      prepareError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.podcastEpisodes.id, episodeId));

  try {
    const { data, mediaType } = await outboundFetchBuffer(episode.enclosureUrl, {
      maxBytes: MAX_ENCLOSURE_BYTES,
      timeoutMs: 120_000,
    });

    if (!isAudioMime(mediaType)) {
      throw new Error(`Unsupported enclosure media type: ${mediaType}`);
    }

    const { durationSeconds } = await validateEnclosureAudio(data, mediaType);

    const managedLocationId = await files.getManagedStorageLocationId();
    if (!managedLocationId) {
      throw new Error("No managed storage location configured");
    }

    const checksum = createHash("sha256").update(data).digest("hex");
    const ext = extForMime(mediaType, episode.enclosureUrl);
    const relativePath = normalizeRelativePath(
      path.posix.join(
        "podcasts",
        episode.showId,
        episode.id,
        `${checksum}${ext}`,
      ),
    );

    const fileId = await files.storeDerivedFile({
      storageLocationId: managedLocationId,
      relativePath,
      data,
      mediaType: mediaType.split(";")[0]!.trim(),
    });

    let representationId = episode.representationId;
    if (!representationId) {
      const expressionId = generateId();
      await db.insert(schema.creativeWorkExpressions).values({
        id: expressionId,
        workType: "podcast_episode",
        workId: episode.id,
        label: "default",
      });

      const manifestationId = generateId();
      await db.insert(schema.creativeWorkManifestations).values({
        id: manifestationId,
        expressionId,
        label: episode.title,
        externalIdType: "podcast_guid",
        externalId: episode.guid,
      });

      representationId = await representations.create({
        format: "audio",
        domainModule: "podcasts",
        manifestationId,
      });
    }

    await representations.linkFile(representationId, fileId, "content");

    await db
      .update(schema.podcastEpisodes)
      .set({
        representationId,
        prepareStatus: "ready",
        prepareError: null,
        durationSeconds: durationSeconds ?? episode.durationSeconds,
        updatedAt: new Date(),
      })
      .where(eq(schema.podcastEpisodes.id, episodeId));

    if (jobs) {
      try {
        const { JOB_TYPES } = await import("../jobs/types.js");
        await jobs.enqueue(JOB_TYPES.MEDIA_PROCESS, {
          fileId,
          representationId,
          domain: "podcast",
        });
      } catch {
        // Prepare succeeded; background metadata probing is best-effort.
      }
    }
  } catch (err) {
    const message = enclosureFetchErrorMessage(err);
    await db
      .update(schema.podcastEpisodes)
      .set({
        prepareStatus: "failed",
        prepareError: message,
        updatedAt: new Date(),
      })
      .where(eq(schema.podcastEpisodes.id, episodeId));
    throw err;
  }
}
