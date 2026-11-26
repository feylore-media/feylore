import { z } from "zod";
import { DEFAULT_SHELF_ICON_ID, shelfIconIdSchema } from "./shelf-icons.js";
import type { BookListItem } from "./books.js";
import type { MovieListItem } from "./movies.js";
import type { ShelfScopeId } from "./shelf-scopes.js";
import { SHELF_SCOPE_IDS } from "./shelf-scopes.js";
import type { ShelfExpression } from "./shelf-expression.js";
import { shelfMembershipExpressionSchema } from "./shelf-expression.js";
import type { ShelfSortLevel } from "./shelf-sort.js";
import { shelfSortLevelsSchema } from "./shelf-sort.js";
import type { ProfileCosmetics } from "./profile-cosmetics.js";
export type { ShelfSortLevel } from "./shelf-sort.js";
export type { ShelfScopeId } from "./shelf-scopes.js";

export const SHELF_VISIBILITY_MODES = [
  "private",
  "shared",
  "collaborative",
] as const;

export type ShelfVisibility = (typeof SHELF_VISIBILITY_MODES)[number];

export type ShelfMembershipSource = "manual" | "rule";

export interface ShelfWorkSummary {
  subjectType: string;
  subjectId: string;
  title: string;
  coverFileId?: string | null;
}

export interface ShelfEditorPublic {
  userId: string;
  username: string;
  displayName: string;
  cosmetics?: ProfileCosmetics | null;
}

export interface ShelfPublic {
  id: string;
  name: string;
  icon: string;
  scope: ShelfScopeId;
  visibility: ShelfVisibility;
  membershipExpression?: ShelfExpression | null;
  sortLevels: ShelfSortLevel[];
  ownerUserId: string;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShelfItemRef {
  subjectType: string;
  subjectId: string;
  sortOrder: number;
  addedAt: string;
  membershipSources: ShelfMembershipSource[];
}

export interface ResolvedShelfItem extends ShelfItemRef {
  work: BookListItem | MovieListItem | ShelfWorkSummary | null;
  /** @deprecated Use work instead */
  book: BookListItem | null;
}

export interface ShelfDetail {
  shelf: ShelfPublic;
  canEdit: boolean;
  editors: ShelfEditorPublic[];
  items: ResolvedShelfItem[];
}

export interface ShelfScopeChangePreview {
  incompatibleItems: ShelfItemRef[];
}

export interface ShelfScopeChangeInput {
  confirm: boolean;
  removeIncompatibleManualItems: boolean;
  pruneIncompatibleExclusions?: boolean;
}

export const shelfItemRefSchema = z.object({
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
});

export const shelfItemOrderSchema = z.object({
  items: z
    .array(
      z.object({
        subjectType: z.string().min(1),
        subjectId: z.string().min(1),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1),
});

export const shelfScopeChangeSchema = z.object({
  confirm: z.boolean(),
  removeIncompatibleManualItems: z.boolean(),
  pruneIncompatibleExclusions: z.boolean().optional(),
});

export const createShelfSchema = z.object({
  name: z.string().min(1),
  icon: shelfIconIdSchema.default(DEFAULT_SHELF_ICON_ID),
  scope: z.enum(SHELF_SCOPE_IDS).default("global"),
  visibility: z.enum(SHELF_VISIBILITY_MODES).default("private"),
  membershipExpression: shelfMembershipExpressionSchema.optional(),
  sortLevels: shelfSortLevelsSchema.default([]),
  editors: z.array(z.string().uuid()).optional(),
  confirmEmptyEditors: z.boolean().optional(),
});

export const updateShelfSchema = z.object({
  name: z.string().min(1).optional(),
  icon: shelfIconIdSchema.optional(),
  scope: z.enum(SHELF_SCOPE_IDS).optional(),
  visibility: z.enum(SHELF_VISIBILITY_MODES).optional(),
  membershipExpression: shelfMembershipExpressionSchema.optional(),
  sortLevels: shelfSortLevelsSchema.optional(),
  editors: z.array(z.string().uuid()).optional(),
  confirmEmptyEditors: z.boolean().optional(),
  scopeChange: shelfScopeChangeSchema.optional(),
});

export const shelfEditorsSchema = z.object({
  userIds: z.array(z.string().uuid()),
});
