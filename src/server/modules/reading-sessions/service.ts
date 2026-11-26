import { eq, and, desc, isNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { NotFoundError } from "../../../shared/errors.js";
import type { ReadingLocator } from "../../../shared/reading-progress.js";
import { readingLocatorSchema } from "../../../shared/reading-progress.js";
import type {
  ReadingSessionPublic,
  ReadingSessionStatus,
} from "../../../shared/reading-sessions.js";
import type { ReadingSessionPolicy } from "./policy.js";
import { maxSessionActiveDuration } from "../reading-activity/validate-duration.js";

export class ReadingSessionService {
  constructor(
    private readonly db: Database,
    private readonly policy: ReadingSessionPolicy,
  ) {}

  private toPublic(
    row: typeof schema.readingSessions.$inferSelect,
  ): ReadingSessionPublic {
    return {
      id: row.id,
      representationId: row.representationId,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      activeDuration: row.activeDuration,
      startingLocator: row.startingLocatorJson
        ? readingLocatorSchema.parse(row.startingLocatorJson)
        : null,
      endingLocator: row.endingLocatorJson
        ? readingLocatorSchema.parse(row.endingLocatorJson)
        : null,
      deviceId: row.deviceId,
      clientId: row.clientId,
      status: row.status as ReadingSessionStatus,
      qualifiedAt: row.qualifiedAt?.toISOString() ?? null,
    };
  }

  async getSession(
    userId: string,
    sessionId: string,
  ): Promise<ReadingSessionPublic | null> {
    const row = await this.db.query.readingSessions.findFirst({
      where: and(
        eq(schema.readingSessions.id, sessionId),
        eq(schema.readingSessions.userId, userId),
      ),
    });
    return row ? this.toPublic(row) : null;
  }

  async listSessions(
    userId: string,
    filters: {
      representationId?: string;
      status?: ReadingSessionStatus;
      qualifiedOnly?: boolean;
      limit?: number;
    },
  ): Promise<ReadingSessionPublic[]> {
    const conditions = [eq(schema.readingSessions.userId, userId)];
    if (filters.representationId) {
      conditions.push(
        eq(schema.readingSessions.representationId, filters.representationId),
      );
    }
    if (filters.status) {
      conditions.push(eq(schema.readingSessions.status, filters.status));
    }
    if (filters.qualifiedOnly) {
      conditions.push(eq(schema.readingSessions.status, "qualified"));
    }

    const rows = await this.db
      .select()
      .from(schema.readingSessions)
      .where(and(...conditions))
      .orderBy(desc(schema.readingSessions.startedAt))
      .limit(filters.limit ?? 50);

    return rows.map((r) => this.toPublic(r));
  }

  async findOpenSession(
    userId: string,
    representationId: string,
    clientId?: string | null,
  ) {
    const openConditions = [
      eq(schema.readingSessions.userId, userId),
      eq(schema.readingSessions.representationId, representationId),
      isNull(schema.readingSessions.endedAt),
    ];
    if (clientId) {
      openConditions.push(eq(schema.readingSessions.clientId, clientId));
    }

    const rows = await this.db
      .select()
      .from(schema.readingSessions)
      .where(and(...openConditions))
      .orderBy(desc(schema.readingSessions.startedAt))
      .limit(1);

    return rows[0] ?? null;
  }

  async createSession(
    userId: string,
    representationId: string,
    input: {
      startingLocator?: ReadingLocator;
      deviceId?: string;
      clientId?: string;
      startedAt?: Date;
    },
  ) {
    const id = generateId();
    const now = new Date();
    const startedAt = input.startedAt ?? now;
    await this.db.insert(schema.readingSessions).values({
      id,
      userId,
      representationId,
      startedAt,
      startingLocatorJson: input.startingLocator ?? null,
      endingLocatorJson: input.startingLocator ?? null,
      deviceId: input.deviceId,
      clientId: input.clientId,
      status: "pending",
      lastHeartbeatAt: now,
    });
    return this.getSession(userId, id);
  }

  private async qualifyIfNeeded(
    sessionId: string,
    activeDuration: number,
    now: Date,
  ) {
    const session = await this.db.query.readingSessions.findFirst({
      where: eq(schema.readingSessions.id, sessionId),
    });
    if (!session || session.status === "ended") return;

    if (
      session.status === "pending" &&
      activeDuration >= this.policy.qualificationSeconds
    ) {
      await this.db
        .update(schema.readingSessions)
        .set({
          status: "qualified",
          qualifiedAt: session.qualifiedAt ?? now,
        })
        .where(eq(schema.readingSessions.id, sessionId));
    }
  }

  async attachActivity(
    userId: string,
    representationId: string,
    input: {
      locator: ReadingLocator;
      duration: number;
      startedAt: Date;
      deviceId?: string;
      clientId?: string;
    },
  ): Promise<ReadingSessionPublic> {
    const now = new Date();
    let session: typeof schema.readingSessions.$inferSelect | null =
      await this.findOpenSession(userId, representationId, input.clientId);

    if (session) {
      const gapSeconds =
        (now.getTime() - session.lastHeartbeatAt.getTime()) / 1000;
      if (gapSeconds > this.policy.inactivitySeconds) {
        await this.endSession(userId, session.id, {
          endingLocator: input.locator,
        });
        session = null;
      }
    }

    if (!session) {
      const created = await this.createSession(userId, representationId, {
        startingLocator: input.locator,
        deviceId: input.deviceId,
        clientId: input.clientId,
        startedAt: input.startedAt,
      });
      if (!created) throw new NotFoundError("Session not found");
      const row = await this.db.query.readingSessions.findFirst({
        where: eq(schema.readingSessions.id, created.id),
      });
      if (!row) throw new NotFoundError("Session not found");
      session = row;
    }

    if (!session) throw new NotFoundError("Session not found");

    const maxAllowed = maxSessionActiveDuration(
      session.startedAt,
      session.endedAt,
      now,
    );
    const newActiveDuration = Math.min(
      session.activeDuration + input.duration,
      maxAllowed,
    );

    const startingLocator = session.startingLocatorJson
      ? readingLocatorSchema.parse(session.startingLocatorJson)
      : input.locator;

    await this.db
      .update(schema.readingSessions)
      .set({
        activeDuration: newActiveDuration,
        startingLocatorJson: startingLocator,
        endingLocatorJson: input.locator,
        lastHeartbeatAt: now,
        deviceId: input.deviceId ?? session.deviceId,
        clientId: input.clientId ?? session.clientId,
      })
      .where(eq(schema.readingSessions.id, session.id));

    await this.qualifyIfNeeded(session.id, newActiveDuration, now);

    const updated = await this.getSession(userId, session.id);
    return updated!;
  }

  async endSession(
    userId: string,
    sessionId: string,
    input?: { endingLocator?: ReadingLocator },
  ): Promise<ReadingSessionPublic | null> {
    const session = await this.db.query.readingSessions.findFirst({
      where: and(
        eq(schema.readingSessions.id, sessionId),
        eq(schema.readingSessions.userId, userId),
      ),
    });
    if (!session) return null;
    if (session.endedAt) return this.toPublic(session);

    const now = new Date();
    await this.db
      .update(schema.readingSessions)
      .set({
        endedAt: now,
        status: "ended",
        endingLocatorJson:
          input?.endingLocator ?? session.endingLocatorJson ?? null,
        lastHeartbeatAt: now,
      })
      .where(eq(schema.readingSessions.id, sessionId));

    return this.getSession(userId, sessionId);
  }
}
