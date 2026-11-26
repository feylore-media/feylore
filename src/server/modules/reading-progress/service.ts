import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import type {
  ReadingProgressPublic,
  ReadingProgressUpdate,
} from "../../../shared/reading-progress.js";
import {
  deriveTotalProgression,
  readingLocatorSchema,
  resolveReadingCompletion,
} from "../../../shared/reading-progress.js";
import { toStoredReadingLocator } from "../../../shared/progress-locator.js";
import type { LibraryMembershipService } from "../library-membership/service.js";
import type { RepresentationService } from "../representations/service.js";
import { resolveWorkFromRepresentation } from "./resolve-work.js";
import { resolveProgressConflict } from "./conflict.js";
import type { StatsFactRecorder } from "../stats/facts.js";

export class ReadingProgressService {
  constructor(
    private readonly db: Database,
    private readonly libraryMembership: LibraryMembershipService,
    private readonly representations: RepresentationService,
    private readonly statsRecorder?: StatsFactRecorder,
  ) {}

  async ensureRepresentationAccess(userId: string, representationId: string) {
    const work = await resolveWorkFromRepresentation(this.db, representationId);
    const memberships = await this.libraryMembership.listForUser(
      userId,
      work.workType,
    );
    if (!memberships.some((m) => m.targetId === work.workId)) {
      throw new ForbiddenError("Work not in your library");
    }
    const rep = await this.representations.get(representationId);
    if (rep.unavailableAt) {
      throw new NotFoundError("Representation unavailable");
    }
    return work;
  }

  private toPublic(
    row: typeof schema.readingProgress.$inferSelect,
  ): ReadingProgressPublic {
    const locator = readingLocatorSchema.parse(row.locatorJson);
    return {
      representationId: row.representationId,
      workType: row.workType,
      workId: row.workId,
      locator,
      version: row.version,
      startedAt: row.startedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      clientUpdatedAt: row.clientUpdatedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      completionSource:
        (row.completionSource as ReadingProgressPublic["completionSource"]) ??
        null,
      lastDeviceId: row.lastDeviceId,
      lastClientId: row.lastClientId,
      totalProgression: deriveTotalProgression(locator),
    };
  }

  async getProgress(
    userId: string,
    representationId: string,
  ): Promise<ReadingProgressPublic | null> {
    const row = await this.db.query.readingProgress.findFirst({
      where: and(
        eq(schema.readingProgress.userId, userId),
        eq(schema.readingProgress.representationId, representationId),
      ),
    });
    return row ? this.toPublic(row) : null;
  }

  async listProgressForWork(
    userId: string,
    workType: string,
    workId: string,
  ): Promise<ReadingProgressPublic[]> {
    const rows = await this.db
      .select()
      .from(schema.readingProgress)
      .where(
        and(
          eq(schema.readingProgress.userId, userId),
          eq(schema.readingProgress.workType, workType),
          eq(schema.readingProgress.workId, workId),
        ),
      )
      .orderBy(desc(schema.readingProgress.updatedAt));
    return rows.map((r) => this.toPublic(r));
  }

  async getPrimaryProgressForWork(
    userId: string,
    workType: string,
    workId: string,
  ): Promise<{
    progress: ReadingProgressPublic;
    representationId: string;
  } | null> {
    const rows = await this.listProgressForWork(userId, workType, workId);
    if (rows.length === 0) return null;

    const incomplete = rows.filter((r) => !r.completedAt);
    const pool = incomplete.length > 0 ? incomplete : rows;
    const best = pool[0]!;
    return { progress: best, representationId: best.representationId };
  }

