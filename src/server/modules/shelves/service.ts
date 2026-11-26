import { eq, and, asc, sql, or, ilike } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import type { AuthUser } from "../authorization/service.js";
import { PERMISSIONS } from "../../../shared/permissions.js";
import type { BooksService } from "../books/service.js";
import type { MoviesService } from "../movies/service.js";
import type { LibraryMembershipService } from "../library-membership/service.js";
import type { UserStateService } from "../user-state/service.js";
import type {
  ResolvedShelfItem,
  ShelfDetail,
  ShelfEditorPublic,
  ShelfItemRef,
  ShelfMembershipSource,
  ShelfPublic,
  ShelfScopeChangeInput,
  ShelfVisibility,
} from "../../../shared/shelves.js";
import type { ShelfSortLevel } from "../../../shared/shelf-sort.js";
import type { ShelfExpression } from "../../../shared/shelf-expression.js";
import { isShelfExpression } from "../../../shared/shelf-expression.js";
import { normalizeProfileCosmetics } from "../../../shared/profile-cosmetics.js";
import type { ShelfScopeId } from "../../../shared/shelf-scopes.js";
import {
  isShelfScopeId,
  isShelfVisibleInScope,
  isSubjectEligibleForScope,
  subjectTypesForShelfScope,
} from "../../../shared/shelf-scopes.js";
import { ShelfExpressionEvaluator } from "./expression-evaluator.js";
import { ShelfMembershipService } from "./membership.js";
import { ShelfItemResolver } from "./item-resolver.js";
import { sortShelfMembers, type SortableShelfMember } from "./sort.js";

type ShelfRow = typeof schema.shelves.$inferSelect;

export class ShelfService {
  private readonly evaluator: ShelfExpressionEvaluator;
  private readonly membership: ShelfMembershipService;
  private readonly resolver: ShelfItemResolver;

  constructor(
    private readonly db: Database,
    private readonly books: BooksService,
    private readonly movies: MoviesService,
    private readonly libraryMembership: LibraryMembershipService,
    private readonly userState: UserStateService,
  ) {
    this.evaluator = new ShelfExpressionEvaluator(
      db,
      libraryMembership,
      userState,
      books,
      movies,
    );
    this.membership = new ShelfMembershipService(db, this.evaluator);
    this.resolver = new ShelfItemResolver(books, movies);
  }

  async listAccessible(user: AuthUser, contextScope?: ShelfScopeId) {
    const owned = await this.db
      .select()
      .from(schema.shelves)
      .where(eq(schema.shelves.ownerUserId, user.id));

    const sharedShelves = user.permissions.has(PERMISSIONS.SHELVES_READ)
      ? await this.db
          .select()
          .from(schema.shelves)
          .where(
            or(
              eq(schema.shelves.visibility, "shared"),
              eq(schema.shelves.visibility, "collaborative"),
            ),
          )
      : [];

    const map = new Map<string, ShelfRow>();
    for (const s of [...owned, ...sharedShelves]) {
      map.set(s.id, s);
    }

    let shelves = [...map.values()];
    if (contextScope && isShelfScopeId(contextScope)) {
      shelves = shelves.filter((s) =>
        isShelfVisibleInScope(s.scope as ShelfScopeId, contextScope),
      );
    }
    return shelves;
  }

  async canView(user: AuthUser, shelf: ShelfRow): Promise<boolean> {
    if (shelf.ownerUserId === user.id) return true;

    if (
      (shelf.visibility === "shared" || shelf.visibility === "collaborative") &&
      user.permissions.has(PERMISSIONS.SHELVES_READ)
    ) {
      return true;
    }

    return false;
  }

  async canEdit(user: AuthUser, shelf: ShelfRow): Promise<boolean> {
    if (shelf.ownerUserId === user.id) return true;

    if (shelf.visibility !== "collaborative") return false;

    const grant = await this.db.query.shelfGrants.findFirst({
      where: and(
        eq(schema.shelfGrants.shelfId, shelf.id),
        eq(schema.shelfGrants.userId, user.id),
        eq(schema.shelfGrants.canEdit, true),
      ),
    });
    return !!grant;
  }

