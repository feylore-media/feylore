import path from "node:path";
import {
  inferFormatFromPath,
  titleFromPath,
} from "../../../../shared/subject.js";
import type { MoviesService } from "../../movies/service.js";
import type { FileService } from "../../files/service.js";
import type { MetadataService } from "../../metadata/service.js";
import type { MetadataPolicyService } from "../../metadata/policy.js";
import type { CoverPipeline } from "../../metadata/cover.js";
import type { JobService } from "../../jobs/service.js";
import type { LibraryService } from "../../libraries/service.js";
import type { RepresentationService } from "../../representations/service.js";
import type { DetectionHints } from "../domain-router.js";
import type {
  DetectionResult,
  IdentificationResult,
  IngestContext,
  IngestDomainProcessor,
  MetadataResult,
  OrganizationResult,
} from "../domain-processor.js";
import { runMovieMetadataResolution } from "../../metadata/movie-metadata-resolution.js";
import type { ProcessingPolicyResolver } from "../../processing/policy-resolver.js";
import type { MetadataFormattingService } from "../../metadata/formatting.js";
import { organizeIngestFile } from "./processing-organize.js";
import { parseMovieFilename } from "../organizers/movies.js";
import { IngestFileLifecycle } from "../file-lifecycle.js";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".avi"]);

const VIDEO_MEDIA_HINTS = ["video/"];

export class MoviesIngestProcessor implements IngestDomainProcessor {
  readonly domain = "movies";
  private readonly fileLifecycle = new IngestFileLifecycle();

  constructor(
    private readonly movies: MoviesService,
    private readonly files: FileService,
    private readonly metadata: MetadataService,
    private readonly metadataPolicy: MetadataPolicyService,
    private readonly coverPipeline: CoverPipeline,
    private readonly libraries: LibraryService,
    private readonly representations: RepresentationService,
    private readonly jobs: JobService,
    private readonly processingPolicyResolver: ProcessingPolicyResolver,
    private readonly metadataFormatting: MetadataFormattingService,
  ) {}

  detect(
    filename: string,
    mediaType?: string | null,
    hints?: DetectionHints,
  ): DetectionResult {
    const ext = path.extname(filename).toLowerCase();
    const typedMovies =
      hints?.libraryContentType === "movies" ||
      hints?.contentTypeHint === "movies";

    if (typedMovies && VIDEO_EXTENSIONS.has(ext)) {
      return {
        domain: "movies",
        contentType: "movies",
        format: inferFormatFromPath(filename),
        confidence: "high",
      };
    }

    if (VIDEO_EXTENSIONS.has(ext)) {
      return {
        domain: "movies",
        contentType: "movies",
        format: inferFormatFromPath(filename),
        confidence: typedMovies ? "high" : "low",
      };
    }

    if (
      typedMovies &&
      mediaType &&
      VIDEO_MEDIA_HINTS.some((hint) => mediaType.includes(hint))
    ) {
      return {
        domain: "movies",
        contentType: "movies",
        format: inferFormatFromPath(filename),
        confidence: "high",
      };
    }

    return {
      domain: null,
      contentType: null,
      format: null,
      confidence: "none",
    };
  }

  canHandle(detection: DetectionResult): boolean {
    return detection.domain === "movies" && detection.confidence !== "none";
  }

  async findDuplicateByChecksum(
    checksum: string,
  ): Promise<{ workType: string; workId: string } | null> {
    return this.movies.findDuplicateMovieByChecksum(checksum);
  }

  async identify(ctx: IngestContext): Promise<IdentificationResult> {
    const format = inferFormatFromPath(ctx.originalFilename);
    const parsed = parseMovieFilename(ctx.originalFilename);
    let title = parsed.title || titleFromPath(ctx.originalFilename);

    ctx.metadata = {
      ...ctx.metadata,
      title,
      releaseDate: parsed.year,
    };

    return {
      workType: "movie",
      provisionalTitle: title,
      format,
    };
  }

  async createWorkRepresentation(
    ctx: IngestContext,
    identified: IdentificationResult,
  ) {
    if (!ctx.fileId) {
      throw new Error("Missing file for work representation");
    }

    const meta = ctx.metadata as { title?: string; releaseDate?: string };
    const created = await this.movies.createMovieRepresentation({
      fileId: ctx.fileId,
      title:
        meta.title ??
        identified.provisionalTitle ??
        titleFromPath(ctx.originalFilename),
      userId: ctx.userId ?? undefined,
      format: identified.format,
    });

    return {
      workType: "movie",
      workId: created.movieId,
      expressionId: created.expressionId,
      manifestationId: created.manifestationId,
      representationId: created.representationId,
    };
  }

  async resolveMetadata(ctx: IngestContext): Promise<MetadataResult> {
    const processingPolicy =
      await this.processingPolicyResolver.getPolicyForModule("movies");
    if (!processingPolicy.metadataProcessingEnabled) {
      const title = titleFromPath(ctx.originalFilename);
      ctx.metadata = { title };
      return {
        title,
        metadataLog: ["metadata-processing-disabled"],
      };
    }

    if (
      !ctx.fileId ||
      !ctx.workId ||
      !ctx.representationId ||
      !ctx.manifestationId
    ) {
      throw new Error("Movie identity not established before metadata resolution");
    }

    const result = await runMovieMetadataResolution(this.files, this.movies, {
      fileId: ctx.fileId,
      movieId: ctx.workId,
      representationId: ctx.representationId,
      manifestationId: ctx.manifestationId,
    }, this.metadataFormatting);

    const movie = await this.movies.getMovie(ctx.workId);
    ctx.metadata = {
      title: movie.title,
      releaseDate: movie.releaseDate,
    };

    return {
      title: movie.title,
      metadataLog: result.log,
    };
  }

  async organize(ctx: IngestContext): Promise<OrganizationResult> {
    if (!ctx.fileId || !ctx.targetLibraryId || !ctx.representationId) {
      throw new Error(
        "Missing file, library, or representation for organization",
      );
    }

    const library = await this.libraries.getById(ctx.targetLibraryId);
    if (!library?.storageLocationId) {
      throw new Error("Library has no storage location configured");
    }

    const meta = ctx.metadata as {
      title?: string;
      releaseDate?: string;
      authors?: string[];
    };

    return organizeIngestFile({
      ctx,
      moduleId: "movies",
      processingPolicyResolver: this.processingPolicyResolver,
      files: this.files,
      representations: this.representations,
      fileLifecycle: this.fileLifecycle,
      libraryStorageLocationId: library.storageLocationId,
      metadata: {
        title: meta.title ?? titleFromPath(ctx.originalFilename),
        publicationDate: meta.releaseDate,
        authors: meta.authors,
      },
      originalFilename: ctx.originalFilename,
    });
  }
}
