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

export class MusicMediaProcessor implements MediaDomainProcessor {
  readonly domain = "music";

  constructor(private readonly files: FileService) {}

  canProcess(input: {
    domain?: string;
    representationDomainModule?: string;
  }): boolean {
    return (
      input.domain === "music" ||
      input.representationDomainModule === "music"
    );
  }

  async process(ctx: MediaProcessContext): Promise<MediaProcessResult> {
    if (!ctx.fileId) {
      return { logExcerpt: "No file for music media process" };
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
    if (metadata.common.title) payload.title = metadata.common.title;
    if (metadata.common.disk?.no) payload.discNumber = metadata.common.disk.no;
    if (metadata.common.track?.no) {
      payload.trackNumber = metadata.common.track.no;
    }

    const existing = await ctx.db.query.fileTechnicalMetadata.findFirst({
      where: eq(schema.fileTechnicalMetadata.fileId, ctx.fileId),
    });

    if (existing) {
      await ctx.db
        .update(schema.fileTechnicalMetadata)
        .set({
          extractor: "media.process.music",
          payload: { ...existing.payload, ...payload },
          extractedAt: new Date(),
        })
        .where(eq(schema.fileTechnicalMetadata.id, existing.id));
    }

    return {
      logExcerpt: durationSeconds
        ? `Probed audio duration ${durationSeconds}s`
        : "Audio probe complete",
      technicalMetadata: [
        {
          fileId: ctx.fileId,
          extractor: "media.process.music",
          payload,
        },
      ],
    };
  }
}

export function createMusicMediaProcessor(
  files: FileService,
): MediaDomainProcessor {
  return new MusicMediaProcessor(files);
}
