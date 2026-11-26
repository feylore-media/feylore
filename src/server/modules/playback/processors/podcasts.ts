import { eq } from "drizzle-orm";
import { parseBuffer } from "music-metadata";
import type {
  MediaDomainProcessor,
  MediaProcessContext,
  MediaProcessResult,
} from "../domain-processor.js";
import * as schema from "../../../db/schema.js";
import type { FileService } from "../../files/service.js";

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

export class PodcastsMediaProcessor implements MediaDomainProcessor {
  readonly domain = "podcast";

  constructor(private readonly files: FileService) {}

  canProcess(input: {
    domain?: string;
    representationDomainModule?: string;
  }): boolean {
    return (
      input.domain === "podcast" ||
      input.representationDomainModule === "podcasts"
    );
  }

  async process(ctx: MediaProcessContext): Promise<MediaProcessResult> {
    if (!ctx.fileId) {
      return { logExcerpt: "No file for podcast media process" };
    }

    const file = await this.files.getFile(ctx.fileId);
    const buffer = await readFileBuffer(this.files, ctx.fileId);
    const metadata = await parseBuffer(buffer, {
      mimeType: file.mediaType ?? undefined,
    });

    const durationSeconds =
      metadata.format.duration && metadata.format.duration > 0
        ? Math.round(metadata.format.duration)
        : undefined;

    const payload: Record<string, unknown> = {};
    if (durationSeconds) payload.durationSeconds = durationSeconds;

    const existing = await ctx.db.query.fileTechnicalMetadata.findFirst({
      where: eq(schema.fileTechnicalMetadata.fileId, ctx.fileId),
    });

    if (existing) {
      await ctx.db
        .update(schema.fileTechnicalMetadata)
        .set({
          extractor: "media.process.podcast",
          payload: { ...existing.payload, ...payload },
          extractedAt: new Date(),
        })
        .where(eq(schema.fileTechnicalMetadata.id, existing.id));
    } else if (Object.keys(payload).length > 0) {
      const { generateId } = await import("../../../security/crypto.js");
      await ctx.db.insert(schema.fileTechnicalMetadata).values({
        id: generateId(),
        fileId: ctx.fileId,
        extractor: "media.process.podcast",
        payload,
      });
    }

    if (durationSeconds && ctx.representationId) {
      const episode = await ctx.db.query.podcastEpisodes.findFirst({
        where: eq(schema.podcastEpisodes.representationId, ctx.representationId),
      });
      if (episode && !episode.durationSeconds) {
        await ctx.db
          .update(schema.podcastEpisodes)
          .set({ durationSeconds, updatedAt: new Date() })
          .where(eq(schema.podcastEpisodes.id, episode.id));
      }
    }

    return {
      logExcerpt: durationSeconds
        ? `Probed podcast audio duration ${durationSeconds}s`
        : "Podcast audio probe complete",
    };
  }
}

export function createPodcastsMediaProcessor(files: FileService) {
  return new PodcastsMediaProcessor(files);
}
