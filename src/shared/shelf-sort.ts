import { z } from "zod";
import type { ShelfScopeId } from "./shelf-scopes.js";
import { subjectTypesForShelfScope } from "./shelf-scopes.js";

export const SHELF_SORT_FIELD_IDS = [
  "title",
  "addedAt",
  "updatedAt",
  "creator",
  "releaseDate",
  "status",
  "manualOrder",
] as const;

export type ShelfSortFieldId = (typeof SHELF_SORT_FIELD_IDS)[number];

export interface ShelfSortLevel {
  field: ShelfSortFieldId;
  order: "asc" | "desc";
}

export const shelfSortLevelSchema = z.object({
  field: z.enum(SHELF_SORT_FIELD_IDS),
  order: z.enum(["asc", "desc"]),
});

export const shelfSortLevelsSchema = z.array(shelfSortLevelSchema).max(5);

export interface ShelfSortFieldDefinition {
  id: ShelfSortFieldId;
  label: string;
  scopes: ShelfScopeId[] | "all";
}

export const SHELF_SORT_FIELDS: ShelfSortFieldDefinition[] = [
  { id: "title", label: "Title", scopes: "all" },
  { id: "addedAt", label: "Date added", scopes: "all" },
  { id: "updatedAt", label: "Date updated", scopes: "all" },
  { id: "creator", label: "Creator", scopes: ["books", "audiobooks", "music", "movies", "global"] },
  { id: "releaseDate", label: "Release date", scopes: ["books", "movies", "music", "global"] },
  { id: "status", label: "Status", scopes: ["books", "audiobooks", "movies", "tv", "global"] },
  { id: "manualOrder", label: "Manual order", scopes: "all" },
];

export function getSortFieldsForScope(scope: ShelfScopeId): ShelfSortFieldId[] {
  return SHELF_SORT_FIELDS.filter((f) => {
    if (f.scopes === "all") return true;
    return f.scopes.includes(scope) || scope === "global";
  }).map((f) => f.id);
}

export function isSortFieldValidForScope(
  field: ShelfSortFieldId,
  scope: ShelfScopeId,
): boolean {
  return getSortFieldsForScope(scope).includes(field);
}

/** Subject types that support a given sort field (for cross-domain global shelves). */
export function subjectTypesSupportingSortField(
  field: ShelfSortFieldId,
): readonly string[] {
  return subjectTypesForShelfScope("global");
}
