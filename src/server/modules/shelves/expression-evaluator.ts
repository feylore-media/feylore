import type { ShelfExpression } from "../../../shared/shelf-expression.js";
import type { ShelfRuleOperator } from "../../../shared/shelf-expression.js";
import { isFieldApplicableToSubjectType } from "../../../shared/shelf-rule-fields.js";
import type { ShelfScopeId } from "../../../shared/shelf-scopes.js";
import { subjectTypesForShelfScope } from "../../../shared/shelf-scopes.js";
import type { WorkSubjectType } from "../../../shared/subject.js";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type { LibraryMembershipService } from "../library-membership/service.js";
import type { UserStateService } from "../user-state/service.js";
import type { BooksService } from "../books/service.js";
import type { MoviesService } from "../movies/service.js";

export interface SubjectRef {
  subjectType: string;
  subjectId: string;
}

export class ShelfExpressionEvaluator {
  constructor(
    private readonly db: Database,
    private readonly libraryMembership: LibraryMembershipService,
    private readonly userState: UserStateService,
    private readonly books: BooksService,
    private readonly movies: MoviesService,
  ) {}

  async evaluateForUser(
    userId: string,
    scope: ShelfScopeId,
    expression: ShelfExpression,
  ): Promise<SubjectRef[]> {
    const allowedTypes = new Set<WorkSubjectType>(
      subjectTypesForShelfScope(scope) as WorkSubjectType[],
    );
    const memberships = await this.libraryMembership.listForUser(userId);
    const candidates = memberships.filter((m) =>
      allowedTypes.has(m.targetType as WorkSubjectType),
    );

    const matched: SubjectRef[] = [];
    for (const m of candidates) {
      const ok = await this.evaluateSubject(
        userId,
        m.targetType,
        m.targetId,
        expression,
        m.addedAt,
      );
      if (ok) {
        matched.push({ subjectType: m.targetType, subjectId: m.targetId });
      }
    }
    return matched;
  }

  private async evaluateSubject(
    userId: string,
    subjectType: string,
    subjectId: string,
    expression: ShelfExpression,
    addedAt: Date,
  ): Promise<boolean> {
    return this.evalNode(userId, subjectType, subjectId, expression, addedAt);
  }

  private async evalNode(
    userId: string,
    subjectType: string,
    subjectId: string,
    node: ShelfExpression,
    addedAt: Date,
  ): Promise<boolean> {
    if (node.type === "group") {
      if (node.operator === "and") {
        for (const child of node.children) {
          if (
            !(await this.evalNode(
              userId,
              subjectType,
              subjectId,
              child,
              addedAt,
            ))
          ) {
            return false;
          }
        }
        return true;
      }
      for (const child of node.children) {
        if (
          await this.evalNode(userId, subjectType, subjectId, child, addedAt)
        ) {
          return true;
        }
      }
      return false;
    }

    if (!isFieldApplicableToSubjectType(node.field, subjectType)) {
      return false;
    }

    const value = await this.getFieldValue(
      userId,
      subjectType,
      subjectId,
      node.field,
      addedAt,
    );

    if (node.field === "genre") {
      return matchGenre(value as string[], node.operator, node.value);
    }

    return this.compare(node.operator, value, node.value);
  }

