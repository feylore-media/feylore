import { eq, isNull } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { AppConfig } from "../../config.js";
import type { JobService } from "../jobs/service.js";
import { JOB_TYPES } from "../jobs/types.js";
import { generateId } from "../../security/crypto.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  INGEST_TEMP_FILE_PATTERNS,
  INGEST_UPLOAD_STAGING_PREFIX,
} from "../../../shared/ingest.js";
import { IngestItemService } from "./item-service.js";
import { IngestPipelineService } from "./pipeline.js";
import { IngestDomainRouter } from "./domain-router.js";
import { BooksIngestProcessor } from "./processors/books.js";
import { MusicIngestProcessor } from "./processors/music.js";
import { MoviesIngestProcessor } from "./processors/movies.js";
import { TvIngestProcessor } from "./processors/tv.js";
import { AudiobooksIngestProcessor } from "./processors/audiobooks.js";
import type { BooksService } from "../books/service.js";
import type { AudiobooksService } from "../audiobooks/service.js";
import type { MusicService } from "../music/service.js";
import type { MoviesService } from "../movies/service.js";
import type { TvService } from "../tv/service.js";
import type { FileService } from "../files/service.js";
import type { MetadataService } from "../metadata/service.js";
import type { MetadataPolicyService } from "../metadata/policy.js";
import type { MetadataCanonicalService } from "../metadata/canonical.js";
import type { MetadataProviderRegistry } from "../metadata/registry.js";
import type { CoverPipeline } from "../metadata/cover.js";
import type { LibraryService } from "../libraries/service.js";
import type { RepresentationService } from "../representations/service.js";
import type { ProcessingPolicyResolver } from "../processing/policy-resolver.js";
import type { MetadataFormattingService } from "../metadata/formatting.js";
import { IngestWatcher } from "./watcher.js";
import { recoverIncompleteIngestItems } from "./recovery.js";
import { SystemSettingsService } from "../settings/system-service.js";

