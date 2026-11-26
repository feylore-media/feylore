import { eq, and, desc, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import type { ReadingLocator } from "../../../shared/books.js";
import type { ProgressLocator } from "../../../shared/progress-locator.js";
import {
  isReadingProgressLocator,
  normalizeProgressLocator,
  toStoredReadingLocator,
} from "../../../shared/progress-locator.js";
import type { StatsFactRecorder } from "../stats/facts.js";

export class UserStateService {
  constructor(
    private readonly db: Database,
    private readonly statsRecorder?: StatsFactRecorder,
  ) {}

  async getFavorite(userId: string, subjectType: string, subjectId: string) {
    const row = await this.db.query.userFavorites.findFirst({
      where: and(
        eq(schema.userFavorites.userId, userId),
        eq(schema.userFavorites.subjectType, subjectType),
        eq(schema.userFavorites.subjectId, subjectId),
      ),
    });
    return !!row;
  }

  async setFavorite(
    userId: string,
    subjectType: string,
    subjectId: string,
    favorite: boolean,
  ) {
    if (favorite) {
      await this.db
        .insert(schema.userFavorites)
        .values({ userId, subjectType, subjectId })
        .onConflictDoNothing();
    } else {
      await this.db
        .delete(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, subjectType),
            eq(schema.userFavorites.subjectId, subjectId),
          ),
        );
    }
  }

  async getRating(userId: string, subjectType: string, subjectId: string) {
    const row = await this.db.query.userRatings.findFirst({
      where: and(
        eq(schema.userRatings.userId, userId),
        eq(schema.userRatings.subjectType, subjectType),
        eq(schema.userRatings.subjectId, subjectId),
      ),
    });
    return row?.rating ?? null;
  }

  async setRating(
    userId: string,
    subjectType: string,
    subjectId: string,
    rating: number | null,
  ) {
    if (rating === null) {
      await this.db
        .delete(schema.userRatings)
        .where(
          and(
            eq(schema.userRatings.userId, userId),
            eq(schema.userRatings.subjectType, subjectType),
            eq(schema.userRatings.subjectId, subjectId),
          ),
        );
      await this.statsRecorder?.deleteRated(userId, subjectType, subjectId);
      return;
    }
    await this.db
      .insert(schema.userRatings)
      .values({ userId, subjectType, subjectId, rating })
      .onConflictDoUpdate({
        target: [
          schema.userRatings.userId,
          schema.userRatings.subjectType,
          schema.userRatings.subjectId,
        ],
        set: { rating },
      });
    await this.statsRecorder?.recordRated({
      userId,
      kind: "rated",
      subjectType,
      subjectId,
      occurredAt: new Date(),
      value: rating,
      unit: "stars",
      ratingScale: 5,
      source: "user_ratings",
      sourceKey: `${subjectType}:${subjectId}`,
    });
  }

  async getProgress(userId: string, subjectType: string, subjectId: string) {
    const row = await this.db.query.userProgress.findFirst({
      where: and(
        eq(schema.userProgress.userId, userId),
        eq(schema.userProgress.subjectType, subjectType),
        eq(schema.userProgress.subjectId, subjectId),
      ),
    });
    if (!row) return null;
    return {
      locator: normalizeProgressLocator(
        row.locatorJson as Record<string, unknown>,
      ),
      representationId: row.representationId,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** @deprecated Use ReadingProgressService instead */
  async getReadingProgress(userId: string, subjectType: string, subjectId: string) {
    const progress = await this.getProgress(userId, subjectType, subjectId);
    if (!progress || !isReadingProgressLocator(progress.locator)) return null;
    const { kind, ...locator } = progress.locator;
    void kind;
    return {
      locator: locator as ReadingLocator,
      representationId: progress.representationId,
      updatedAt: progress.updatedAt,
    };
  }

  async setProgress(
    userId: string,
    subjectType: string,
    subjectId: string,
    locator: ProgressLocator,
    representationId?: string,
  ) {
    await this.db
      .insert(schema.userProgress)
      .values({
        id: generateId(),
        userId,
        subjectType,
        subjectId,
        locatorJson: locator,
        representationId,
      })
      .onConflictDoUpdate({
        target: [
          schema.userProgress.userId,
          schema.userProgress.subjectType,
          schema.userProgress.subjectId,
        ],
        set: {
          locatorJson: locator,
          representationId,
          updatedAt: new Date(),
        },
      });
  }

  /** @deprecated Use ReadingProgressService instead */
  async setReadingProgress(
    userId: string,
    subjectType: string,
    subjectId: string,
    locator: ReadingLocator,
    representationId?: string,
  ) {
    await this.setProgress(
      userId,
      subjectType,
      subjectId,
      toStoredReadingLocator(locator),
      representationId,
    );
  }

  async addHistory(
    userId: string,
    subjectType: string,
    subjectId: string,
    eventType: string,
    payload?: Record<string, unknown>,
  ) {
    await this.db.insert(schema.userHistory).values({
      id: generateId(),
      userId,
      subjectType,
      subjectId,
      eventType,
      payload,
    });
  }

  async listHistory(
    userId: string,
    subjectType: string,
    subjectId: string,
    limit = 50,
  ) {
    return this.db
      .select()
      .from(schema.userHistory)
      .where(
        and(
          eq(schema.userHistory.userId, userId),
          eq(schema.userHistory.subjectType, subjectType),
          eq(schema.userHistory.subjectId, subjectId),
        ),
      )
      .orderBy(desc(schema.userHistory.occurredAt))
      .limit(limit);
  }

  async listRecentHistoryByEventTypes(
    userId: string,
    eventTypes: string[],
    limit = 50,
  ) {
    if (eventTypes.length === 0) return [];
    return this.db
      .select()
      .from(schema.userHistory)
      .where(
        and(
          eq(schema.userHistory.userId, userId),
          inArray(schema.userHistory.eventType, eventTypes),
        ),
      )
      .orderBy(desc(schema.userHistory.occurredAt))
      .limit(limit);
  }

  async listBookmarks(
    userId: string,
    subjectType: string,
    subjectId: string,
  ) {
    const rows = await this.db
      .select()
      .from(schema.userBookmarks)
      .where(
        and(
          eq(schema.userBookmarks.userId, userId),
          eq(schema.userBookmarks.subjectType, subjectType),
          eq(schema.userBookmarks.subjectId, subjectId),
        ),
      );
    return rows.map((r) => this.toPublicBookmark(r));
  }

  async createBookmark(
    userId: string,
    subjectType: string,
    subjectId: string,
    input: {
      label?: string;
      locator: ReadingLocator;
      representationId?: string;
    },
  ) {
    const id = generateId();
    await this.db.insert(schema.userBookmarks).values({
      id,
      userId,
      subjectType,
      subjectId,
      label: input.label,
      locatorJson: input.locator,
      representationId: input.representationId,
    });
    const row = await this.db.query.userBookmarks.findFirst({
      where: eq(schema.userBookmarks.id, id),
    });
    return this.toPublicBookmark(row!);
  }

  async deleteBookmark(userId: string, bookmarkId: string) {
    await this.db
      .delete(schema.userBookmarks)
      .where(
        and(
          eq(schema.userBookmarks.id, bookmarkId),
          eq(schema.userBookmarks.userId, userId),
        ),
      );
  }

  async listAnnotations(
    userId: string,
    subjectType: string,
    subjectId: string,
  ) {
    const rows = await this.db
      .select()
      .from(schema.userAnnotations)
      .where(
        and(
          eq(schema.userAnnotations.userId, userId),
          eq(schema.userAnnotations.subjectType, subjectType),
          eq(schema.userAnnotations.subjectId, subjectId),
        ),
      );
    return rows.map((r) => this.toPublicAnnotation(r));
  }

  async getAnnotation(userId: string, annotationId: string) {
    const row = await this.db.query.userAnnotations.findFirst({
      where: and(
        eq(schema.userAnnotations.id, annotationId),
        eq(schema.userAnnotations.userId, userId),
      ),
    });
    return row ? this.toPublicAnnotation(row) : null;
  }

  async createAnnotation(
    userId: string,
    subjectType: string,
    subjectId: string,
    input: {
      locator: ReadingLocator;
      highlightText?: string;
      note?: string;
      color?: string;
      representationId?: string;
    },
  ) {
    const id = generateId();
    await this.db.insert(schema.userAnnotations).values({
      id,
      userId,
      subjectType,
      subjectId,
      locatorJson: input.locator,
      highlightText: input.highlightText,
      note: input.note,
      color: input.color,
      representationId: input.representationId,
    });
    const row = await this.db.query.userAnnotations.findFirst({
      where: eq(schema.userAnnotations.id, id),
    });
    return this.toPublicAnnotation(row!);
  }

  async updateAnnotation(
    userId: string,
    annotationId: string,
    input: Partial<{
      locator: ReadingLocator;
      highlightText: string;
      note: string;
      color: string;
      representationId: string;
    }>,
  ) {
    await this.db
      .update(schema.userAnnotations)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(schema.userAnnotations.id, annotationId),
          eq(schema.userAnnotations.userId, userId),
        ),
      );
    const row = await this.db.query.userAnnotations.findFirst({
      where: eq(schema.userAnnotations.id, annotationId),
    });
    return row ? this.toPublicAnnotation(row) : null;
  }

  async deleteAnnotation(userId: string, annotationId: string) {
    await this.db
      .delete(schema.userAnnotations)
      .where(
        and(
          eq(schema.userAnnotations.id, annotationId),
          eq(schema.userAnnotations.userId, userId),
        ),
      );
  }

  toPublicBookmark(row: typeof schema.userBookmarks.$inferSelect) {
    return {
      id: row.id,
      label: row.label,
      locator: row.locatorJson as ReadingLocator,
      representationId: row.representationId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  toPublicAnnotation(row: typeof schema.userAnnotations.$inferSelect) {
    return {
      id: row.id,
      locator: row.locatorJson as ReadingLocator,
      highlightText: row.highlightText,
      note: row.note,
      color: row.color,
      representationId: row.representationId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
