import { parseBuffer } from "music-metadata";
import type {
  MediaDomainProcessor,
  MediaProcessContext,
  MediaProcessResult,
} from "../domain-processor.js";
import * as schema from "../../../db/schema.js";
import { eq } from "drizzle-orm";
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

export class TvMediaProcessor implements MediaDomainProcessor {
  readonly domain = "tv";

  constructor(private readonly files: FileService) {}

  canProcess(input: {
    domain?: string;
    representationDomainModule?: string;
  }): boolean {
    return (
      input.domain === "tv" || input.representationDomainModule === "tv"
    );
  }

  async process(ctx: MediaProcessContext): Promise<MediaProcessResult> {
    if (!ctx.fileId) {
      return { logExcerpt: "No file for TV media process" };
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

    const existing = await ctx.db.query.fileTechnicalMetadata.findFirst({
      where: eq(schema.fileTechnicalMetadata.fileId, ctx.fileId),
    });

    if (existing) {
      await ctx.db
        .update(schema.fileTechnicalMetadata)
        .set({
          extractor: "media.process.tv",
          payload: { ...existing.payload, ...payload },
          extractedAt: new Date(),
        })
        .where(eq(schema.fileTechnicalMetadata.id, existing.id));
    }

    if (durationSeconds && ctx.representationId) {
      const rep = await ctx.db.query.representations.findFirst({
        where: eq(schema.representations.id, ctx.representationId),
      });
      if (rep?.manifestationId) {
        const manifestation =
          await ctx.db.query.creativeWorkManifestations.findFirst({
            where: eq(
              schema.creativeWorkManifestations.id,
              rep.manifestationId,
            ),
          });
        if (manifestation) {
          const expression =
            await ctx.db.query.creativeWorkExpressions.findFirst({
              where: eq(
                schema.creativeWorkExpressions.id,
                manifestation.expressionId,
              ),
            });
          if (expression?.workType === "tv_episode") {
            const episode = await ctx.db.query.tvEpisodes.findFirst({
              where: eq(schema.tvEpisodes.id, expression.workId),
            });
            if (episode && episode.runtimeSeconds == null) {
              await ctx.db
                .update(schema.tvEpisodes)
                .set({
                  runtimeSeconds: durationSeconds,
                  updatedAt: new Date(),
                })
                .where(eq(schema.tvEpisodes.id, expression.workId));
            }
          }
        }
      }
    }

    return {
      logExcerpt: durationSeconds
        ? `Probed TV episode duration ${durationSeconds}s`
        : "TV video probe complete",
      technicalMetadata: [
        {
          fileId: ctx.fileId,
          extractor: "media.process.tv",
          payload,
        },
      ],
    };
  }
}

export function createTvMediaProcessor(
  files: FileService,
): MediaDomainProcessor {
  return new TvMediaProcessor(files);
}
