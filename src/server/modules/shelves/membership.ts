import { eq, and } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { shelfExpressionSchemaExport } from "../../../shared/shelf-expression.js";
import type {
  ShelfMembershipSource,
  ShelfItemRef,
} from "../../../shared/shelves.js";
import type { ShelfScopeId } from "../../../shared/shelf-scopes.js";
import type { ShelfExpressionEvaluator } from "./expression-evaluator.js";

export interface UnifiedShelfMember {
  subjectType: string;
  subjectId: string;
  sortOrder: number;
  addedAt: Date;
  membershipSources: ShelfMembershipSource[];
}

export class ShelfMembershipService {
  constructor(
    private readonly db: Database,
    private readonly evaluator: ShelfExpressionEvaluator,
  ) {}

  async getUnifiedMembership(
    userId: string,
    shelf: typeof schema.shelves.$inferSelect,
    sourceFilter?: ShelfMembershipSource | "all",
  ): Promise<UnifiedShelfMember[]> {
    const manualItems = await this.db
      .select()
      .from(schema.shelfItems)
      .where(eq(schema.shelfItems.shelfId, shelf.id));

    const exclusions = await this.db
      .select()
      .from(schema.shelfExcludedItems)
      .where(eq(schema.shelfExcludedItems.shelfId, shelf.id));
    const excludedKeys = new Set(
      exclusions.map((e) => `${e.subjectType}:${e.subjectId}`),
    );

    const manualMap = new Map<string, UnifiedShelfMember>();
    for (const item of manualItems) {
      const key = `${item.subjectType}:${item.subjectId}`;
      manualMap.set(key, {
        subjectType: item.subjectType,
        subjectId: item.subjectId,
        sortOrder: item.sortOrder,
        addedAt: item.addedAt,
        membershipSources: ["manual"],
      });
    }

    let ruleRefs: Array<{ subjectType: string; subjectId: string }> = [];
    const expr = shelf.membershipExpression;
    if (expr) {
      const parsed = shelfExpressionSchemaExport.safeParse(expr);
      if (parsed.success) {
        ruleRefs = await this.evaluator.evaluateForUser(
          userId,
          shelf.scope as ShelfScopeId,
          parsed.data,
        );
      }
    }

    const merged = new Map<string, UnifiedShelfMember>(manualMap);
    for (const ref of ruleRefs) {
      const key = `${ref.subjectType}:${ref.subjectId}`;
      if (excludedKeys.has(key)) continue;

      const existing = merged.get(key);
      if (existing) {
        if (!existing.membershipSources.includes("rule")) {
          existing.membershipSources.push("rule");
        }
      } else {
        merged.set(key, {
          subjectType: ref.subjectType,
          subjectId: ref.subjectId,
          sortOrder: Number.MAX_SAFE_INTEGER,
          addedAt: new Date(0),
          membershipSources: ["rule"],
        });
      }
    }

    let result = [...merged.values()];
    if (sourceFilter && sourceFilter !== "all") {
      result = result.filter((m) =>
        m.membershipSources.includes(sourceFilter),
      );
    }

    return result;
  }

  async listIncompatibleManualItems(
    shelfId: string,
    newScope: ShelfScopeId,
    subjectTypes: readonly string[],
  ): Promise<ShelfItemRef[]> {
    const allowed = new Set(subjectTypes);
    const items = await this.db
      .select()
      .from(schema.shelfItems)
      .where(eq(schema.shelfItems.shelfId, shelfId));

    return items
      .filter((i) => !allowed.has(i.subjectType))
      .map((i) => ({
        subjectType: i.subjectType,
        subjectId: i.subjectId,
        sortOrder: i.sortOrder,
        addedAt: i.addedAt.toISOString(),
        membershipSources: ["manual"] as ShelfMembershipSource[],
      }));
  }

  async removeIncompatibleManualItems(
    shelfId: string,
    subjectTypes: readonly string[],
  ): Promise<number> {
    const allowed = new Set(subjectTypes);
    const items = await this.db
      .select()
      .from(schema.shelfItems)
      .where(eq(schema.shelfItems.shelfId, shelfId));

    let removed = 0;
    for (const item of items) {
      if (!allowed.has(item.subjectType)) {
        await this.db
          .delete(schema.shelfItems)
          .where(
            and(
              eq(schema.shelfItems.shelfId, shelfId),
              eq(schema.shelfItems.subjectType, item.subjectType),
              eq(schema.shelfItems.subjectId, item.subjectId),
            ),
          );
        removed++;
      }
    }
    return removed;
  }

  async pruneIncompatibleExclusions(
    shelfId: string,
    subjectTypes: readonly string[],
  ): Promise<void> {
    const allowed = new Set(subjectTypes);
    const exclusions = await this.db
      .select()
      .from(schema.shelfExcludedItems)
      .where(eq(schema.shelfExcludedItems.shelfId, shelfId));

    for (const ex of exclusions) {
      if (!allowed.has(ex.subjectType)) {
        await this.db
          .delete(schema.shelfExcludedItems)
          .where(
            and(
              eq(schema.shelfExcludedItems.shelfId, shelfId),
              eq(schema.shelfExcludedItems.subjectType, ex.subjectType),
              eq(schema.shelfExcludedItems.subjectId, ex.subjectId),
            ),
          );
      }
    }
  }

  async addExclusion(
    shelfId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<void> {
    await this.db
      .insert(schema.shelfExcludedItems)
      .values({ shelfId, subjectType, subjectId })
      .onConflictDoNothing();
  }

  async isManuallyMember(
    shelfId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<boolean> {
    const row = await this.db.query.shelfItems.findFirst({
      where: and(
        eq(schema.shelfItems.shelfId, shelfId),
        eq(schema.shelfItems.subjectType, subjectType),
        eq(schema.shelfItems.subjectId, subjectId),
      ),
    });
    return !!row;
  }
}