  private requirePublishPermission(
    user: AuthUser,
    visibility: ShelfVisibility,
  ): void {
    if (
      (visibility === "shared" || visibility === "collaborative") &&
      !user.permissions.has(PERMISSIONS.SHELF_PUBLISH)
    ) {
      throw new ForbiddenError("Cannot publish shared shelf");
    }
  }

  async create(
    user: AuthUser,
    input: {
      name: string;
      icon?: string;
      scope?: ShelfScopeId;
      visibility?: ShelfVisibility;
      membershipExpression?: ShelfExpression | null;
      sortLevels?: ShelfSortLevel[];
      editors?: string[];
      confirmEmptyEditors?: boolean;
    },
  ) {
    const visibility = input.visibility ?? "private";
    this.requirePublishPermission(user, visibility);

    if (visibility === "collaborative") {
      const editors = input.editors ?? [];
      if (editors.length === 0 && !input.confirmEmptyEditors) {
        throw new ValidationError(
          "Collaborative shelf requires editors or explicit empty confirmation",
        );
      }
    }

    const id = generateId();
    await this.db.insert(schema.shelves).values({
      id,
      ownerUserId: user.id,
      name: input.name,
      icon: input.icon ?? "books",
      scope: input.scope ?? "global",
      visibility,
      kind: "basic",
      membershipExpression: input.membershipExpression ?? null,
      sortLevels: input.sortLevels ?? [],
    });

    if (visibility === "collaborative" && input.editors?.length) {
      await this.setEditors(user, id, input.editors);
    }

    return id;
  }

