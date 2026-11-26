import path from "node:path";
import {
  inferFormatFromPath,
  titleFromPath,
} from "../../../../shared/subject.js";
import type { TvService } from "../../tv/service.js";
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
import { parseTvPath } from "../../tv/import-heuristics.js";
import type { ProcessingPolicyResolver } from "../../processing/policy-resolver.js";
import { organizeIngestFile } from "./processing-organize.js";
import { IngestFileLifecycle } from "../file-lifecycle.js";
import { VIDEO_EXTENSIONS } from "../../tv/service.js";

const VIDEO_MEDIA_HINTS = ["video/"];

export class TvIngestProcessor implements IngestDomainProcessor {
  readonly domain = "tv";
  private readonly fileLifecycle = new IngestFileLifecycle();

  constructor(
    private readonly tv: TvService,
    private readonly files: FileService,
    private readonly metadata: MetadataService,
    private readonly metadataPolicy: MetadataPolicyService,
    private readonly coverPipeline: CoverPipeline,
    private readonly libraries: LibraryService,
    private readonly representations: RepresentationService,
    private readonly jobs: JobService,
    private readonly processingPolicyResolver: ProcessingPolicyResolver,
  ) {}

  detect(
    filename: string,
    mediaType?: string | null,
    hints?: DetectionHints,
  ): DetectionResult {
    const ext = path.extname(filename).toLowerCase().replace(/^\./, "");
    const typedTv =
      hints?.libraryContentType === "tv" || hints?.contentTypeHint === "tv";
    const parsed = parseTvPath(filename);

    if (typedTv && VIDEO_EXTENSIONS.has(ext)) {
      return {
        domain: "tv",
        contentType: "tv",
        format: inferFormatFromPath(filename),
        confidence: parsed ? "high" : "low",
      };
    }

    if (parsed && VIDEO_EXTENSIONS.has(ext)) {
      return {
        domain: "tv",
        contentType: "tv",
        format: inferFormatFromPath(filename),
        confidence: "high",
      };
    }

    if (
      typedTv &&
      mediaType &&
      VIDEO_MEDIA_HINTS.some((hint) => mediaType.includes(hint))
    ) {
      return {
        domain: "tv",
        contentType: "tv",
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
    return detection.domain === "tv" && detection.confidence !== "none";
  }

  async findDuplicateByChecksum(
    checksum: string,
  ): Promise<{ workType: string; workId: string } | null> {
    void checksum;
    return null;
  }

  async identify(ctx: IngestContext): Promise<IdentificationResult> {
    const format = inferFormatFromPath(ctx.originalFilename);
    const parsed =
      parseTvPath(ctx.sourcePath) ?? parseTvPath(ctx.originalFilename);
    const title =
      parsed?.episodeTitle ??
      parsed?.showTitle ??
      titleFromPath(ctx.originalFilename);

    ctx.metadata = {
      ...ctx.metadata,
      title,
      showTitle: parsed?.showTitle,
      seasonNumber: parsed?.seasonNumber,
      episodeNumber: parsed?.episodeNumber,
    };

    return {
      workType: "tv_episode",
      provisionalTitle: title,
      format,
    };
  }

  async createWorkRepresentation(
    ctx: IngestContext,
    _identified: IdentificationResult,
  ) {
    if (!ctx.fileId) {
      throw new Error("Missing file for work representation");
    }

    const imported = await this.tv.importFiles(
      [ctx.fileId],
      ctx.userId ?? undefined,
    );
    const result = imported[0];
    if (!result?.episodeId || !result.representationId || !result.showId) {
      throw new Error(result?.reason ?? "TV import failed");
    }

    ctx.metadata = {
      ...ctx.metadata,
      showId: result.showId,
    };
    ctx.workId = result.episodeId;
    ctx.representationId = result.representationId;

    const wem = await this.tv.getEpisodeWemIds(result.episodeId);

    return {
      workType: "tv_episode",
      workId: result.episodeId,
      expressionId: wem.expressionId ?? "",
      manifestationId: wem.manifestationId,
      representationId: result.representationId,
    };
  }

  async resolveMetadata(ctx: IngestContext): Promise<MetadataResult> {
    const processingPolicy =
      await this.processingPolicyResolver.getPolicyForModule("tv");
    if (!processingPolicy.metadataProcessingEnabled) {
      const title = titleFromPath(ctx.originalFilename);
      ctx.metadata = { title };
      return {
        title,
        metadataLog: ["metadata-processing-disabled"],
      };
    }

    if (!ctx.workId) {
      throw new Error("TV identity not established before metadata resolution");
    }

    const episode = await this.tv.getEpisodeById(ctx.workId);

    return {
      title: episode.title,
      metadataLog: ["tv-metadata-stub"],
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

    const parsed =
      parseTvPath(ctx.sourcePath) ?? parseTvPath(ctx.originalFilename);
    if (!parsed || !ctx.workId) {
      throw new Error("TV path metadata missing for organization");
    }

    const episode = await this.tv.getEpisodeById(ctx.workId);
    const show = await this.tv.getShow(episode.showId);

    return organizeIngestFile({
      ctx,
      moduleId: "tv",
      processingPolicyResolver: this.processingPolicyResolver,
      files: this.files,
      representations: this.representations,
      fileLifecycle: this.fileLifecycle,
      libraryStorageLocationId: library.storageLocationId,
      metadata: {
        title: episode.title ?? parsed.episodeTitle,
        series: show.title,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber,
      },
      originalFilename: ctx.originalFilename,
    });
  }
}
