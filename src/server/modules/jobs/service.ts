import PgBoss from "pg-boss";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import type { FileService } from "../files/service.js";
import type { BooksService } from "../books/service.js";
import type { AudiobooksService } from "../audiobooks/service.js";
import type { MusicService } from "../music/service.js";
import type { MoviesService } from "../movies/service.js";
import type { TvService } from "../tv/service.js";
import type { PodcastsService } from "../podcasts/service.js";
import type { PeopleService } from "../people/service.js";
import { runPersonMetadataResolution } from "../people/people-metadata-resolution.js";
import type { MetadataService } from "../metadata/service.js";
import type { MetadataPolicyService } from "../metadata/policy.js";
import type { MetadataCanonicalService } from "../metadata/canonical.js";
import type { MetadataProviderRegistry } from "../metadata/registry.js";
import type { CoverPipeline } from "../metadata/cover.js";
import type { MetadataFormattingService } from "../metadata/formatting.js";
import { runMetadataIngest } from "../metadata/ingest.js";
import type { MetadataPersistenceSyncService } from "../metadata/metadata-persistence-sync.js";
import { runDownloadPrepare } from "../downloads/prepare.js";
import type { DownloadService } from "../downloads/service.js";
import type { RepresentationService } from "../representations/service.js";
import type { EpubPublicationService } from "../books/epub-publication.js";
import type { PlaybackService } from "../playback/service.js";
import type { PostgresSearchIndex } from "../search/index.js";
import { JOB_TYPES, type JobType } from "./types.js";
import { deriveTaskKey } from "./task-key.js";
import { listJobTasks, nextAttemptNumber, retryJob } from "./task-summary.js";
import { runArtworkFetch } from "./handlers/artwork-fetch.js";
import { runSearchIndex } from "./handlers/search-index.js";
import { runPodcastFeedSyncJob } from "./handlers/podcast-feed-sync.js";
import { runPodcastEnclosureFetchJob } from "./handlers/podcast-enclosure-fetch.js";
import { runMediaProcess } from "./handlers/media-process.js";
import { runNotificationEmail } from "./handlers/notification-email.js";
import { runStatsBackfillJob } from "./handlers/stats-backfill.js";
import type { StatsFactRecorder } from "../stats/facts.js";
import type { MailService } from "../mail/service.js";

export { JOB_TYPES, type JobType } from "./types.js";
export {
  listJobTasks,
  retryJob,
  type JobTaskSummary,
  type JobsTasksSummary,
  type JobRunDetail,
} from "./task-summary.js";

const cancellationSignals = new Map<string, AbortController>();

export class JobService {
  private boss: PgBoss;
  private producerReady = false;

  constructor(
    private readonly db: Database,
    connectionString: string,
  ) {
    this.boss = new PgBoss(connectionString);
  }

  private async ensureProducerReady() {
    if (this.producerReady) return;
    await this.boss.start();
    for (const type of Object.values(JOB_TYPES)) {
      await this.boss.createQueue(type);
    }
    this.producerReady = true;
  }

  async start() {
    await this.ensureProducerReady();
  }

  async stop() {
    await this.boss.stop();
  }

  getBoss() {
    return this.boss;
  }

  async findActiveMetadataIngestJobForBook(bookId: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(schema.jobRuns)
      .where(
        and(
          eq(schema.jobRuns.type, JOB_TYPES.METADATA_INGEST),
          or(
            eq(schema.jobRuns.status, "queued"),
            eq(schema.jobRuns.status, "running"),
          ),
        ),
      )
      .orderBy(desc(schema.jobRuns.createdAt))
      .limit(20);

    for (const row of rows) {
      const jobPayload = row.payload as Record<string, unknown>;
      if (jobPayload.bookId === bookId) return row.id;
    }
    return null;
  }

  async findActiveMetadataFetchJobForPerson(personId: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(schema.jobRuns)
      .where(
        and(
          eq(schema.jobRuns.type, JOB_TYPES.PERSON_METADATA_FETCH),
          or(
            eq(schema.jobRuns.status, "queued"),
            eq(schema.jobRuns.status, "running"),
          ),
        ),
      )
      .orderBy(desc(schema.jobRuns.createdAt))
      .limit(20);

    for (const row of rows) {
      const jobPayload = row.payload as Record<string, unknown>;
      if (jobPayload.personId === personId) return row.id;
    }
    return null;
  }

  async enqueue(
    type: JobType,
    payload: Record<string, unknown> = {},
    options?: { singletonKey?: string },
  ): Promise<string> {
    return this.enqueueInternal(type, payload, options);
  }

