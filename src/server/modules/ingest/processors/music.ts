import path from "node:path";
import {
  inferFormatFromPath,
  titleFromPath,
} from "../../../../shared/subject.js";
import type { MusicService } from "../../music/service.js";
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
import { runMusicMetadataResolution } from "../../metadata/music-metadata-resolution.js";
import type { ProcessingPolicyResolver } from "../../processing/policy-resolver.js";
import type { MetadataFormattingService } from "../../metadata/formatting.js";
import { organizeIngestFile } from "./processing-organize.js";
import { IngestFileLifecycle } from "../file-lifecycle.js";
import { extractMusicTagsFromFile } from "../../metadata/extractors/music-tags.js";

const MUSIC_EXTENSIONS = new Set([
  ".mp3",
  ".flac",
  ".m4a",
  ".ogg",
  ".opus",
  ".aac",
  ".wav",
]);

const AUDIO_MEDIA_HINTS = ["audio/", "mpeg", "mp4"];

export class MusicIngestProcessor implements IngestDomainProcessor {
  readonly domain = "music";
  private readonly fileLifecycle = new IngestFileLifecycle();

  constructor(
    private readonly music: MusicService,
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

    if (ext === ".m4b") {
      return {
        domain: null,
        contentType: null,
        format: null,
        confidence: "none",
      };
    }

    const typedMusic =
      hints?.libraryContentType === "music" ||
      hints?.contentTypeHint === "music";

    if (MUSIC_EXTENSIONS.has(ext)) {
      return {
        domain: "music",
        contentType: "music",
        format: inferFormatFromPath(filename),
        confidence: typedMusic ? "high" : "high",
      };
    }

    if (typedMusic) {
      return {
        domain: "music",
        contentType: "music",
        format: inferFormatFromPath(filename),
        confidence: "high",
      };
    }

    if (
      mediaType &&
      AUDIO_MEDIA_HINTS.some((hint) => mediaType.includes(hint))
    ) {
      return {
        domain: "music",
        contentType: "music",
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
    return detection.domain === "music" && detection.confidence !== "none";
  }

  async findDuplicateByChecksum(
    checksum: string,
  ): Promise<{ workType: string; workId: string } | null> {
    return this.music.findDuplicateAlbumByChecksum(checksum);
  }

  async identify(ctx: IngestContext): Promise<IdentificationResult> {
    const format = inferFormatFromPath(ctx.originalFilename);
    let title = titleFromPath(ctx.originalFilename);
    let albumTitle: string | undefined;
    let artistNames: string[] | undefined;

    if (ctx.fileId) {
      try {
        const tags = await extractMusicTagsFromFile(this.files, ctx.fileId);
        if (tags.title) title = tags.title;
        if (tags.album) albumTitle = tags.album;
        artistNames =
          tags.artists ??
          (tags.albumArtist ? [tags.albumArtist] : undefined);
      } catch {
        // provisional title from filename is fine
      }
    }

    ctx.metadata = {
      ...ctx.metadata,
      trackTitle: title,
      albumTitle,
      artists: artistNames,
    };

    return {
      workType: "album",
      provisionalTitle: albumTitle ?? title,
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

    const meta = ctx.metadata as {
      trackTitle?: string;
      albumTitle?: string;
      artists?: string[];
    };

    const created = await this.music.ingestFileForPipeline({
      fileId: ctx.fileId,
      trackTitle:
        meta.trackTitle ??
        identified.provisionalTitle ??
        titleFromPath(ctx.originalFilename),
      albumTitle: meta.albumTitle ?? identified.provisionalTitle,
      artistNames: meta.artists,
      userId: ctx.userId ?? undefined,
      format: identified.format,
    });

    return {
      workType: "album",
      workId: created.albumId,
      expressionId: created.expressionId,
      manifestationId: created.manifestationId,
      representationId: created.representationId,
    };
  }

  async resolveMetadata(ctx: IngestContext): Promise<MetadataResult> {
    const processingPolicy =
      await this.processingPolicyResolver.getPolicyForModule("music");
    if (!processingPolicy.metadataProcessingEnabled) {
      const title = titleFromPath(ctx.originalFilename);
      ctx.metadata = { title, artists: [] };
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
      throw new Error("Music identity not established before metadata resolution");
    }

    const trackId = await this.music.findTrackIdForRepresentation(
      ctx.representationId,
    );
    if (!trackId) {
      throw new Error("Track not found for music representation");
    }

    const result = await runMusicMetadataResolution(
      this.files,
      this.metadata,
      this.metadataPolicy,
      this.music,
      this.coverPipeline,
      {
        fileId: ctx.fileId,
        albumId: ctx.workId,
        trackId,
        representationId: ctx.representationId,
        manifestationId: ctx.manifestationId,
      },
      this.jobs,
      this.metadataFormatting,
    );

    const album = await this.music.getAlbum(ctx.workId);
    const artists = await this.music.getAlbumArtistNames(ctx.workId);

    ctx.metadata = {
      title: result.merged.title ?? album.title,
      albumTitle: result.album ?? album.title,
      trackTitle: (ctx.metadata as { trackTitle?: string }).trackTitle,
      artists,
    };

    return {
      title: result.merged.title,
      authors: artists,
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
      albumTitle?: string;
      trackTitle?: string;
      artists?: string[];
      trackNumber?: string | number;
      publicationDate?: string;
    };

    return organizeIngestFile({
      ctx,
      moduleId: "music",
      processingPolicyResolver: this.processingPolicyResolver,
      files: this.files,
      representations: this.representations,
      fileLifecycle: this.fileLifecycle,
      libraryStorageLocationId: library.storageLocationId,
      metadata: {
        title: meta.trackTitle ?? meta.title ?? titleFromPath(ctx.originalFilename),
        authors: meta.artists,
        series: meta.albumTitle ?? meta.title,
        trackNumber: meta.trackNumber,
        publicationDate: meta.publicationDate,
      },
      originalFilename: ctx.originalFilename,
    });
  }
}
