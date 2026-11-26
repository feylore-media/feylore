import path from "node:path";
import { and, eq, like, ne } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import * as schema from "../../../db/schema.js";
import {
  inferFormatFromPath,
  titleFromPath,
} from "../../../../shared/subject.js";
import {
  compareAudioFileSortKeys,
  type AudioFileSortKey,
} from "../../../../shared/audio-ingest.js";
import type { AudiobooksService } from "../../audiobooks/service.js";
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
import { runAudiobookMetadataResolution } from "../../metadata/audiobook-metadata-resolution.js";
import type { ProcessingPolicyResolver } from "../../processing/policy-resolver.js";
import type { MetadataFormattingService } from "../../metadata/formatting.js";
import { organizeIngestFile } from "./processing-organize.js";
import { IngestFileLifecycle } from "../file-lifecycle.js";
import { extractAudioTagsFromFile } from "../../metadata/extractors/audio-tags.js";

const AUDIOBOOK_HIGH_EXTENSIONS = new Set([".m4b"]);

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".flac",
  ".ogg",
  ".opus",
  ".aac",
  ".wav",
]);

const AUDIO_MEDIA_HINTS = ["audio/", "mpeg", "mp4"];

export class AudiobooksIngestProcessor implements IngestDomainProcessor {
  readonly domain = "audiobook";
  private readonly fileLifecycle = new IngestFileLifecycle();

  constructor(
    private readonly db: Database,
    private readonly audiobooks: AudiobooksService,
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
    const typedAudiobook =
      hints?.libraryContentType === "audiobook" ||
      hints?.contentTypeHint === "audiobook";

    if (typedAudiobook) {
      if (AUDIOBOOK_HIGH_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)) {
        return {
          domain: "audiobook",
          contentType: "audiobook",
          format: inferFormatFromPath(filename),
          confidence: "high",
        };
      }
      if (
        mediaType &&
        AUDIO_MEDIA_HINTS.some((hint) => mediaType.includes(hint))
      ) {
        return {
          domain: "audiobook",
          contentType: "audiobook",
          format: inferFormatFromPath(filename),
          confidence: "high",
        };
      }
    }

    if (AUDIOBOOK_HIGH_EXTENSIONS.has(ext)) {
      return {
        domain: "audiobook",
        contentType: "audiobook",
        format: inferFormatFromPath(filename),
        confidence: "high",
      };
    }

    if (AUDIO_EXTENSIONS.has(ext)) {
      return {
        domain: "audiobook",
        contentType: "audiobook",
        format: inferFormatFromPath(filename),
        confidence: "low",
      };
    }

