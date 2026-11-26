import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import type {
  IngestFileLifecycle,
  IngestPipelineStatus,
  IngestSourceKind,
  IngestTerminalState,
} from "../../../shared/ingest.js";
import type { IngestStageLogEntry } from "../../db/schema.js";
import type { AppConfig } from "../../config.js";

export class IngestItemService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  async getById(id: string) {
    return this.db.query.ingestItems.findFirst({
      where: eq(schema.ingestItems.id, id),
    });
  }

  async list(params: {
    status?: IngestPipelineStatus;
    terminalState?: IngestTerminalState;
    processing?: boolean;
    limit?: number;
    cursor?: string;
  }) {
    const limit = params.limit ?? 50;
    const conditions = [];

    if (params.status) {
      conditions.push(eq(schema.ingestItems.status, params.status));
    }
    if (params.terminalState) {
      conditions.push(
        eq(schema.ingestItems.terminalState, params.terminalState),
      );
    }
    if (params.processing === true) {
      conditions.push(isNull(schema.ingestItems.terminalState));
      conditions.push(
        sql`${schema.ingestItems.status} != 'completed'`,
      );
    }
    if (params.cursor) {
      conditions.push(lt(schema.ingestItems.createdAt, new Date(params.cursor)));
    }

    const where =
      conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(schema.ingestItems)
      .where(where)
      .orderBy(desc(schema.ingestItems.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && data.length > 0
        ? data[data.length - 1]!.createdAt.toISOString()
        : null;

    return { data, nextCursor };
  }

  buildSourceIdentity(params: {
    sourceKind: IngestSourceKind;
    ingestRootId?: string | null;
    uploadId?: string;
    relativePath: string;
  }): string {
    if (params.sourceKind === "upload" && params.uploadId) {
      return `upload:${params.uploadId}:${params.relativePath}`;
    }
    return `fs:${params.ingestRootId ?? "none"}:${params.relativePath}`;
  }

  async reconcileDiscovered(params: {
    sourceKind: IngestSourceKind;
    sourceIdentity: string;
    sourcePath: string;
    sourceStorageLocationId: string;
    sourceIngestRootId?: string | null;
    originalFilename: string;
    sourceChecksum?: string | null;
    sourceSize?: number;
    sourceMtime?: Date;
    submittedByUserId?: string | null;
    targetLibraryId?: string | null;
  }) {
    const existing = await this.db.query.ingestItems.findFirst({
      where: eq(schema.ingestItems.sourceIdentity, params.sourceIdentity),
    });

    if (existing) {
      if (
        (existing.status === "completed" && !existing.terminalState) ||
        existing.terminalState === "duplicate"
      ) {
        if (
          params.sourceChecksum &&
          existing.sourceChecksum === params.sourceChecksum
        ) {
          return { item: existing, created: false, enqueued: false };
        }
      }

      if (
        existing.terminalState &&
        ["failed", "needs_attention", "unsupported"].includes(
          existing.terminalState,
        )
      ) {
        return { item: existing, created: false, enqueued: false };
      }

      if (
        existing.status !== "completed" &&
        !existing.terminalState &&
        existing.status !== "discovered"
      ) {
        return { item: existing, created: false, enqueued: false };
      }

      const stageLog = appendStageLog(existing.stageLog ?? [], {
        stage: "discovered",
        at: new Date().toISOString(),
        message: "Source re-detected",
      });

      const [updated] = await this.db
        .update(schema.ingestItems)
        .set({
          sourceChecksum: params.sourceChecksum ?? existing.sourceChecksum,
          sourceSize: params.sourceSize ?? existing.sourceSize,
          sourceMtime: params.sourceMtime ?? existing.sourceMtime,
          fileLifecycle: "discovered",
          status: "queued",
          terminalState: null,
          error: null,
          stageLog,
          updatedAt: new Date(),
          completedAt: null,
        })
        .where(eq(schema.ingestItems.id, existing.id))
        .returning();

      return { item: updated!, created: false, enqueued: true };
    }

    const id = generateId();
    const stageLog: IngestStageLogEntry[] = [
      {
        stage: "discovered",
        at: new Date().toISOString(),
        message: "File discovered",
      },
    ];

    const [inserted] = await this.db
      .insert(schema.ingestItems)
      .values({
        id,
        status: "queued",
        fileLifecycle: "discovered",
        sourceKind: params.sourceKind,
        sourceIdentity: params.sourceIdentity,
        sourcePath: params.sourcePath,
        sourceStorageLocationId: params.sourceStorageLocationId,
        sourceIngestRootId: params.sourceIngestRootId ?? null,
        originalFilename: params.originalFilename,
        sourceChecksum: params.sourceChecksum ?? null,
        sourceSize: params.sourceSize ?? null,
        sourceMtime: params.sourceMtime ?? null,
        submittedByUserId: params.submittedByUserId ?? null,
        targetLibraryId: params.targetLibraryId ?? null,
        stageLog,
      })
      .onConflictDoNothing({ target: schema.ingestItems.sourceIdentity })
      .returning();

    if (!inserted) {
      const raced = await this.db.query.ingestItems.findFirst({
        where: eq(schema.ingestItems.sourceIdentity, params.sourceIdentity),
      });
      if (!raced) {
        throw new Error("Ingest item conflict without existing row");
      }
      return { item: raced, created: false, enqueued: false };
    }

    return { item: inserted, created: true, enqueued: true };
  }

  async claim(id: string, workerId: string): Promise<boolean> {
    const staleBefore = new Date(
      Date.now() - this.config.INGEST_CLAIM_STALE_MS,
    );

    const existing = await this.getById(id);
    if (!existing || existing.terminalState || existing.status === "completed") {
      return false;
    }
    if (
      existing.claimedAt &&
      existing.claimedAt > staleBefore &&
      existing.claimedByWorker !== workerId
    ) {
      return false;
    }

    const stageLog = appendStageLog(existing.stageLog ?? [], {
      stage: "claimed",
      at: new Date().toISOString(),
      message: `Claimed by ${workerId}`,
    });

    const result = await this.db
      .update(schema.ingestItems)
      .set({
        claimedAt: new Date(),
        claimedByWorker: workerId,
        fileLifecycle: "claimed",
        status: "analyzing",
        updatedAt: new Date(),
        stageLog,
      })
      .where(eq(schema.ingestItems.id, id))
      .returning({ id: schema.ingestItems.id });

    return result.length > 0;
  }

  async update(
    id: string,
    patch: {
      status?: IngestPipelineStatus;
      terminalState?: IngestTerminalState | null;
      fileLifecycle?: IngestFileLifecycle;
      progress?: number;
      error?: string | null;
      stageLogEntry?: IngestStageLogEntry;
      detectedDomain?: string | null;
      detectedContentType?: string | null;
      targetLibraryId?: string | null;
      workType?: string | null;
      workId?: string | null;
      fileId?: string | null;
      destinationRelativePath?: string | null;
      duplicateOfWorkType?: string | null;
      duplicateOfWorkId?: string | null;
      warnings?: string[];
    },
  ) {
    const existing = await this.getById(id);
    if (!existing) return;

    const stageLog = patch.stageLogEntry
      ? appendStageLog(existing.stageLog ?? [], patch.stageLogEntry)
      : existing.stageLog;

    const completed =
      patch.status === "completed" ||
      (patch.terminalState && patch.terminalState !== null);

    await this.db
      .update(schema.ingestItems)
      .set({
        status: patch.status ?? existing.status,
        terminalState:
          patch.terminalState !== undefined
            ? patch.terminalState
            : existing.terminalState,
        fileLifecycle: patch.fileLifecycle ?? existing.fileLifecycle,
        progress: patch.progress ?? existing.progress,
        error: patch.error !== undefined ? patch.error : existing.error,
        stageLog,
        detectedDomain:
          patch.detectedDomain !== undefined
            ? patch.detectedDomain
            : existing.detectedDomain,
        detectedContentType:
          patch.detectedContentType !== undefined
            ? patch.detectedContentType
            : existing.detectedContentType,
        targetLibraryId:
          patch.targetLibraryId !== undefined
            ? patch.targetLibraryId
            : existing.targetLibraryId,
        workType:
          patch.workType !== undefined ? patch.workType : existing.workType,
        workId: patch.workId !== undefined ? patch.workId : existing.workId,
        fileId: patch.fileId !== undefined ? patch.fileId : existing.fileId,
        destinationRelativePath:
          patch.destinationRelativePath !== undefined
            ? patch.destinationRelativePath
            : existing.destinationRelativePath,
        duplicateOfWorkType:
          patch.duplicateOfWorkType !== undefined
            ? patch.duplicateOfWorkType
            : existing.duplicateOfWorkType,
        duplicateOfWorkId:
          patch.duplicateOfWorkId !== undefined
            ? patch.duplicateOfWorkId
            : existing.duplicateOfWorkId,
        warnings: patch.warnings ?? existing.warnings ?? [],
        updatedAt: new Date(),
        completedAt: completed ? new Date() : existing.completedAt,
      })
      .where(eq(schema.ingestItems.id, id));
  }

  async retry(id: string) {
    const existing = await this.getById(id);
    if (!existing) return null;
    if (
      !existing.terminalState ||
      !["failed", "needs_attention"].includes(existing.terminalState)
    ) {
      return null;
    }

    const stageLog = appendStageLog(existing.stageLog ?? [], {
      stage: "retry",
      at: new Date().toISOString(),
      message: `Retry #${existing.retryCount + 1}`,
    });

    const [updated] = await this.db
      .update(schema.ingestItems)
      .set({
        status: "queued",
        terminalState: null,
        error: null,
        progress: 0,
        claimedAt: null,
        claimedByWorker: null,
        fileLifecycle: "discovered",
        retryCount: existing.retryCount + 1,
        stageLog,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.ingestItems.id, id))
      .returning();

    return updated ?? null;
  }

  async findIncomplete() {
    return this.db
      .select({ id: schema.ingestItems.id })
      .from(schema.ingestItems)
      .where(
        and(
          isNull(schema.ingestItems.terminalState),
          sql`${schema.ingestItems.status} NOT IN ('completed')`,
          or(
            inArray(schema.ingestItems.status, [
              "queued",
              "analyzing",
              "identifying",
              "metadata_resolved",
              "normalizing",
              "organizing",
            ]),
            and(
              eq(schema.ingestItems.status, "analyzing"),
              lt(
                schema.ingestItems.claimedAt,
                new Date(Date.now() - this.config.INGEST_CLAIM_STALE_MS),
              ),
            ),
          ),
        ),
      );
  }
}

function appendStageLog(
  existing: IngestStageLogEntry[],
  entry: IngestStageLogEntry,
): IngestStageLogEntry[] {
  return [...existing, entry];
}

export function toIngestItemSummary(row: typeof schema.ingestItems.$inferSelect) {
  return {
    id: row.id,
    status: row.status as IngestPipelineStatus,
    terminalState: row.terminalState as IngestTerminalState | null,
    fileLifecycle: row.fileLifecycle as IngestFileLifecycle,
    sourceKind: row.sourceKind as IngestSourceKind,
    originalFilename: row.originalFilename,
    detectedContentType: row.detectedContentType,
    detectedDomain: row.detectedDomain,
    targetLibraryId: row.targetLibraryId,
    progress: row.progress,
    error: row.error,
    workType: row.workType,
    workId: row.workId,
    duplicateOfWorkType: row.duplicateOfWorkType,
    duplicateOfWorkId: row.duplicateOfWorkId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export function toIngestItemDetail(row: typeof schema.ingestItems.$inferSelect) {
  return {
    ...toIngestItemSummary(row),
    sourcePath: row.sourcePath,
    sourceIdentity: row.sourceIdentity,
    destinationRelativePath: row.destinationRelativePath,
    stageLog: (row.stageLog ?? []) as IngestStageLogEntry[],
    warnings: (row.warnings ?? []) as string[],
    retryCount: row.retryCount,
  };
}
