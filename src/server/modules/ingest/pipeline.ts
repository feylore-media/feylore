import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { AppConfig } from "../../config.js";
import type { IngestItemService } from "./item-service.js";
import type { IngestDomainRouter, DetectionHints } from "./domain-router.js";
import { extractMusicTagsFromFile } from "../metadata/extractors/music-tags.js";
import type { FileService } from "../files/service.js";
import type { LibraryService } from "../libraries/service.js";
import type { BooksService } from "../books/service.js";
import type { IngestContext } from "./domain-processor.js";
import { INGEST_UPLOAD_STAGING_PREFIX } from "../../../shared/ingest.js";
import { IngestFileLifecycle } from "./file-lifecycle.js";

export class IngestPipelineService {
  private readonly fileLifecycle = new IngestFileLifecycle();

  constructor(
    private readonly items: IngestItemService,
    private readonly router: IngestDomainRouter,
    private readonly files: FileService,
    private readonly libraries: LibraryService,
    private readonly books: BooksService,
    private readonly workerId: string,
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  async process(ingestItemId: string): Promise<void> {
    const item = await this.items.getById(ingestItemId);
    if (!item) return;

    if (item.terminalState || item.status === "completed") return;

    const claimed = await this.items.claim(ingestItemId, this.workerId);
    if (!claimed) return;

    const ctx: IngestContext = {
      ingestItemId,
      sourceStorageLocationId: item.sourceStorageLocationId,
      sourcePath: item.sourcePath,
      sourceChecksum: item.sourceChecksum,
      sourceSize: item.sourceSize ?? 0,
      originalFilename: item.originalFilename,
      fileId: item.fileId,
      targetLibraryId: item.targetLibraryId,
      userId: item.submittedByUserId,
      workType: item.workType,
      workId: item.workId,
      representationId: null,
      manifestationId: null,
      metadata: {},
    };

    try {
      await this.items.update(ingestItemId, {
        fileLifecycle: "processing",
        stageLogEntry: {
          stage: "analyzing",
          at: new Date().toISOString(),
          message: "Verifying source file",
        },
        progress: 10,
      });

      await this.files.loadStorageLocations();
      const adapter = this.files
        .getStorageService()
        .getAdapter(item.sourceStorageLocationId);

      const exists = await adapter.exists(item.sourcePath);
      if (!exists) {
        await this.fail(ingestItemId, "Source file not found");
        return;
      }

      const stat = await adapter.stat(item.sourcePath);
      if (stat.size === 0) {
        await this.fail(ingestItemId, "Source file is empty");
        return;
      }

      let fileId = item.fileId;
      if (!fileId) {
        fileId = await this.files.upsertDiscovered(item.sourceStorageLocationId, {
          relativePath: item.sourcePath,
          size: stat.size,
          mtime: stat.mtime,
        });
        ctx.fileId = fileId;
        await this.items.update(ingestItemId, { fileId });
      }

      await this.items.update(ingestItemId, {
        status: "identifying",
        stageLogEntry: {
          stage: "identifying",
          at: new Date().toISOString(),
          message: "Resolving destination library",
        },
        progress: 15,
      });

      let library = item.targetLibraryId
        ? await this.libraries.getById(item.targetLibraryId)
        : null;

      let contentTypeHint: string | null = null;
      if (!library && item.sourceIngestRootId) {
        const root = await this.db.query.ingestRoots.findFirst({
          where: eq(schema.ingestRoots.id, item.sourceIngestRootId),
        });
        contentTypeHint = root?.contentTypeHint ?? null;
        if (root?.defaultLibraryId) {
          library = await this.libraries.getById(root.defaultLibraryId);
        }
      }

      const detectionHints: DetectionHints = {
        libraryContentType: library?.contentType ?? null,
        contentTypeHint,
      };

      if (
        !detectionHints.libraryContentType &&
        !detectionHints.contentTypeHint
      ) {
        try {
          const tags = await extractMusicTagsFromFile(this.files, fileId);
          if (tags.album && tags.title) {
            detectionHints.contentTypeHint = "music";
          }
        } catch {
          // detection proceeds without tag hint
        }
      }

      await this.items.update(ingestItemId, {
        stageLogEntry: {
          stage: "identifying",
          at: new Date().toISOString(),
          message: "Detecting content type",
        },
        progress: 20,
      });

      const file = await this.files.getFile(fileId);
      const detection = this.router.detect(
        item.originalFilename,
        file.mediaType,
        detectionHints,
      );
      const processor = this.router.resolveProcessor(detection);

      if (!processor) {
        if (detection.confidence === "low") {
          await this.terminal(ingestItemId, "needs_attention", {
            error: "Could not confidently identify content type",
            detectedDomain: detection.domain,
            detectedContentType: detection.contentType,
          });
        } else {
          await this.terminal(ingestItemId, "unsupported", {
            error: "Unsupported content type",
            detectedDomain: detection.domain,
            detectedContentType: detection.contentType,
          });
        }
        return;
      }

      if (file.checksum || item.sourceChecksum) {
        const checksum = file.checksum ?? item.sourceChecksum!;
        const duplicate = await processor.findDuplicateByChecksum(checksum);
        if (duplicate) {
          await this.terminal(ingestItemId, "duplicate", {
            duplicateOfWorkType: duplicate.workType,
            duplicateOfWorkId: duplicate.workId,
            detectedDomain: processor.domain,
            error: `Duplicate of existing ${duplicate.workType}`,
          });
          return;
        }
      }

      if (!library) {
        library = await this.libraries.getDefaultBookLibrary();
      }
      if (!library && processor.domain === "book") {
        library = await this.libraries.ensureDefaultBookLibrary(
          this.config.LIBRARY_BOOKS_ROOT,
        );
      }
      if (!library && processor.domain === "audiobook") {
        library = await this.libraries.ensureDefaultAudiobookLibrary(
          this.config.LIBRARY_AUDIOBOOKS_ROOT,
        );
      }
      if (!library && processor.domain === "music") {
        library = await this.libraries.ensureDefaultMusicLibrary(
          this.config.LIBRARY_MUSIC_ROOT,
        );
      }
      if (!library) {
        await this.terminal(ingestItemId, "needs_attention", {
          error: "No destination library configured",
        });
        return;
      }

      ctx.targetLibraryId = library.id;
      await this.items.update(ingestItemId, {
        targetLibraryId: library.id,
        detectedDomain: processor.domain,
        detectedContentType: detection.contentType,
      });

      const identified = await processor.identify(ctx);
      const created = await processor.createWorkRepresentation(ctx, identified);

      ctx.workType = created.workType;
      ctx.workId = created.workId;
      ctx.representationId = created.representationId;
      ctx.manifestationId = created.manifestationId;

      await this.items.update(ingestItemId, {
        status: "metadata_resolved",
        workType: created.workType,
        workId: created.workId,
        stageLogEntry: {
          stage: "metadata_resolved",
          at: new Date().toISOString(),
          message: "Resolving metadata",
        },
        progress: 45,
      });

      await processor.resolveMetadata(ctx);

      if (processor.normalize) {
        await this.items.update(ingestItemId, {
          status: "normalizing",
          stageLogEntry: {
            stage: "normalizing",
            at: new Date().toISOString(),
            message: "Normalizing content",
          },
          progress: 65,
        });
        await processor.normalize(ctx);
      }

      await this.items.update(ingestItemId, {
        status: "organizing",
        fileLifecycle: "destination_prepared",
        stageLogEntry: {
          stage: "organizing",
          at: new Date().toISOString(),
          message: "Organizing into library",
        },
        progress: 80,
      });

      const organized = await processor.organize(ctx);

      await this.items.update(ingestItemId, {
        fileLifecycle: "destination_verified",
        stageLogEntry: {
          stage: "destination_verified",
          at: new Date().toISOString(),
          message: "Destination verified",
        },
      });

      await this.items.update(ingestItemId, {
        status: "completed",
        fileLifecycle: "source_retired",
        fileId: organized.fileId,
        destinationRelativePath: organized.destinationRelativePath,
        progress: 100,
        stageLogEntry: {
          stage: "completed",
          at: new Date().toISOString(),
          message: organized.log.join("; "),
        },
      });

      if (item.sourcePath.startsWith(`${INGEST_UPLOAD_STAGING_PREFIX}/`)) {
        const sourceAdapter = this.files
          .getStorageService()
          .getAdapter(item.sourceStorageLocationId);
        await this.fileLifecycle.cleanupUploadStagingDir(
          sourceAdapter,
          item.sourcePath,
        );
      }
    } catch (err) {
      await this.fail(
        ingestItemId,
        err instanceof Error ? err.message : "Processing failed",
      );
    }
  }

  private async fail(ingestItemId: string, error: string) {
    await this.terminal(ingestItemId, "failed", { error });
  }

  private async terminal(
    ingestItemId: string,
    terminalState: "failed" | "needs_attention" | "duplicate" | "unsupported",
    extra: {
      error?: string;
      detectedDomain?: string | null;
      detectedContentType?: string | null;
      duplicateOfWorkType?: string;
      duplicateOfWorkId?: string;
    },
  ) {
    await this.items.update(ingestItemId, {
      status: "completed",
      terminalState,
      error: extra.error ?? null,
      detectedDomain: extra.detectedDomain,
      detectedContentType: extra.detectedContentType,
      duplicateOfWorkType: extra.duplicateOfWorkType,
      duplicateOfWorkId: extra.duplicateOfWorkId,
      stageLogEntry: {
        stage: terminalState,
        at: new Date().toISOString(),
        message: extra.error ?? terminalState,
      },
    });
  }
}
