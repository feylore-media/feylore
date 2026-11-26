import path from "node:path";
import {
  inferFormatFromPath,
  titleFromPath,
} from "../../../../shared/subject.js";
import type { BooksService } from "../../books/service.js";
import type { FileService } from "../../files/service.js";
import type { MetadataService } from "../../metadata/service.js";
import type { MetadataPolicyService } from "../../metadata/policy.js";
import type { MetadataCanonicalService } from "../../metadata/canonical.js";
import type { MetadataProviderRegistry } from "../../metadata/registry.js";
import type { CoverPipeline } from "../../metadata/cover.js";
import type { JobService } from "../../jobs/service.js";
import type { LibraryService } from "../../libraries/service.js";
import type { RepresentationService } from "../../representations/service.js";
import type {
  DetectionResult,
  IdentificationResult,
  IngestContext,
  IngestDomainProcessor,
  MetadataResult,
  NormalizationResult,
  OrganizationResult,
} from "../domain-processor.js";
import { runBookMetadataResolution } from "../../metadata/book-metadata-resolution.js";
import { normalizeEpubFile } from "../normalizers/epub.js";
import {
  buildInPlaceDestinationPath,
} from "../organizers/books.js";
import { IngestFileLifecycle } from "../file-lifecycle.js";
import type { ProcessingPolicyResolver } from "../../processing/policy-resolver.js";
import type { MetadataFormattingService } from "../../metadata/formatting.js";
import { resolveProcessingModuleFromFilename } from "../../processing/policy-resolver.js";

const BOOK_EXTENSIONS = new Set([
  ".epub",
  ".pdf",
  ".cbz",
  ".cbr",
  ".mobi",
  ".azw3",
]);

export class BooksIngestProcessor implements IngestDomainProcessor {
  readonly domain = "book";
  private readonly fileLifecycle = new IngestFileLifecycle();

