import { eq, and, lt, desc, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import type { ActivityType, ActivityVisibility } from "../../../shared/activity.js";

export class ActivityService {
  constructor(private readonly db: Database) {}

  private async getVisibility(userId: string): Promise<ActivityVisibility> {
    const prefs = await this.db.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });
    const v = prefs?.privacyActivity ?? "private";
    if (v === "friends" || v === "public") return v;
    return "private";
  }

  async record(
    actorUserId: string,
    type: ActivityType | string,
    options?: {
      subjectType?: string;
      subjectId?: string;
      payload?: Record<string, unknown>;
      visibility?: ActivityVisibility;
    },
  ) {
    const visibility =
      options?.visibility ?? (await this.getVisibility(actorUserId));
    await this.db.insert(schema.activityEvents).values({
      id: generateId(),
      actorUserId,
      type,
      subjectType: options?.subjectType,
      subjectId: options?.subjectId,
      visibility,
      payload: options?.payload,
    });
  }

  async listForUser(
    userId: string,
    options?: { cursor?: string; limit?: number; types?: string[] },
  ) {
    const limit = Math.min(options?.limit ?? 50, 100);
    const conditions = [eq(schema.activityEvents.actorUserId, userId)];

    if (options?.cursor) {
      conditions.push(lt(schema.activityEvents.createdAt, new Date(options.cursor)));
    }

    if (options?.types && options.types.length > 0) {
      conditions.push(inArray(schema.activityEvents.type, options.types));
    }

    const rows = await this.db
      .select()
      .from(schema.activityEvents)
      .where(and(...conditions))
      .orderBy(desc(schema.activityEvents.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      events: page.map((row) => ({
        id: row.id,
        type: row.type,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        visibility: row.visibility as ActivityVisibility,
        payload: row.payload ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: hasMore && last ? last.createdAt.toISOString() : undefined,
    };
  }
}