export class IngestService {
  readonly items: IngestItemService;
  private readonly router: IngestDomainRouter;
  private pipeline: IngestPipelineService | null = null;
  private watcher: IngestWatcher | null = null;
  private readonly workerId: string;

  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
    private readonly jobs: JobService,
    private readonly files: FileService,
    private readonly books: BooksService,
    private readonly audiobooks: AudiobooksService,
    private readonly music: MusicService,
    private readonly movies: MoviesService,
    private readonly tv: TvService,
    private readonly metadata: MetadataService,
    private readonly metadataPolicy: MetadataPolicyService,
    private readonly metadataCanonical: MetadataCanonicalService,
    private readonly metadataRegistry: MetadataProviderRegistry,
    private readonly coverPipeline: CoverPipeline,
    private readonly libraries: LibraryService,
    private readonly representations: RepresentationService,
    private readonly processingPolicyResolver: ProcessingPolicyResolver,
    private readonly metadataFormatting: MetadataFormattingService,
  ) {
    this.items = new IngestItemService(db, config);
    const booksProcessor = new BooksIngestProcessor(
      books,
      files,
      metadata,
      metadataPolicy,
      metadataCanonical,
      metadataRegistry,
      coverPipeline,
      libraries,
      representations,
      jobs,
      processingPolicyResolver,
      metadataFormatting,
    );
    const musicProcessor = new MusicIngestProcessor(
      music,
      files,
      metadata,
      metadataPolicy,
      coverPipeline,
      libraries,
      representations,
      jobs,
      processingPolicyResolver,
      metadataFormatting,
    );
    const moviesProcessor = new MoviesIngestProcessor(
      movies,
      files,
      metadata,
      metadataPolicy,
      coverPipeline,
      libraries,
      representations,
      jobs,
      processingPolicyResolver,
      metadataFormatting,
    );
    const tvProcessor = new TvIngestProcessor(
      tv,
      files,
      metadata,
      metadataPolicy,
      coverPipeline,
      libraries,
      representations,
      jobs,
      processingPolicyResolver,
    );
    const audiobooksProcessor = new AudiobooksIngestProcessor(
      db,
      audiobooks,
      files,
      metadata,
      metadataPolicy,
      coverPipeline,
      libraries,
      representations,
      jobs,
      processingPolicyResolver,
      metadataFormatting,
    );
    this.router = new IngestDomainRouter([
      booksProcessor,
      musicProcessor,
      moviesProcessor,
      tvProcessor,
      audiobooksProcessor,
    ]);
    this.workerId = `worker-${process.pid}`;
  }

  getPipeline(): IngestPipelineService {
    if (!this.pipeline) {
      this.pipeline = new IngestPipelineService(
        this.items,
        this.router,
        this.files,
        this.libraries,
        this.books,
        this.workerId,
        this.db,
        this.config,
      );
    }
    return this.pipeline;
  }

  async enqueueProcess(ingestItemId: string) {
    await this.jobs.getBoss().send(JOB_TYPES.INGEST_PROCESS, { ingestItemId });
  }

  async listRoots() {
    return this.db.select().from(schema.ingestRoots);
  }

  async getRoot(id: string) {
    const row = await this.db.query.ingestRoots.findFirst({
      where: eq(schema.ingestRoots.id, id),
    });
    if (!row) throw new NotFoundError("Ingest root not found");
    return row;
  }

  async createRoot(input: {
    name: string;
    storageLocationId: string;
    enabled?: boolean;
    recursive?: boolean;
    contentTypeHint?: string;
    defaultLibraryId?: string;
  }) {
    const id = generateId();
    await this.db.insert(schema.ingestRoots).values({
      id,
      name: input.name,
      storageLocationId: input.storageLocationId,
      enabled: input.enabled ?? true,
      recursive: input.recursive ?? true,
      contentTypeHint: input.contentTypeHint,
      defaultLibraryId: input.defaultLibraryId,
    });
    await this.reloadWatcher();
    return id;
  }

  async updateRoot(
    id: string,
    patch: Partial<{
      name: string;
      enabled: boolean;
      recursive: boolean;
      contentTypeHint: string | null;
      defaultLibraryId: string | null;
    }>,
  ) {
    await this.getRoot(id);
    await this.db
      .update(schema.ingestRoots)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.ingestRoots.id, id));
    await this.reloadWatcher();
  }

  async deleteRoot(id: string) {
    await this.getRoot(id);
    await this.db
      .delete(schema.ingestRoots)
      .where(eq(schema.ingestRoots.id, id));
    await this.reloadWatcher();
  }

  async reloadWatcher() {
    if (!this.watcher) return;
    await this.watcher.stop();
    await this.watcher.start();
  }

  isTempFile(filename: string): boolean {
    return INGEST_TEMP_FILE_PATTERNS.some((re) => re.test(filename));
  }

  async reconcileFilesystemFile(params: {
    ingestRootId: string;
    storageLocationId: string;
    relativePath: string;
    originalFilename: string;
    checksum?: string;
    size?: number;
    mtime?: Date;
  }) {
    const sourceIdentity = this.items.buildSourceIdentity({
      sourceKind: "filesystem",
      ingestRootId: params.ingestRootId,
      relativePath: params.relativePath,
    });

    const root = await this.getRoot(params.ingestRootId);

    const result = await this.items.reconcileDiscovered({
      sourceKind: "filesystem",
      sourceIdentity,
      sourcePath: params.relativePath,
      sourceStorageLocationId: params.storageLocationId,
      sourceIngestRootId: params.ingestRootId,
      originalFilename: params.originalFilename,
      sourceChecksum: params.checksum,
      sourceSize: params.size,
      sourceMtime: params.mtime,
      targetLibraryId: root.defaultLibraryId,
    });

    if (result.enqueued) {
      await this.enqueueProcess(result.item.id);
    }

    return result;
  }

  async reconcileUpload(params: {
    uploadId: string;
    storageLocationId: string;
    relativePath: string;
    originalFilename: string;
    size: number;
    checksum: string;
    userId?: string;
  }) {
    const sourceIdentity = this.items.buildSourceIdentity({
      sourceKind: "upload",
      uploadId: params.uploadId,
      relativePath: params.relativePath,
    });

    const defaultLibrary = await this.libraries.getDefaultBookLibrary();

    const result = await this.items.reconcileDiscovered({
      sourceKind: "upload",
      sourceIdentity,
      sourcePath: params.relativePath,
      sourceStorageLocationId: params.storageLocationId,
      originalFilename: params.originalFilename,
      sourceChecksum: params.checksum,
      sourceSize: params.size,
      submittedByUserId: params.userId,
      targetLibraryId: defaultLibrary?.id,
    });

    if (result.enqueued) {
      await this.enqueueProcess(result.item.id);
    }

    return result;
  }

  getUploadStagingDir(uploadId: string): string {
    return path.posix.join(INGEST_UPLOAD_STAGING_PREFIX, uploadId);
  }

  async storeUploadFile(params: {
    uploadId: string;
    filename: string;
    data: Buffer;
    storageLocationId: string;
  }) {
    const safeName = path.basename(params.filename);
    const relativePath = path.posix.join(
      this.getUploadStagingDir(params.uploadId),
      safeName,
    );
    const adapter = this.files
      .getStorageService()
      .getAdapter(params.storageLocationId);
    await adapter.write(relativePath, params.data);
    const checksum = createHash("sha256").update(params.data).digest("hex");
    return { relativePath, checksum, size: params.data.length, safeName };
  }

  async startWorkerSideEffects() {
    await recoverIncompleteIngestItems(this.items, (id) =>
      this.enqueueProcess(id),
    );
    this.watcher = new IngestWatcher(this, this.db, this.files);
    await this.watcher.start();
  }

  async stopWorkerSideEffects() {
    await this.watcher?.stop();
  }

  getUploadLimits() {
    return {
      maxUploadBytes: this.config.MAX_UPLOAD_BYTES,
      maxUploadFiles: this.config.MAX_UPLOAD_FILES,
    };
  }
}

