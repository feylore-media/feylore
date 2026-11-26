import { eq, and } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { LibraryMembershipTargetType } from "../../../shared/subject.js";

export class LibraryMembershipService {
  constructor(private readonly db: Database) {}

  async add(
    userId: string,
    targetType: LibraryMembershipTargetType | string,
    targetId: string,
  ) {
    await this.db
      .insert(schema.libraryMemberships)
      .values({ userId, targetType, targetId })
      .onConflictDoNothing();
  }

  async remove(
    userId: string,
    targetType: string,
    targetId: string,
  ) {
    await this.db
      .delete(schema.libraryMemberships)
      .where(
        and(
          eq(schema.libraryMemberships.userId, userId),
          eq(schema.libraryMemberships.targetType, targetType),
          eq(schema.libraryMemberships.targetId, targetId),
        ),
      );
  }

  async listForUser(userId: string, targetType?: string) {
    if (targetType) {
      return this.db
        .select()
        .from(schema.libraryMemberships)
        .where(
          and(
            eq(schema.libraryMemberships.userId, userId),
            eq(schema.libraryMemberships.targetType, targetType),
          ),
        );
    }
    return this.db
      .select()
      .from(schema.libraryMemberships)
      .where(eq(schema.libraryMemberships.userId, userId));
  }

  async ensureWorkMembership(userId: string, workType: string, workId: string) {
    await this.add(userId, workType, workId);
  }

  toPublic(row: typeof schema.libraryMemberships.$inferSelect) {
    return {
      userId: row.userId,
      targetType: row.targetType,
      targetId: row.targetId,
      addedAt: row.addedAt.toISOString(),
    };
  }
}