  async update(
    user: AuthUser,
    shelfId: string,
    input: Partial<{
      name: string;
      icon: string;
      scope: ShelfScopeId;
      visibility: ShelfVisibility;
      membershipExpression: ShelfExpression | null;
      sortLevels: ShelfSortLevel[];
      editors: string[];
      confirmEmptyEditors: boolean;
      scopeChange: ShelfScopeChangeInput;
    }>,
  ) {
    const shelf = await this.getShelf(shelfId);
    if (!(await this.canEdit(user, shelf))) throw new ForbiddenError();

    if (input.visibility) {
      this.requirePublishPermission(user, input.visibility);
    }

    if (
      input.visibility === "collaborative" ||
      (input.visibility === undefined && shelf.visibility === "collaborative")
    ) {
      const nextVisibility = input.visibility ?? shelf.visibility;
      if (nextVisibility === "collaborative" && input.editors !== undefined) {
        if (input.editors.length === 0 && !input.confirmEmptyEditors) {
          throw new ValidationError(
            "Collaborative shelf requires editors or explicit empty confirmation",
          );
        }
      }
    }

    if (input.scope && input.scope !== shelf.scope) {
      await this.handleScopeChange(
        user,
        shelf,
        input.scope,
        input.scopeChange,
      );
    }

    const { editors, confirmEmptyEditors, scopeChange, scope, ...shelfPatch } =
      input;

    if (Object.keys(shelfPatch).length > 0) {
      await this.db
        .update(schema.shelves)
        .set({
          ...shelfPatch,
          ...(scope ? { scope } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.shelves.id, shelfId));
    } else if (scope) {
      await this.db
        .update(schema.shelves)
        .set({ scope, updatedAt: new Date() })
        .where(eq(schema.shelves.id, shelfId));
    }

    if (editors !== undefined && shelf.ownerUserId === user.id) {
      await this.setEditors(user, shelfId, editors);
    }
  }

  private async handleScopeChange(
    user: AuthUser,
    shelf: ShelfRow,
    newScope: ShelfScopeId,
    scopeChange?: ShelfScopeChangeInput,
  ) {
    if (shelf.ownerUserId !== user.id) {
      throw new ForbiddenError("Only owner can change scope");
    }

    const incompatible = await this.membership.listIncompatibleManualItems(
      shelf.id,
      newScope,
      subjectTypesForShelfScope(newScope),
    );

    if (incompatible.length === 0) return;

    if (!scopeChange?.confirm || !scopeChange.removeIncompatibleManualItems) {
      throw new ValidationError("Scope change has incompatible manual items", {
        incompatibleItems: incompatible,
      });
    }

    await this.membership.removeIncompatibleManualItems(
      shelf.id,
      subjectTypesForShelfScope(newScope),
    );

    if (scopeChange.pruneIncompatibleExclusions) {
      await this.membership.pruneIncompatibleExclusions(
        shelf.id,
        subjectTypesForShelfScope(newScope),
      );
    }
  }

  async previewScopeChange(shelfId: string, newScope: ShelfScopeId) {
    return this.membership.listIncompatibleManualItems(
      shelfId,
      newScope,
      subjectTypesForShelfScope(newScope),
    );
  }

  toPublic(shelf: ShelfRow, viewerUserId: string): ShelfPublic {
    const sortLevels = (shelf.sortLevels ?? []) as ShelfSortLevel[];
    const membershipExpression =
      shelf.membershipExpression && isShelfExpression(shelf.membershipExpression)
        ? shelf.membershipExpression
        : undefined;

    return {
      id: shelf.id,
      name: shelf.name,
      icon: shelf.icon,
      scope: shelf.scope as ShelfScopeId,
      visibility: shelf.visibility as ShelfVisibility,
      membershipExpression,
      sortLevels,
      ownerUserId: shelf.ownerUserId,
      isOwner: shelf.ownerUserId === viewerUserId,
      createdAt: shelf.createdAt.toISOString(),
      updatedAt: shelf.updatedAt.toISOString(),
    };
  }

  async getShelf(shelfId: string) {
    const shelf = await this.db.query.shelves.findFirst({
      where: eq(schema.shelves.id, shelfId),
    });
    if (!shelf) throw new NotFoundError("Shelf not found");
    return shelf;
  }

  async requireView(user: AuthUser, shelfId: string) {
    const shelf = await this.getShelf(shelfId);
    if (!(await this.canView(user, shelf))) throw new ForbiddenError();
    return shelf;
  }

  async delete(user: AuthUser, shelfId: string) {
    const shelf = await this.getShelf(shelfId);
    if (!(await this.canEdit(user, shelf))) throw new ForbiddenError();
    await this.db.delete(schema.shelves).where(eq(schema.shelves.id, shelfId));
  }

  private async nextSortOrder(shelfId: string): Promise<number> {
    const [row] = await this.db
      .select({
        maxOrder: sql<number>`coalesce(max(${schema.shelfItems.sortOrder}), -1)`,
      })
      .from(schema.shelfItems)
      .where(eq(schema.shelfItems.shelfId, shelfId));
    return (row?.maxOrder ?? -1) + 1;
  }

  async addItem(
    user: AuthUser,
    shelfId: string,
    subjectType: string,
    subjectId: string,
  ) {
    const shelf = await this.getShelf(shelfId);
    if (!(await this.canEdit(user, shelf))) throw new ForbiddenError();

    if (!isSubjectEligibleForScope(subjectType, shelf.scope as ShelfScopeId)) {
      throw new ValidationError("Item not eligible for shelf scope");
    }

    const sortOrder = await this.nextSortOrder(shelfId);
    await this.db
      .insert(schema.shelfItems)
      .values({ shelfId, subjectType, subjectId, sortOrder })
      .onConflictDoNothing();

    await this.db
      .delete(schema.shelfExcludedItems)
      .where(
        and(
          eq(schema.shelfExcludedItems.shelfId, shelfId),
          eq(schema.shelfExcludedItems.subjectType, subjectType),
          eq(schema.shelfExcludedItems.subjectId, subjectId),
        ),
      );
  }

  async removeItem(
    user: AuthUser,
    shelfId: string,
    subjectType: string,
    subjectId: string,
  ) {
    const shelf = await this.getShelf(shelfId);
    if (!(await this.canEdit(user, shelf))) throw new ForbiddenError();

    const isManual = await this.membership.isManuallyMember(
      shelfId,
      subjectType,
      subjectId,
    );

    if (isManual) {
      await this.db
        .delete(schema.shelfItems)
        .where(
          and(
            eq(schema.shelfItems.shelfId, shelfId),
            eq(schema.shelfItems.subjectType, subjectType),
            eq(schema.shelfItems.subjectId, subjectId),
          ),
        );
    } else {
      await this.membership.addExclusion(shelfId, subjectType, subjectId);
    }
  }

  async listItems(
    user: AuthUser,
    shelfId: string,
    source?: ShelfMembershipSource | "all",
  ) {
    const shelf = await this.requireView(user, shelfId);
    const members = await this.membership.getUnifiedMembership(
      user.id,
      shelf,
      source,
    );
    return members;
  }

  toItemRef(member: {
    subjectType: string;
    subjectId: string;
    sortOrder: number;
    addedAt: Date;
    membershipSources: ShelfMembershipSource[];
  }): ShelfItemRef {
    return {
      subjectType: member.subjectType,
      subjectId: member.subjectId,
      sortOrder: member.sortOrder,
      addedAt: member.addedAt.toISOString(),
      membershipSources: member.membershipSources,
    };
  }

  async getShelfDetailForUser(
    user: AuthUser,
    shelfId: string,
    source?: ShelfMembershipSource | "all",
  ): Promise<ShelfDetail> {
    const shelf = await this.requireView(user, shelfId);
    const members = await this.membership.getUnifiedMembership(
      user.id,
      shelf,
      source,
    );

    const resolved = await this.resolver.resolveMembers(user.id, members);
    const sortLevels = (shelf.sortLevels ?? []) as ShelfSortLevel[];
    const sortable: SortableShelfMember[] = resolved.map((r, i) => ({
      ...members[i]!,
      work: r.work,
    }));
    const sorted = sortShelfMembers(sortable, sortLevels);
    const sortedResolved: ResolvedShelfItem[] = sorted.map((m) => {
      const r = resolved.find(
        (x) =>
          x.subjectType === m.subjectType && x.subjectId === m.subjectId,
      )!;
      return { ...r, sortOrder: m.sortOrder };
    });

    const editors = await this.listEditors(shelf);

    return {
      shelf: this.toPublic(shelf, user.id),
      canEdit: await this.canEdit(user, shelf),
      editors,
      items: sortedResolved,
    };
  }

  async reorderItems(
    user: AuthUser,
    shelfId: string,
    items: { subjectType: string; subjectId: string; sortOrder: number }[],
  ) {
    const shelf = await this.getShelf(shelfId);
    if (!(await this.canEdit(user, shelf))) throw new ForbiddenError();

    await this.db.transaction(async (tx) => {
      for (const item of items) {
        const isManual = await tx.query.shelfItems.findFirst({
          where: and(
            eq(schema.shelfItems.shelfId, shelfId),
            eq(schema.shelfItems.subjectType, item.subjectType),
            eq(schema.shelfItems.subjectId, item.subjectId),
          ),
        });
        if (isManual) {
          await tx
            .update(schema.shelfItems)
            .set({ sortOrder: item.sortOrder })
            .where(
              and(
                eq(schema.shelfItems.shelfId, shelfId),
                eq(schema.shelfItems.subjectType, item.subjectType),
                eq(schema.shelfItems.subjectId, item.subjectId),
              ),
            );
        } else {
          await tx.insert(schema.shelfItems).values({
            shelfId,
            subjectType: item.subjectType,
            subjectId: item.subjectId,
            sortOrder: item.sortOrder,
          });
        }
      }
    });
  }

  async listShelvesForSubject(
    user: AuthUser,
    subjectType: string,
    subjectId: string,
    contextScope?: ShelfScopeId,
  ) {
    const manualRows = await this.db
      .select({ shelf: schema.shelves })
      .from(schema.shelfItems)
      .innerJoin(schema.shelves, eq(schema.shelfItems.shelfId, schema.shelves.id))
      .where(
        and(
          eq(schema.shelfItems.subjectType, subjectType),
          eq(schema.shelfItems.subjectId, subjectId),
        ),
      );

    const map = new Map<string, ShelfRow>();
    for (const row of manualRows) {
      if (await this.canView(user, row.shelf)) {
        map.set(row.shelf.id, row.shelf);
      }
    }

    const accessible = await this.listAccessible(user, contextScope);
    for (const shelf of accessible) {
      if (map.has(shelf.id)) continue;
      const members = await this.membership.getUnifiedMembership(
        user.id,
        shelf,
      );
      if (
        members.some(
          (m) => m.subjectType === subjectType && m.subjectId === subjectId,
        )
      ) {
        map.set(shelf.id, shelf);
      }
    }

    let shelves = [...map.values()];
    if (contextScope) {
      shelves = shelves.filter((s) =>
        isShelfVisibleInScope(s.scope as ShelfScopeId, contextScope),
      );
    }

    return shelves.map((s) => this.toPublic(s, user.id));
  }

  async listEditors(shelf: ShelfRow): Promise<ShelfEditorPublic[]> {
    if (shelf.visibility !== "collaborative") return [];

    const grants = await this.db
      .select({
        userId: schema.shelfGrants.userId,
        username: schema.users.username,
        displayName: schema.users.displayName,
        cosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.shelfGrants)
      .innerJoin(schema.users, eq(schema.shelfGrants.userId, schema.users.id))
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.shelfGrants.shelfId, shelf.id),
          eq(schema.shelfGrants.canEdit, true),
        ),
      );

