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

export class MoviesMediaProcessor implements MediaDomainProcessor {
  readonly domain = "movie";

  constructor(private readonly files: FileService) {}

  canProcess(input: {
    domain?: string;
    representationDomainModule?: string;
  }): boolean {
    return (
      input.domain === "movie" ||
      input.representationDomainModule === "movies"
    );
  }

  async process(ctx: MediaProcessContext): Promise<MediaProcessResult> {
    if (!ctx.fileId) {
      return { logExcerpt: "No file for movie media process" };
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
    if (metadata.common.year) payload.year = metadata.common.year;

    const existing = await ctx.db.query.fileTechnicalMetadata.findFirst({
      where: eq(schema.fileTechnicalMetadata.fileId, ctx.fileId),
    });

    if (existing) {
      await ctx.db
        .update(schema.fileTechnicalMetadata)
        .set({
          extractor: "media.process.movie",
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
          if (expression?.workType === "movie") {
            const movie = await ctx.db.query.movies.findFirst({
              where: eq(schema.movies.id, expression.workId),
            });
            if (movie && movie.runtimeSeconds == null) {
              await ctx.db
                .update(schema.movies)
                .set({
                  runtimeSeconds: durationSeconds,
                  updatedAt: new Date(),
                })
                .where(eq(schema.movies.id, expression.workId));
            }
          }
        }
      }
    }

    return {
      logExcerpt: durationSeconds
        ? `Probed video duration ${durationSeconds}s`
        : "Video probe complete",
      technicalMetadata: [
        {
          fileId: ctx.fileId,
          extractor: "media.process.movie",
          payload,
        },
      ],
    };
  }
}

export function createMoviesMediaProcessor(
  files: FileService,
): MediaDomainProcessor {
  return new MoviesMediaProcessor(files);
}