  private async enqueueInternal(
    type: JobType,
    payload: Record<string, unknown>,
    options?: { singletonKey?: string },
  ): Promise<string> {
    const id = generateId();
    const taskKey = deriveTaskKey(type, payload, id);
    const attempts = await nextAttemptNumber(this.db, type, taskKey);

    await this.db.insert(schema.jobRuns).values({
      id,
      type,
      taskKey,
      status: "queued",
      attempts,
      payload,
    });

    const sendOptions = options?.singletonKey
      ? { singletonKey: options.singletonKey }
      : {};
    await this.ensureProducerReady();
    const bossJobId = await this.boss.send(
      type,
      {
        ...payload,
        feyloreJobId: id,
      },
      sendOptions,
    );
    if (bossJobId) {
      await this.db
        .update(schema.jobRuns)
        .set({ bossJobId, updatedAt: new Date() })
        .where(eq(schema.jobRuns.id, id));
      return id;
    }

    await this.db.delete(schema.jobRuns).where(eq(schema.jobRuns.id, id));

    if (
      options?.singletonKey &&
      type === JOB_TYPES.METADATA_INGEST &&
      typeof payload.bookId === "string"
    ) {
      const existingId = await this.findActiveMetadataIngestJobForBook(
        payload.bookId,
      );
      if (existingId) return existingId;
    }

    return this.enqueueInternal(type, payload, {
      ...options,
      singletonKey: undefined,
    });
  }

  async getJob(id: string) {
    return this.db.query.jobRuns.findFirst({
      where: eq(schema.jobRuns.id, id),
    });
  }

  async list(options?: {
    type?: string;
    status?: (typeof schema.jobStatusEnum.enumValues)[number];
    taskKey?: string;
    limit?: number;
    cursor?: string;
  }) {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const conditions = [];

    if (options?.type) {
      conditions.push(eq(schema.jobRuns.type, options.type));
    }
    if (options?.status) {
      conditions.push(eq(schema.jobRuns.status, options.status));
    }
    if (options?.taskKey) {
      conditions.push(eq(schema.jobRuns.taskKey, options.taskKey));
    }

    if (options?.cursor) {
      const cursorJob = await this.getJob(options.cursor);
      if (cursorJob) {
        conditions.push(
          or(
            lt(schema.jobRuns.createdAt, cursorJob.createdAt),
            and(
              eq(schema.jobRuns.createdAt, cursorJob.createdAt),
              lt(schema.jobRuns.id, cursorJob.id),
            ),
          )!,
        );
      }
    }

    const rows = await this.db
      .select()
      .from(schema.jobRuns)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.jobRuns.createdAt), desc(schema.jobRuns.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1]?.id : undefined;

    return { data, nextCursor };
  }

  async listTasks(
    options?: Parameters<typeof listJobTasks>[1],
  ) {
    return listJobTasks(this.db, options);
  }

  async retry(id: string) {
    return retryJob(this.db, (type, payload, opts) => this.enqueue(type, payload, opts), id);
  }

  async updateStatus(
    id: string,
    status: (typeof schema.jobStatusEnum.enumValues)[number],
    extra?: { error?: string; progress?: number; logExcerpt?: string },
  ) {
    await this.db
      .update(schema.jobRuns)
      .set({
        status,
        error: extra?.error,
        progress: extra?.progress,
        logExcerpt: extra?.logExcerpt,
        updatedAt: new Date(),
        completedAt: ["completed", "failed", "cancelled"].includes(status)
          ? new Date()
          : undefined,
      })
      .where(eq(schema.jobRuns.id, id));
  }

  async cancel(id: string) {
    const job = await this.getJob(id);
    if (!job) return false;
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      return false;
    }

    if (job.status === "running") {
      const controller = cancellationSignals.get(id);
      controller?.abort();
    }

    if (job.bossJobId) {
      await this.boss.cancel(job.type, job.bossJobId);
    }

    await this.updateStatus(id, "cancelled");
    return true;
  }

  registerCancellation(jobId: string): AbortSignal {
    const controller = new AbortController();
    cancellationSignals.set(jobId, controller);
    return controller.signal;
  }

  clearCancellation(jobId: string) {
    cancellationSignals.delete(jobId);
  }

  isCancelled(signal: AbortSignal): boolean {
    return signal.aborted;
  }
}