    return grants.map((g) => ({
      userId: g.userId,
      username: g.username,
      displayName: g.displayName,
      cosmetics: normalizeProfileCosmetics(g.cosmetics),
    }));
  }

  async getEditors(user: AuthUser, shelfId: string) {
    const shelf = await this.getShelf(shelfId);
    if (shelf.ownerUserId !== user.id) throw new ForbiddenError();
    return this.listEditors(shelf);
  }

  async setEditors(user: AuthUser, shelfId: string, userIds: string[]) {
    const shelf = await this.getShelf(shelfId);
    if (shelf.ownerUserId !== user.id) throw new ForbiddenError();

    if (userIds.includes(user.id)) {
      throw new ValidationError("Owner cannot be added as editor");
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.shelfGrants)
        .where(
          and(
            eq(schema.shelfGrants.shelfId, shelfId),
            eq(schema.shelfGrants.canEdit, true),
          ),
        );

      for (const editorId of userIds) {
        await tx
          .insert(schema.shelfGrants)
          .values({ shelfId, userId: editorId, canEdit: true })
          .onConflictDoUpdate({
            target: [schema.shelfGrants.shelfId, schema.shelfGrants.userId],
            set: { canEdit: true },
          });
      }
    });
  }

  async addEditor(user: AuthUser, shelfId: string, editorUserId: string) {
    const shelf = await this.getShelf(shelfId);
    if (shelf.ownerUserId !== user.id) throw new ForbiddenError();
    if (editorUserId === user.id) {
      throw new ValidationError("Owner cannot be added as editor");
    }

    await this.db
      .insert(schema.shelfGrants)
      .values({ shelfId, userId: editorUserId, canEdit: true })
      .onConflictDoUpdate({
        target: [schema.shelfGrants.shelfId, schema.shelfGrants.userId],
        set: { canEdit: true },
      });
  }

  async removeEditor(user: AuthUser, shelfId: string, editorUserId: string) {
    const shelf = await this.getShelf(shelfId);
    if (shelf.ownerUserId !== user.id) throw new ForbiddenError();

    await this.db
      .delete(schema.shelfGrants)
      .where(
        and(
          eq(schema.shelfGrants.shelfId, shelfId),
          eq(schema.shelfGrants.userId, editorUserId),
          eq(schema.shelfGrants.canEdit, true),
        ),
      );
  }

  async searchUsers(user: AuthUser, query: string) {
    if (!user.permissions.has(PERMISSIONS.SHELVES_WRITE)) {
      throw new ForbiddenError();
    }

    const pattern = `%${query.trim()}%`;
    if (pattern === "%%") return [];

    const rows = await this.db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        cosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.users)
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(
        or(
          ilike(schema.users.username, pattern),
          ilike(schema.users.displayName, pattern),
        ),
      )
      .limit(20);

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      cosmetics: normalizeProfileCosmetics(row.cosmetics),
    }));
  }
}