export async function bootstrapIngestStorage(
  db: Database,
  config: AppConfig,
  files: FileService,
  libraries: LibraryService,
) {
  await files.loadStorageLocations();
  let existing = await db.select().from(schema.storageLocations);

  const ensureManagedLocation = async (
    rootPath: string,
    name: string,
    options?: { watchEnabled?: boolean },
  ): Promise<string> => {
    const resolved = path.resolve(rootPath);
    await fs.mkdir(resolved, { recursive: true });
    const match = existing.find((l) => path.resolve(l.rootPath) === resolved);
    if (match) return match.id;

    const id = generateId();
    await db.insert(schema.storageLocations).values({
      id,
      name,
      kind: "managed",
      rootPath: resolved,
      watchEnabled: options?.watchEnabled ?? false,
    });
    existing = await db.select().from(schema.storageLocations);
    return id;
  };

  await ensureManagedLocation(config.STORAGE_ROOT, "Application Storage");

  const ingestRootPath = config.INGEST_ROOT;
  const enabled = await new SystemSettingsService(db).getEnabledModules();
  const defaultLib = enabled.includes("books")
    ? await libraries.ensureDefaultBookLibrary(config.LIBRARY_BOOKS_ROOT)
    : null;
  if (enabled.includes("audiobooks")) {
    await libraries.ensureDefaultAudiobookLibrary(
      config.LIBRARY_AUDIOBOOKS_ROOT,
    );
  }

  let ingestStorageId: string | undefined;

  if (ingestRootPath) {
    ingestStorageId = await ensureManagedLocation(ingestRootPath, "Ingest", {
      watchEnabled: true,
    });
  }

  if (defaultLib) {
    await db
      .update(schema.ingestRoots)
      .set({ defaultLibraryId: defaultLib.id, updatedAt: new Date() })
      .where(isNull(schema.ingestRoots.defaultLibraryId));
  }

  if (ingestStorageId) {
    const root = await db.query.ingestRoots.findFirst({
      where: eq(schema.ingestRoots.storageLocationId, ingestStorageId),
    });
    if (!root) {
      const rootId = generateId();
      await db.insert(schema.ingestRoots).values({
        id: rootId,
        name: "Default Ingest",
        storageLocationId: ingestStorageId,
        defaultLibraryId: defaultLib?.id,
      });
    }
  }

  await files.loadStorageLocations();
}
