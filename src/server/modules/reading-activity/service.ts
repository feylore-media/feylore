import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { ValidationError } from "../../../shared/errors.js";
import type { ReadingActivityCreateResult } from "../../../shared/reading-activity.js";
import { readingLocatorSchema } from "../../../shared/reading-progress.js";
import type { ReadingProgressService } from "../reading-progress/service.js";
import type { ReadingSessionService } from "../reading-sessions/service.js";
import type { ReadingSessionPolicy } from "../reading-sessions/policy.js";
import { validateActivityDuration } from "./validate-duration.js";
import type { StatsFactRecorder } from "../stats/facts.js";
import { resolveWorkFromRepresentation } from "../reading-progress/resolve-work.js";

export class ReadingActivityService {
  constructor(
    private readonly db: Database,
    private readonly progress: ReadingProgressService,
    private readonly sessions: ReadingSessionService,
    private readonly policy: ReadingSessionPolicy,
    private readonly statsRecorder?: StatsFactRecorder,
  ) {}

  async recordActivity(
    userId: string,
    representationId: string,
    input: {
      locator: Parameters<typeof readingLocatorSchema.parse>[0];
      startedAt?: string;
      duration: number;
      deviceId?: string;
      clientId?: string;
      idempotencyKey?: string;
      visibility?: "active" | "hidden" | "background";
    },
  ): Promise<ReadingActivityCreateResult> {
    await this.progress.ensureRepresentationAccess(userId, representationId);

    if (input.idempotencyKey) {
      const existing = await this.db.query.readingActivity.findFirst({
        where: and(
          eq(schema.readingActivity.userId, userId),
          eq(schema.readingActivity.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (existing) {
        const session = existing.sessionId
          ? await this.sessions.getSession(userId, existing.sessionId)
          : null;
        return {
          activityId: existing.id,
          sessionId: existing.sessionId ?? "",
          sessionStatus: session?.status ?? "ended",
          sessionActiveDuration: session?.activeDuration ?? 0,
        };
      }
    }

    const locator = readingLocatorSchema.parse(input.locator);
    const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();

    let validatedDuration: number;
    try {
      validatedDuration = validateActivityDuration(
        input.duration,
        this.policy,
        input.visibility,
        input.startedAt ? startedAt : undefined,
      );
    } catch {
      throw new ValidationError("Invalid activity duration");
    }

    const session = await this.sessions.attachActivity(
      userId,
      representationId,
      {
        locator,
        duration: validatedDuration,
        startedAt,
        deviceId: input.deviceId,
        clientId: input.clientId,
      },
    );

    const activityId = generateId();
    await this.db.insert(schema.readingActivity).values({
      id: activityId,
      userId,
      representationId,
      sessionId: session.id,
      locatorJson: locator,
      startedAt,
      duration: validatedDuration,
      deviceId: input.deviceId,
      clientId: input.clientId,
      idempotencyKey: input.idempotencyKey,
    });

    if (this.statsRecorder) {
      let subjectType = "unknown";
      let subjectId = representationId;
      try {
        const work = await resolveWorkFromRepresentation(
          this.db,
          representationId,
        );
        subjectType = work.workType;
        subjectId = work.workId;
      } catch {
        // representation gone; keep an opaque subject
      }
      await this.statsRecorder.record({
        userId,
        kind: "session",
        subjectType,
        subjectId,
        occurredAt: startedAt,
        value: validatedDuration,
        unit: "seconds",
        source: "reading_activity",
        sourceKey: activityId,
      });
    }

    return {
      activityId,
      sessionId: session.id,
      sessionStatus: session.status,
      sessionActiveDuration: session.activeDuration,
    };
  }

  async listActivity(
    userId: string,
    filters: {
      representationId?: string;
      sessionId?: string;
      limit?: number;
    },
  ) {
    const conditions = [eq(schema.readingActivity.userId, userId)];
    if (filters.representationId) {
      conditions.push(
        eq(schema.readingActivity.representationId, filters.representationId),
      );
    }
    if (filters.sessionId) {
      conditions.push(eq(schema.readingActivity.sessionId, filters.sessionId));
    }

    const rows = await this.db
      .select()
      .from(schema.readingActivity)
      .where(and(...conditions))
      .orderBy(desc(schema.readingActivity.startedAt))
      .limit(filters.limit ?? 50);

    return rows.map((row) => ({
      id: row.id,
      representationId: row.representationId,
      sessionId: row.sessionId,
      locator: readingLocatorSchema.parse(row.locatorJson),
      startedAt: row.startedAt.toISOString(),
      duration: row.duration,
      deviceId: row.deviceId,
      clientId: row.clientId,
    }));
  }
}