    if (
      mediaType &&
      AUDIO_MEDIA_HINTS.some((hint) => mediaType.includes(hint))
    ) {
      return {
        domain: "audiobook",
        contentType: "audiobook",
        format: inferFormatFromPath(filename),
        confidence: "low",
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
    return detection.domain === "audiobook" && detection.confidence !== "none";
  }

  async findDuplicateByChecksum(
    checksum: string,
  ): Promise<{ workType: string; workId: string } | null> {
    return this.audiobooks.findDuplicateAudiobookByChecksum(checksum);
  }

  async identify(ctx: IngestContext): Promise<IdentificationResult> {
    const format = inferFormatFromPath(ctx.originalFilename);
    let title = titleFromPath(ctx.originalFilename);

    if (ctx.fileId) {
      try {
        const tags = await extractAudioTagsFromFile(this.files, ctx.fileId);
        if (tags.title) title = tags.title;
      } catch {
        // provisional title from filename is fine
      }
    }

    return {
      workType: "audiobook",
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

    const created = await this.audiobooks.createAudiobookRepresentation({
      fileId: ctx.fileId,
      title:
        identified.provisionalTitle ?? titleFromPath(ctx.originalFilename),
      userId: ctx.userId ?? undefined,
      format: identified.format,
      sortOrder: 0,
    });

    await this.linkSiblingAudioFiles(ctx, created.representationId);

    return {
      workType: "audiobook",
      workId: created.audiobookId,
      expressionId: created.expressionId,
      manifestationId: created.manifestationId,
      representationId: created.representationId,
    };
  }

  /**
   * Same-directory multi-file heuristic: link sibling audio files with
   * deterministic ordering (disc → track → filename).
   */
  private async linkSiblingAudioFiles(
    ctx: IngestContext,
    representationId: string,
  ) {
    if (!ctx.fileId) return;

    const primary = await this.files.getFile(ctx.fileId);
    const dir = path.posix.dirname(primary.relativePath);
    if (!dir || dir === ".") return;

    const prefix = `${dir}/`;
    const rows = await this.db
      .select()
      .from(schema.files)
      .where(
        and(
          eq(schema.files.storageLocationId, primary.storageLocationId),
          like(schema.files.relativePath, `${prefix}%`),
          ne(schema.files.id, primary.id),
        ),
      );

    const siblings: Array<AudioFileSortKey & { fileId: string }> = [];

    for (const row of rows) {
      const ext = path.extname(row.relativePath).toLowerCase();
      if (!AUDIOBOOK_HIGH_EXTENSIONS.has(ext) && !AUDIO_EXTENSIONS.has(ext)) {
        continue;
      }

      const filename = path.basename(row.relativePath);
      let sortKey: AudioFileSortKey = { filename };
      try {
        const tags = await extractAudioTagsFromFile(this.files, row.id);
        sortKey = {
          filename,
          discNumber: tags.discNumber,
          trackNumber: tags.trackNumber,
        };
      } catch {
        // filename-only sort key
      }
      siblings.push({ ...sortKey, fileId: row.id });
    }

    siblings.sort(compareAudioFileSortKeys);

    let sortOrder = 1;
    for (const sibling of siblings) {
      const existing = await this.representations.findByFileId(sibling.fileId);
      if (existing.length > 0) continue;
      await this.representations.linkFile(
        representationId,
        sibling.fileId,
        "content",
        sortOrder++,
      );
    }
  }

  async resolveMetadata(ctx: IngestContext): Promise<MetadataResult> {
    const processingPolicy =
      await this.processingPolicyResolver.getPolicyForModule("audiobooks");
    if (!processingPolicy.metadataProcessingEnabled) {
      const title = titleFromPath(ctx.originalFilename);
      ctx.metadata = { title, authors: [] };
      return {
        title,
        authors: [],
        metadataLog: ["metadata-processing-disabled"],
      };
    }

    if (
      !ctx.fileId ||
      !ctx.workId ||
      !ctx.representationId ||
      !ctx.manifestationId
    ) {
      throw new Error(
        "Audiobook identity not established before metadata resolution",
      );
    }

    const result = await runAudiobookMetadataResolution(
      this.files,
      this.metadata,
      this.metadataPolicy,
      this.audiobooks,
      this.coverPipeline,
      {
        fileId: ctx.fileId,
        audiobookId: ctx.workId,
        representationId: ctx.representationId,
        manifestationId: ctx.manifestationId,
      },
      this.jobs,
      this.metadataFormatting,
    );

    const audiobook = await this.audiobooks.getAudiobook(ctx.workId);
    const authors = await this.audiobooks.getAuthorNames(ctx.workId);
    const narrators = await this.audiobooks.getNarratorNames(ctx.workId);
    const seriesInfo = await this.audiobooks.getSeriesForAudiobook(ctx.workId);

    ctx.metadata = {
      title: result.merged.title ?? audiobook.title,
      authors,
      narrators,
      series: seriesInfo?.name,
    };

    return {
      title: result.merged.title,
      authors,
      series: seriesInfo?.name,
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
      authors?: string[];
      series?: string;
      seriesNumber?: string | number;
      publicationDate?: string;
    };

    return organizeIngestFile({
      ctx,
      moduleId: "audiobooks",
      processingPolicyResolver: this.processingPolicyResolver,
      files: this.files,
      representations: this.representations,
      fileLifecycle: this.fileLifecycle,
      libraryStorageLocationId: library.storageLocationId,
      metadata: {
        title: meta.title ?? titleFromPath(ctx.originalFilename),
        authors: meta.authors,
        series: meta.series,
        seriesNumber: meta.seriesNumber,
        publicationDate: meta.publicationDate,
      },
      originalFilename: ctx.originalFilename,
    });
  }
}