  async setProgress(
    userId: string,
    representationId: string,
    update: ReadingProgressUpdate,
  ): Promise<
    | { accepted: true; progress: ReadingProgressPublic }
    | { accepted: false; reason: "stale"; current: ReadingProgressPublic }
    | { accepted: true; idempotent: true; progress: ReadingProgressPublic }
  > {
    await this.ensureRepresentationAccess(userId, representationId);
    const work = await resolveWorkFromRepresentation(this.db, representationId);

    const locator = readingLocatorSchema.parse(update.locator);
    const clientUpdatedAt = update.clientUpdatedAt
      ? new Date(update.clientUpdatedAt)
      : null;

    const existing = await this.db.query.readingProgress.findFirst({
      where: and(
        eq(schema.readingProgress.userId, userId),
        eq(schema.readingProgress.representationId, representationId),
      ),
    });

    if (existing) {
      const storedLocator = readingLocatorSchema.parse(existing.locatorJson);
      const conflict = resolveProgressConflict({
        storedClientUpdatedAt: existing.clientUpdatedAt,
        storedVersion: existing.version,
        storedLocator,
        storedIdempotencyKey: existing.lastIdempotencyKey,
        incomingClientUpdatedAt: clientUpdatedAt,
        incomingIdempotencyKey: update.idempotencyKey ?? null,
        incomingLocator: locator,
      });

      if (conflict.action === "reject_stale") {
        return {
          accepted: false,
          reason: "stale",
          current: this.toPublic(existing),
        };
      }

      if (conflict.action === "idempotent") {
        return {
          accepted: true,
          idempotent: true,
          progress: this.toPublic(existing),
        };
      }

      const mergedLocator = conflict.locator;
      const completion = resolveReadingCompletion(
        mergedLocator,
        update.completed,
      );
      const wasCompleted = existing.completedAt != null;
      const nowCompleted = completion.completed;
      const eventType = !wasCompleted && nowCompleted
        ? "completed"
        : wasCompleted && !nowCompleted
          ? "reopened"
          : "updated";

      const completedAt = nowCompleted
        ? existing.completedAt ?? new Date()
        : null;
      const completionSource = nowCompleted ? completion.source : null;

      if (eventType === "completed" && completedAt) {
        await this.statsRecorder?.record({
          userId,
          kind: "completed",
          subjectType: work.workType,
          subjectId: work.workId,
          occurredAt: completedAt,
          value: 1,
          unit: "count",
          source: "reading",
          sourceKey: `${work.workType}:${work.workId}`,
        });
      }

      await this.db
        .update(schema.readingProgress)
        .set({
          locatorJson: toStoredReadingLocator(mergedLocator) as Record<
            string,
            unknown
          >,
          updatedAt: new Date(),
          clientUpdatedAt,
          completedAt,
          completionSource,
          version: existing.version + 1,
          lastDeviceId: update.deviceId ?? existing.lastDeviceId,
          lastClientId: update.clientId ?? existing.lastClientId,
          lastIdempotencyKey: update.idempotencyKey ?? existing.lastIdempotencyKey,
        })
        .where(eq(schema.readingProgress.id, existing.id));

      await this.db.insert(schema.readingProgressEvents).values({
        id: generateId(),
        userId,
        representationId,
        eventType,
        previousLocatorJson: existing.locatorJson,
        locatorJson: toStoredReadingLocator(mergedLocator) as Record<
          string,
          unknown
        >,
        clientUpdatedAt,
        deviceId: update.deviceId,
        clientId: update.clientId,
      });

      const updated = await this.db.query.readingProgress.findFirst({
        where: eq(schema.readingProgress.id, existing.id),
      });
      return { accepted: true, progress: this.toPublic(updated!) };
    }

    const completion = resolveReadingCompletion(locator, update.completed);
    const id = generateId();
    const stored = toStoredReadingLocator(locator) as Record<string, unknown>;

    if (completion.completed) {
      const completedAt = new Date();
      await this.statsRecorder?.record({
        userId,
        kind: "completed",
        subjectType: work.workType,
        subjectId: work.workId,
        occurredAt: completedAt,
        value: 1,
        unit: "count",
        source: "reading",
        sourceKey: `${work.workType}:${work.workId}`,
      });
    }

    await this.db.insert(schema.readingProgress).values({
      id,
      userId,
      representationId,
      workType: work.workType,
      workId: work.workId,
      locatorJson: stored,
      clientUpdatedAt,
      completedAt: completion.completed ? new Date() : null,
      completionSource: completion.source,
      version: 1,
      lastDeviceId: update.deviceId,
      lastClientId: update.clientId,
      lastIdempotencyKey: update.idempotencyKey,
    });

    await this.db.insert(schema.readingProgressEvents).values({
      id: generateId(),
      userId,
      representationId,
      eventType: completion.completed ? "completed" : "updated",
      previousLocatorJson: null,
      locatorJson: stored,
      clientUpdatedAt,
      deviceId: update.deviceId,
      clientId: update.clientId,
    });

    const created = await this.db.query.readingProgress.findFirst({
      where: eq(schema.readingProgress.id, id),
    });
    return { accepted: true, progress: this.toPublic(created!) };
  }

  async listWorkIdsWithProgress(
    userId: string,
    workType: string,
  ): Promise<Map<string, Date>> {
    const rows = await this.db
      .select({
        workId: schema.readingProgress.workId,
        updatedAt: schema.readingProgress.updatedAt,
      })
      .from(schema.readingProgress)
      .where(
        and(
          eq(schema.readingProgress.userId, userId),
          eq(schema.readingProgress.workType, workType),
        ),
      );
    const map = new Map<string, Date>();
    for (const row of rows) {
      const prev = map.get(row.workId);
      if (!prev || row.updatedAt > prev) {
        map.set(row.workId, row.updatedAt);
      }
    }
    return map;
  }
}
