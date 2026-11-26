import { parseBuffer } from "music-metadata";
import type { FileService } from "../files/service.js";
import type { MoviesService } from "../movies/service.js";
import type { MetadataFormattingService } from "./formatting.js";
import { applyIngestFormatting } from "./apply-ingest-formatting.js";
import { titleFromPath } from "../../../shared/subject.js";
import { parseMovieFilename } from "../ingest/organizers/movies.js";

export async function runMovieMetadataResolution(
  files: FileService,
  movies: MoviesService,
  input: {
    fileId: string;
    movieId: string;
    representationId: string;
    manifestationId: string;
  },
  formatting?: MetadataFormattingService,
): Promise<{ log: string[] }> {
  const log: string[] = [];
  const file = await files.getFile(input.fileId);
  const { stream } = await files.getStream(input.fileId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  const parsed = parseMovieFilename(file.relativePath);
  const pathTitle = titleFromPath(file.relativePath);

  let title = parsed.title || pathTitle;
  let releaseDate: string | undefined = parsed.year;
  let description: string | undefined;
  let runtimeSeconds: number | undefined;
  const genres: string[] = [];
  const credits: Array<{ name: string; role: string; character?: string }> = [];

  try {
    const tags = await parseBuffer(buffer, {
      mimeType: file.mediaType ?? undefined,
    });
    if (tags.common.title) title = tags.common.title;
    if (tags.common.year) releaseDate = String(tags.common.year);
    if (tags.common.description) {
      const desc = tags.common.description;
      description = Array.isArray(desc) ? desc.join(" ") : String(desc);
    }
    if (tags.format.duration && tags.format.duration > 0) {
      runtimeSeconds = Math.round(tags.format.duration);
    }
    if (tags.common.genre) {
      const g = tags.common.genre;
      if (Array.isArray(g)) genres.push(...g.map(String));
      else genres.push(String(g));
    }
    const directorTag = (tags.common as { director?: string | string[] }).director;
    if (directorTag) {
      const directors = Array.isArray(directorTag) ? directorTag : [directorTag];
      for (const name of directors) {
        credits.push({ name: String(name), role: "director" });
      }
    }
    if (tags.common.artist) {
      const actors = Array.isArray(tags.common.artist)
        ? tags.common.artist
        : [tags.common.artist];
      for (const name of actors) {
        credits.push({ name: String(name), role: "actor" });
      }
    }
    log.push("extracted embedded video tags");
  } catch {
    log.push("no embedded tags");
  }

  const merged = {
    title,
    releaseDate,
    description,
    runtimeSeconds,
    genres: genres.length > 0 ? genres : undefined,
    credits: credits.length > 0 ? credits : undefined,
  };

  if (formatting && merged.genres) {
    await applyIngestFormatting(formatting, merged, new Set(), {
      module: "movies",
      subjectId: input.movieId,
    });
  }

  await movies.applyIngestedMetadata(input.movieId, {
    merged,
    manifestationId: input.manifestationId,
  });

  return { log };
}
