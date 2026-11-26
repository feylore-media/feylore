import type { ShelfSortLevel } from "../../../shared/shelf-sort.js";
import type { BookListItem } from "../../../shared/books.js";
import type { MovieListItem } from "../../../shared/movies.js";
import type { ShelfWorkSummary } from "../../../shared/shelves.js";
import type { UnifiedShelfMember } from "./membership.js";

export interface SortableShelfMember extends UnifiedShelfMember {
  work: BookListItem | MovieListItem | ShelfWorkSummary | null;
}

export function sortShelfMembers(
  members: SortableShelfMember[],
  sortLevels: ShelfSortLevel[],
): SortableShelfMember[] {
  if (sortLevels.length === 0) {
    return [...members].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.addedAt.getTime() - b.addedAt.getTime();
    });
  }

  return [...members].sort((a, b) => {
    for (const level of sortLevels) {
      const cmp = compareByField(a, b, level);
      if (cmp !== 0) {
        return level.order === "asc" ? cmp : -cmp;
      }
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.addedAt.getTime() - b.addedAt.getTime();
  });
}

function compareByField(
  a: SortableShelfMember,
  b: SortableShelfMember,
  level: ShelfSortLevel,
): number {
  const av = extractSortValue(a, level.field);
  const bv = extractSortValue(b, level.field);
  return compareValues(av, bv);
}

function extractSortValue(
  member: SortableShelfMember,
  field: ShelfSortLevel["field"],
): string | number | boolean | null {
  if (field === "manualOrder") {
    return member.sortOrder;
  }

  const work = member.work;
  if (!work) return null;

  if ("authors" in work) {
    const book = work as BookListItem;
    switch (field) {
      case "title":
        return book.title ?? "";
      case "addedAt":
        return book.addedAt ?? "";
      case "updatedAt":
        return book.updatedAt ?? "";
      case "creator":
        return book.authors?.[0] ?? "";
      case "status":
        return book.progress ? "in_progress" : "unread";
      default:
        return null;
    }
  }

  if ("director" in work || "releaseDate" in work) {
    const movie = work as MovieListItem;
    switch (field) {
      case "title":
        return movie.title ?? "";
      case "addedAt":
        return movie.addedAt ?? "";
      case "updatedAt":
        return movie.updatedAt ?? "";
      case "creator":
        return movie.directors?.[0] ?? "";
      case "releaseDate":
        return movie.releaseDate ?? "";
      case "status":
        return movie.progress ? "in_progress" : "unread";
      default:
        return null;
    }
  }

  const summary = work as ShelfWorkSummary;
  if (field === "title") return summary.title ?? "";
  return null;
}

function compareValues(
  a: string | number | boolean | null,
  b: string | number | boolean | null,
): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}