  constructor(
    private readonly books: BooksService,
    private readonly files: FileService,
    private readonly metadata: MetadataService,
    private readonly metadataPolicy: MetadataPolicyService,
    private readonly metadataCanonical: MetadataCanonicalService,
    private readonly metadataRegistry: MetadataProviderRegistry,
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
    _hints?: import("../domain-router.js").DetectionHints,
  ): DetectionResult {
    const ext = path.extname(filename).toLowerCase();
    if (BOOK_EXTENSIONS.has(ext)) {
      return {
        domain: "book",
        contentType: "book",
        format: inferFormatFromPath(filename),
        confidence: "high",
      };
    }
    if (mediaType?.includes("epub") || mediaType?.includes("pdf")) {
      return {
        domain: "book",
        contentType: "book",
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
    return detection.domain === "book" && detection.confidence !== "none";
  }

  async findDuplicateByChecksum(
    checksum: string,
  ): Promise<{ workType: string; workId: string } | null> {
    return this.books.findDuplicateBookByChecksum(checksum);
  }

  async identify(ctx: IngestContext): Promise<IdentificationResult> {
    const format = inferFormatFromPath(ctx.originalFilename);
    const title = titleFromPath(ctx.originalFilename);
    return {
      workType: "book",
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
    const created = await this.books.createBookRepresentation({
      fileId: ctx.fileId,
      title:
        identified.provisionalTitle ?? titleFromPath(ctx.originalFilename),
      userId: ctx.userId ?? undefined,
    });
    return {
      workType: "book",
      workId: created.bookId,
      expressionId: created.expressionId,
      manifestationId: created.manifestationId,
      representationId: created.representationId,
    };
  }

  async resolveMetadata(ctx: IngestContext): Promise<MetadataResult> {
    const moduleId =
      resolveProcessingModuleFromFilename(ctx.originalFilename, "book") ??
      "books";
    const processingPolicy =
      await this.processingPolicyResolver.getPolicyForModule(moduleId);

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
      throw new Error("Book identity not established before metadata resolution");
    }

    const result = await runBookMetadataResolution(
      this.files,
      this.metadata,
      this.metadataPolicy,
      this.metadataCanonical,
      this.metadataRegistry,
      this.books,
      this.coverPipeline,
      {
        fileId: ctx.fileId,
        bookId: ctx.workId,
        representationId: ctx.representationId,
        manifestationId: ctx.manifestationId,
      },
      this.jobs,
      this.metadataFormatting,
    );

    const book = await this.books.getBook(ctx.workId);
    const authors = await this.books.getAuthorNames(ctx.workId);
    const seriesInfo = await this.books.getSeriesForBook(ctx.workId);
    const seriesName = seriesInfo?.name;

    ctx.metadata = {
      title: result.merged.title ?? book.title,
      authors,
      series: seriesName,
    };

    return {
      title: result.merged.title,
      authors,
      series: seriesName,
      metadataLog: result.log,
    };
  }

  async normalize(ctx: IngestContext): Promise<NormalizationResult> {
    if (!ctx.fileId || !ctx.targetLibraryId) {
      return { skipped: true, log: ["normalization-skipped-no-library"] };
    }

    const moduleId =
      resolveProcessingModuleFromFilename(ctx.originalFilename, "book") ??
      "books";

    const file = await this.files.getFile(ctx.fileId);
    const archiveLog = await this.processingPolicyResolver.archiveOriginalIfEnabled(
      {
        moduleId,
        files: this.files,
        sourceStorageLocationId: file.storageLocationId,
        sourceRelativePath: file.relativePath,
        archiveBasename: path.basename(
          file.relativePath,
          path.extname(file.relativePath),
        ),
      },
    );

    const processingPolicy =
      await this.processingPolicyResolver.getPolicyForModule(moduleId);

    if (processingPolicy.readAlong?.enabled) {
      archiveLog.push("read-along-enqueued-when-available");
    }

    if (moduleId !== "books") {
      return {
        skipped: true,
        log: [...archiveLog, "normalization-skipped-comics"],
      };
    }

    if (!processingPolicy.conversion.enabled) {
      return {
        skipped: true,
        log: [...archiveLog, "normalization-disabled"],
      };
    }

    const library = await this.libraries.getById(ctx.targetLibraryId);
    const policy = library?.normalizationPolicy?.epub;
    if (!policy?.enabled) {
      return {
        skipped: true,
        log: [...archiveLog, "normalization-disabled"],
      };
    }

    const format = inferFormatFromPath(ctx.originalFilename);
    if (format !== "epub") {
      return {
        skipped: true,
        log: [...archiveLog, "normalization-not-epub"],
      };
    }

    const adapter = this.files
      .getStorageService()
      .getAdapter(file.storageLocationId);

    const result = await normalizeEpubFile(adapter, file.relativePath);
    return {
      normalizedPath: result.normalizedPath,
      log: [...archiveLog, ...result.log],
    };
  }

  async organize(ctx: IngestContext): Promise<OrganizationResult> {
    if (!ctx.fileId || !ctx.targetLibraryId || !ctx.representationId) {
      throw new Error("Missing file, library, or representation for organization");
    }

    const library = await this.libraries.getById(ctx.targetLibraryId);
    if (!library?.storageLocationId) {
      throw new Error("Library has no storage location configured");
    }

    const moduleId =
      resolveProcessingModuleFromFilename(ctx.originalFilename, "book") ??
      "books";
    const processingPolicy =
      await this.processingPolicyResolver.getPolicyForModule(moduleId);

    const sourceFile = await this.files.getFile(ctx.fileId);
    const sourceAdapter = this.files
      .getStorageService()
      .getAdapter(sourceFile.storageLocationId);
    const destAdapter = this.files
      .getStorageService()
      .getAdapter(library.storageLocationId);

    const meta = ctx.metadata as {
      title?: string;
      authors?: string[];
      series?: string;
      seriesNumber?: string | number;
      publicationDate?: string;
    };

    const ext = path.extname(ctx.originalFilename).replace(/^\./, "") || "bin";

    const destRelative = processingPolicy.fileOperations.organizeIntoLibrary
      ? this.processingPolicyResolver.buildOrganizePath({
          moduleId,
          policy: processingPolicy,
          metadata: {
            title: meta.title ?? titleFromPath(ctx.originalFilename),
            authors: meta.authors,
            series: meta.series,
            seriesNumber: meta.seriesNumber,
            publicationDate: meta.publicationDate,
          },
          originalFilename: ctx.originalFilename,
          extension: ext,
        })
      : buildInPlaceDestinationPath(ctx.originalFilename);

    const sameLocation =
      sourceFile.storageLocationId === library.storageLocationId;

    if (sameLocation && sourceFile.relativePath === destRelative) {
      return {
        destinationRelativePath: destRelative,
        fileId: ctx.fileId,
        log: ["already-at-destination"],
      };
    }

    await this.fileLifecycle.verifySource(
      sourceAdapter,
      sourceFile.relativePath,
      sourceFile.size,
      sourceFile.checksum ?? undefined,
    );

    const commit = await this.fileLifecycle.moveToDestination(
      sourceAdapter,
      destAdapter,
      sourceFile.relativePath,
      destRelative,
      sameLocation,
    );

    await this.fileLifecycle.retireSource(
      sourceAdapter,
      sourceFile.relativePath,
      commit,
    );

    let resultFileId = ctx.fileId;

    if (sameLocation) {
      await this.files.updateFilePath(ctx.fileId, destRelative, {
        checksum: commit.checksum,
        size: commit.size,
      });
    } else {
      const newFileId = await this.files.registerFileAtLocation({
        storageLocationId: library.storageLocationId,
        relativePath: destRelative,
        size: commit.size,
        checksum: commit.checksum,
        mediaType: sourceFile.mediaType ?? undefined,
      });
      await this.representations.relinkContentFile(
        ctx.representationId,
        ctx.fileId,
        newFileId,
      );
      await this.files.removeFileRecord(ctx.fileId);
      resultFileId = newFileId;
    }

    return {
      destinationRelativePath: destRelative,
      fileId: resultFileId,
      log: [`organized-to:${destRelative}`],
    };
  }
}