  private compare(
    operator: ShelfRuleOperator,
    actual: unknown,
    expected: unknown,
  ): boolean {
    switch (operator) {
      case "eq":
        return actual === expected;
      case "neq":
        return actual !== expected;
      case "contains": {
        if (typeof actual !== "string" || typeof expected !== "string") {
          return false;
        }
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      case "in": {
        if (!Array.isArray(expected)) return false;
        return expected.includes(actual);
      }
      case "gt":
        return compareScalar(actual, expected) > 0;
      case "gte":
        return compareScalar(actual, expected) >= 0;
      case "lt":
        return compareScalar(actual, expected) < 0;
      case "lte":
        return compareScalar(actual, expected) <= 0;
      default:
        return false;
    }
  }

  private async getFieldValue(
    userId: string,
    subjectType: string,
    subjectId: string,
    field: string,
    addedAt: Date,
  ): Promise<unknown> {
    switch (field) {
      case "title":
        return this.getTitle(subjectType, subjectId);
      case "creator":
        return this.getCreator(userId, subjectType, subjectId);
      case "genre":
        return this.getGenres(subjectType, subjectId);
      case "favorite": {
        return this.userState.getFavorite(userId, subjectType, subjectId);
      }
      case "addedAt":
        return addedAt.toISOString();
      case "status":
        return this.getStatus(userId, subjectType, subjectId);
      case "collection":
        return this.getCollection(subjectType, subjectId);
      default:
        return null;
    }
  }

  private async getTitle(
    subjectType: string,
    subjectId: string,
  ): Promise<string> {
    if (subjectType === "book") {
      const book = await this.db.query.books.findFirst({
        where: eq(schema.books.id, subjectId),
      });
      return book?.title ?? "";
    }
    if (subjectType === "movie") {
      const movie = await this.db.query.movies.findFirst({
        where: eq(schema.movies.id, subjectId),
      });
      return movie?.title ?? "";
    }
    return "";
  }

  private async getCreator(
    userId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<string> {
    if (subjectType === "book") {
      const items = await this.books.listBooksByIdsForUser(userId, [
        subjectId,
      ]);
      return items[0]?.authors?.join(", ") ?? "";
    }
    if (subjectType === "movie") {
      const items = await this.movies.listMoviesByIdsForUser(userId, [
        subjectId,
      ]);
      return items[0]?.directors?.join(", ") ?? "";
    }
    return "";
  }

  private async getGenres(
    subjectType: string,
    subjectId: string,
  ): Promise<string[]> {
    if (subjectType === "book") {
      const rows = await this.db
        .select({ name: schema.bookGenres.name })
        .from(schema.bookGenres)
        .where(eq(schema.bookGenres.bookId, subjectId));
      return rows.map((r) => r.name);
    }
    if (subjectType === "movie") {
      const rows = await this.db
        .select({ name: schema.movieGenres.name })
        .from(schema.movieGenres)
        .where(eq(schema.movieGenres.movieId, subjectId));
      return rows.map((r) => r.name);
    }
    return [];
  }

  private async getStatus(
    userId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<string> {
    const progress = await this.userState.getProgress(
      userId,
      subjectType,
      subjectId,
    );
    if (!progress) return "unread";
    const locator = progress.locator as { completed?: boolean };
    if (locator?.completed) return "completed";
    return "in_progress";
  }

  private async getCollection(
    subjectType: string,
    subjectId: string,
  ): Promise<string> {
    if (subjectType === "book") {
      const row = await this.db
        .select({ name: schema.bookSeries.name })
        .from(schema.bookSeriesMembers)
        .innerJoin(
          schema.bookSeries,
          eq(schema.bookSeriesMembers.seriesId, schema.bookSeries.id),
        )
        .where(eq(schema.bookSeriesMembers.bookId, subjectId))
        .limit(1);
      return row[0]?.name ?? "";
    }
    if (subjectType === "movie") {
      const row = await this.db
        .select({ title: schema.movieCollections.title })
        .from(schema.movieCollectionItems)
        .innerJoin(
          schema.movieCollections,
          eq(
            schema.movieCollectionItems.collectionId,
            schema.movieCollections.id,
          ),
        )
        .where(eq(schema.movieCollectionItems.movieId, subjectId))
        .limit(1);
      return row[0]?.title ?? "";
    }
    return "";
  }
}

function compareScalar(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b);
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

function matchGenre(
  genres: string[],
  operator: ShelfRuleOperator,
  expected: unknown,
): boolean {
  const needle = String(expected).toLowerCase();
  if (operator === "eq" || operator === "contains") {
    return genres.some((g) => g.toLowerCase().includes(needle));
  }
  if (operator === "in" && Array.isArray(expected)) {
    return genres.some((g) =>
      expected.map(String).some((e) => g.toLowerCase() === e.toLowerCase()),
    );
  }
  return false;
}
