import type { Database } from "../../db/client.js";
import type { JobService } from "../jobs/service.js";
import type { FileService } from "../files/service.js";
import type { MetadataService } from "./service.js";
import type { MetadataPolicyService } from "./policy.js";
import type { MetadataCanonicalService } from "./canonical.js";
import type { MetadataProviderRegistry } from "./registry.js";
import type { BooksService } from "../books/service.js";
import type { AudiobooksService } from "../audiobooks/service.js";
import type { MusicService } from "../music/service.js";
import type { MoviesService } from "../movies/service.js";
import type { CoverPipeline } from "./cover.js";
import type { MetadataFormattingService } from "./formatting.js";
import { runBookMetadataResolution } from "./book-metadata-resolution.js";
import { runAudiobookMetadataResolution } from "./audiobook-metadata-resolution.js";
import { runMusicMetadataResolution } from "./music-metadata-resolution.js";
import { runMovieMetadataResolution } from "./movie-metadata-resolution.js";

export interface MetadataIngestPayload {
  fileId: string;
  bookId?: string;
  audiobookId?: string;
  albumId?: string;
  trackId?: string;
  movieId?: string;
  representationId: string;
  manifestationId?: string;
  userId?: string;
  feyloreJobId: string;
  mode?: "ingest" | "providers_only";
}

export async function runMetadataIngest(
  jobService: JobService,
  _db: Database,
  files: FileService,
  metadata: MetadataService,
  metadataPolicy: MetadataPolicyService,
  metadataCanonical: MetadataCanonicalService,
  metadataRegistry: MetadataProviderRegistry,
  books: BooksService,
  audiobooks: AudiobooksService,
  music: MusicService,
  movies: MoviesService,
  coverPipeline: CoverPipeline,
  payload: MetadataIngestPayload,
  formatting?: MetadataFormattingService,
) {
  const {
    fileId,
    bookId,
    audiobookId,
    albumId,
    trackId,
    movieId,
    representationId,
    manifestationId,
    feyloreJobId,
    userId,
  } = payload;
  const signal = jobService.registerCancellation(feyloreJobId);

  try {
    await jobService.updateStatus(feyloreJobId, "running");

    if (audiobookId) {
      const result = await runAudiobookMetadataResolution(
        files,
        metadata,
        metadataPolicy,
        audiobooks,
        coverPipeline,
        {
          fileId,
          audiobookId,
          representationId,
          manifestationId: manifestationId!,
        },
        jobService,
        formatting,
      );
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: result.log.join(", "),
      });
      return;
    }

    if (movieId) {
      const result = await runMovieMetadataResolution(
        files,
        movies,
        {
          fileId,
          movieId,
          representationId,
          manifestationId: manifestationId!,
        },
        formatting,
      );
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: result.log.join(", "),
      });
      return;
    }

    if (albumId && trackId) {
      const resolvedManifestationId =
        manifestationId ?? (await music.getAlbumManifestationId(albumId));
      if (!resolvedManifestationId) {
        throw new Error("Album manifestation not found for metadata ingest");
      }

      const result = await runMusicMetadataResolution(
        files,
        metadata,
        metadataPolicy,
        music,
        coverPipeline,
        {
          fileId,
          albumId,
          trackId,
          representationId,
          manifestationId: resolvedManifestationId,
        },
        jobService,
        formatting,
      );
      await jobService.updateStatus(feyloreJobId, "completed", {
        logExcerpt: result.log.join(", "),
      });
      return;
    }

    if (!bookId) {
      throw new Error(
        "Metadata ingest requires bookId, audiobookId, albumId, or movieId",
      );
    }

    const result = await runBookMetadataResolution(
      files,
      metadata,
      metadataPolicy,
      metadataCanonical,
      metadataRegistry,
      books,
      coverPipeline,
      {
        fileId,
        bookId,
        representationId,
        manifestationId: manifestationId!,
        userId,
        mode: payload.mode ?? "ingest",
      },
      jobService,
      formatting,
    );

    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: result.log.join(", "),
    });
  } catch (err) {
    if (jobService.isCancelled(signal)) {
      await jobService.updateStatus(feyloreJobId, "cancelled");
    } else {
      await jobService.updateStatus(feyloreJobId, "failed", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  } finally {
    jobService.clearCancellation(feyloreJobId);
  }
}