export async function runLibraryScan(
  jobService: JobService,
  fileService: FileService,
  payload: { storageLocationId: string; feyloreJobId: string },
) {
  const { storageLocationId, feyloreJobId } = payload;
  const signal = jobService.registerCancellation(feyloreJobId);

  try {
    await jobService.updateStatus(feyloreJobId, "running");
    await fileService.loadStorageLocations();
    const adapter = fileService
      .getStorageService()
      .getAdapter(storageLocationId);
    const seenPaths = new Set<string>();

    for await (const discovered of adapter.walk()) {
      if (jobService.isCancelled(signal)) {
        await jobService.updateStatus(feyloreJobId, "cancelled");
        return;
      }
      seenPaths.add(discovered.relativePath);
      await fileService.upsertDiscovered(storageLocationId, discovered);
    }

    await fileService.markMissing(storageLocationId, seenPaths);
    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: `Scanned ${seenPaths.size} files`,
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

export async function runLibraryAssociate(
  jobService: JobService,
  booksService: BooksService,
  audiobooksService: AudiobooksService,
  moviesService: MoviesService,
  musicService: MusicService,
  db: Database,
  payload: {
    fileIds?: string[];
    storageLocationId?: string;
    userId?: string;
    feyloreJobId: string;
  },
) {
  const { fileIds, storageLocationId, userId, feyloreJobId } = payload;
  const signal = jobService.registerCancellation(feyloreJobId);

  try {
    await jobService.updateStatus(feyloreJobId, "running");

    let ids = fileIds ?? [];
    if (ids.length === 0 && storageLocationId) {
      const rows = await db
        .select({ id: schema.files.id })
        .from(schema.files)
        .where(eq(schema.files.storageLocationId, storageLocationId));
      ids = rows.map((r) => r.id);
    }

    let associated = 0;
    let skipped = 0;

    for (const fileId of ids) {
      if (jobService.isCancelled(signal)) {
        await jobService.updateStatus(feyloreJobId, "cancelled");
        return;
      }
      const bookResult = await booksService.associateFile(fileId, userId);
      if (!bookResult.skipped) {
        associated++;
        continue;
      }
      const audioResult = await audiobooksService.associateFile(fileId, userId);
      if (!audioResult.skipped) {
        associated++;
        continue;
      }
      const movieResult = await moviesService.associateFile(fileId, userId);
      if (!movieResult.skipped) {
        associated++;
        continue;
      }
      const musicResult = await musicService.associateFile(fileId, userId);
      if (!musicResult.skipped) associated++;
      else skipped++;
    }

    await jobService.updateStatus(feyloreJobId, "completed", {
      logExcerpt: `Associated ${associated} files, skipped ${skipped}`,
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

export async function registerJobHandlers(
  jobService: JobService,
  fileService: FileService,
  booksService: BooksService,
  audiobooksService: AudiobooksService,
  moviesService: MoviesService,
  tvService: TvService,
  podcastsService: PodcastsService,
  peopleService: PeopleService,
  musicService: MusicService,
  metadataService: MetadataService,
  metadataPolicy: MetadataPolicyService,
  metadataCanonical: MetadataCanonicalService,
  metadataRegistry: MetadataProviderRegistry,
  metadataFormatting: MetadataFormattingService,
  coverPipeline: CoverPipeline,
  db: Database,
  downloads: DownloadService,
  representations: RepresentationService,
  epubPublication: EpubPublicationService,
  playback: PlaybackService,
  search: PostgresSearchIndex,
  ingestPipeline?: { process: (id: string) => Promise<void> },
  metadataPersistenceSync?: MetadataPersistenceSyncService,
  mail?: MailService,
  appUrl?: string,
  statsRecorder?: StatsFactRecorder,
) {
  const boss = jobService.getBoss();

  await boss.work(JOB_TYPES.LIBRARY_SCAN, async (jobs) => {
    for (const job of jobs) {
      await runLibraryScan(
        jobService,
        fileService,
        job.data as {
          storageLocationId: string;
          feyloreJobId: string;
        },
      );
    }
  });

  await boss.work(JOB_TYPES.LIBRARY_ASSOCIATE, async (jobs) => {
    for (const job of jobs) {
      await runLibraryAssociate(
        jobService,
        booksService,
        audiobooksService,
        moviesService,
        musicService,
        db,
        job.data as {
          fileIds?: string[];
          storageLocationId?: string;
          userId?: string;
          feyloreJobId: string;
        },
      );
    }
  });

  await boss.work(JOB_TYPES.METADATA_INGEST, async (jobs) => {
    for (const job of jobs) {
      await runMetadataIngest(
        jobService,
        db,
        fileService,
        metadataService,
        metadataPolicy,
        metadataCanonical,
        metadataRegistry,
        booksService,
        audiobooksService,
        musicService,
        moviesService,
        coverPipeline,
        job.data as {
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
        },
        metadataFormatting,
      );
    }
  });

  await boss.work(JOB_TYPES.PERSON_METADATA_FETCH, async (jobs) => {
    for (const job of jobs) {
      const data = job.data as {
        personId: string;
        feyloreJobId: string;
        userId?: string;
      };
      if (!data.personId) continue;
      try {
        await jobService.updateStatus(data.feyloreJobId, "running");
        const result = await runPersonMetadataResolution(
          metadataService,
          metadataPolicy,
          peopleService,
          { personId: data.personId, userId: data.userId },
        );
        await jobService.updateStatus(data.feyloreJobId, "completed", {
          logExcerpt: result.log.join(", "),
        });
      } catch (err) {
        await jobService.updateStatus(data.feyloreJobId, "failed", {
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  });

  if (metadataPersistenceSync) {
    await boss.work(JOB_TYPES.METADATA_PERSISTENCE_SYNC, async (jobs) => {
      for (const job of jobs) {
        const data = job.data as { bookId: string; feyloreJobId?: string };
        if (!data.bookId) continue;
        const feyloreJobId = data.feyloreJobId;
        if (feyloreJobId) {
          await jobService.updateStatus(feyloreJobId, "running");
        }
        try {
          const result = await metadataPersistenceSync.syncBook(data.bookId);
          if (feyloreJobId) {
            await jobService.updateStatus(feyloreJobId, "completed", {
              logExcerpt: result.log.join(", "),
              error: result.errors.length > 0 ? result.errors.join("; ") : undefined,
            });
          }
        } catch (err) {
          if (feyloreJobId) {
            await jobService.updateStatus(feyloreJobId, "failed", {
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }
        }
      }
    });
  }

  await boss.work(JOB_TYPES.DOWNLOAD_PREPARE, async (jobs) => {
    for (const job of jobs) {
      await runDownloadPrepare(
        jobService,
        downloads,
        fileService,
        representations,
        epubPublication,
        playback,
        job.data as {
          downloadId: string;
          fileId: string;
          userId: string;
          representationId?: string;
          feyloreJobId: string;
        },
      );
    }
  });

  if (ingestPipeline) {
    await boss.work(JOB_TYPES.INGEST_PROCESS, async (jobs) => {
      for (const job of jobs) {
        const data = job.data as { ingestItemId?: string };
        if (data.ingestItemId) {
          await ingestPipeline.process(data.ingestItemId);
        }
      }
    });
  }

  await boss.work(JOB_TYPES.ARTWORK_FETCH, async (jobs) => {
    for (const job of jobs) {
      await runArtworkFetch(
        jobService,
        coverPipeline,
        job.data as {
          bookId: string;
          representationId: string;
          coverUrl: string;
          feyloreJobId: string;
        },
      );
    }
  });

  await boss.work(JOB_TYPES.SEARCH_INDEX, async (jobs) => {
    for (const job of jobs) {
      await runSearchIndex(
        jobService,
        booksService,
        audiobooksService,
        podcastsService,
        musicService,
        moviesService,
        tvService,
        job.data as {
          entityType?: string;
          feyloreJobId: string;
        },
      );
    }
  });

  await boss.work(JOB_TYPES.PODCAST_FEED_SYNC, async (jobs) => {
    for (const job of jobs) {
      await runPodcastFeedSyncJob(
        jobService,
        db,
        search,
        coverPipeline,
        job.data as { feedId: string; feyloreJobId: string },
      );
    }
  });

  await boss.work(JOB_TYPES.PODCAST_ENCLOSURE_FETCH, async (jobs) => {
    for (const job of jobs) {
      await runPodcastEnclosureFetchJob(
        jobService,
        db,
        fileService,
        representations,
        job.data as { episodeId: string; feyloreJobId: string },
      );
    }
  });

  await boss.work(JOB_TYPES.MEDIA_PROCESS, async (jobs) => {
    for (const job of jobs) {
      await runMediaProcess(
        jobService,
        db,
        job.data as {
          feyloreJobId: string;
          domain?: string;
          representationId?: string;
          fileId?: string;
        },
      );
    }
  });

  if (mail && appUrl) {
    await boss.work(JOB_TYPES.NOTIFICATION_EMAIL, async (jobs) => {
      for (const job of jobs) {
        const data = job.data as {
          notificationId: string;
          feyloreJobId: string;
        };
        if (!data.notificationId) continue;
        // runNotificationEmail records the failure on the job run and
        // rethrows so pg-boss can schedule a retry.
        await runNotificationEmail(jobService, db, mail, appUrl, data);
      }
    });
  }

  if (statsRecorder) {
    await boss.work(JOB_TYPES.STATS_BACKFILL, async (jobs) => {
      for (const job of jobs) {
        await runStatsBackfillJob(
          jobService,
          db,
          statsRecorder,
          job.data as { userId?: string; feyloreJobId: string },
        );
      }
    });
  }
}
