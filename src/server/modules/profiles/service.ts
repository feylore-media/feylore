import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import {
  PROFILE_OBSESSION_MAX,
  normalizeProfileCosmetics,
  recognizeProfileLinkProvider,
  type ExtendedProfileUpdate,
  type ObsessionTargetType,
  type ProfileArtifactType,
  type ProfileArtifactSize,
} from "../../../shared/profile-platform.js";
import { sanitizeProfileCss } from "./css-sanitize.js";
import { generateId } from "../../security/crypto.js";

const DEFAULT_ARTIFACTS: Array<{
  artifactType: ProfileArtifactType;
  size: ProfileArtifactSize;
  config: Record<string, unknown>;
}> = [
  { artifactType: "obsessions", size: "wide", config: {} },
  { artifactType: "favorite-quote", size: "small", config: {} },
  { artifactType: "favorites", size: "medium", config: { limit: 6 } },
  { artifactType: "currently-reading", size: "wide", config: { limit: 5 } },
  { artifactType: "recent-five-star", size: "small", config: { limit: 5 } },
  { artifactType: "shelf", size: "wide", config: {} },
];

export class ProfilePlatformService {
  constructor(private readonly db: Database) {}

  async ensureUserProfile(userId: string) {
    const existing = await this.db.query.userProfiles.findFirst({
      where: eq(schema.userProfiles.userId, userId),
    });
    if (existing) return existing;
    await this.db
      .insert(schema.userProfiles)
      .values({ userId })
      .onConflictDoNothing();
    const row = await this.db.query.userProfiles.findFirst({
      where: eq(schema.userProfiles.userId, userId),
    });
    if (!row) throw new NotFoundError("Profile not found");
    await this.ensureDefaultArtifacts(userId);
    return row;
  }

  private async ensureDefaultArtifacts(userId: string) {
    const existing = await this.db
      .select({ id: schema.userProfileArtifacts.id })
      .from(schema.userProfileArtifacts)
      .where(eq(schema.userProfileArtifacts.userId, userId))
      .limit(1);
    if (existing.length > 0) return;
    let order = 0;
    for (const def of DEFAULT_ARTIFACTS) {
      await this.db.insert(schema.userProfileArtifacts).values({
        id: generateId(),
        userId,
        artifactType: def.artifactType,
        config: def.config,
        sortOrder: order++,
        size: def.size,
        isVisible: true,
      });
    }
  }

  async getProfileRow(userId: string) {
    return this.ensureUserProfile(userId);
  }

  async updateExtendedProfile(userId: string, input: ExtendedProfileUpdate) {
    const row = await this.ensureUserProfile(userId);
    const updates: Partial<typeof schema.userProfiles.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.pronouns !== undefined) {
      updates.pronouns = input.pronouns?.trim() ? input.pronouns.trim() : null;
    }
    if (input.bannerFileId !== undefined) updates.bannerFileId = input.bannerFileId;
    if (input.accent !== undefined) updates.accent = input.accent;
    if (input.cardStyle !== undefined) updates.cardStyle = input.cardStyle;
    if (input.heroTreatment !== undefined) updates.heroTreatment = input.heroTreatment;
    if (input.surfaceTreatment !== undefined) updates.surfaceTreatment = input.surfaceTreatment;
    if (input.customCss !== undefined) {
      updates.customCss = input.customCss
        ? sanitizeProfileCss(input.customCss)
        : null;
    }
    if (input.guestbookEnabled !== undefined) {
      updates.guestbookEnabled = input.guestbookEnabled;
    }
    if (input.cosmetics !== undefined) {
      // Merge onto existing cosmetics so future cosmetic classes survive a
      // partial update; unknown/invalid stored values normalize to defaults.
      const merged = {
        ...normalizeProfileCosmetics(row.cosmetics),
        ...input.cosmetics,
      };
      updates.cosmetics = normalizeProfileCosmetics(merged);
    }
    await this.db
      .update(schema.userProfiles)
      .set(updates)
      .where(eq(schema.userProfiles.userId, userId));
    return this.getProfileRow(userId);
  }

  // ---- Links ----

  async listLinks(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.userProfileLinks)
      .where(eq(schema.userProfileLinks.userId, userId))
      .orderBy(asc(schema.userProfileLinks.sortOrder), asc(schema.userProfileLinks.createdAt));
    return rows.map((row) => {
      const recognized = recognizeProfileLinkProvider(row.url);
      return {
        id: row.id,
        label: row.label,
        url: row.url,
        sortOrder: row.sortOrder,
        provider: recognized.key,
        providerLabel: recognized.label,
      };
    });
  }

  async addLink(userId: string, label: string, url: string) {
    const existing = await this.db
      .select({ maxOrder: sql<number | null>`max(${schema.userProfileLinks.sortOrder})` })
      .from(schema.userProfileLinks)
      .where(eq(schema.userProfileLinks.userId, userId));
    const nextOrder = (existing[0]?.maxOrder ?? -1) + 1;
    if (nextOrder > 50) throw new ValidationError("Too many profile links");
    const id = generateId();
    await this.db.insert(schema.userProfileLinks).values({
      id,
      userId,
      label: label.trim(),
      url: url.trim(),
      sortOrder: nextOrder,
    });
    const rows = await this.listLinks(userId);
    const created = rows.find((r) => r.id === id);
    if (!created) throw new NotFoundError("Link not found");
    return created;
  }

  async updateLink(userId: string, linkId: string, label: string, url: string) {
    const row = await this.db.query.userProfileLinks.findFirst({
      where: and(
        eq(schema.userProfileLinks.id, linkId),
        eq(schema.userProfileLinks.userId, userId),
      ),
    });
    if (!row) throw new NotFoundError("Link not found");
    await this.db
      .update(schema.userProfileLinks)
      .set({ label: label.trim(), url: url.trim(), updatedAt: new Date() })
      .where(eq(schema.userProfileLinks.id, linkId));
    const rows = await this.listLinks(userId);
    return rows.find((r) => r.id === linkId) ?? null;
  }

  async deleteLink(userId: string, linkId: string) {
    await this.db
      .delete(schema.userProfileLinks)
      .where(
        and(
          eq(schema.userProfileLinks.id, linkId),
          eq(schema.userProfileLinks.userId, userId),
        ),
      );
  }

  async reorderLinks(userId: string, orderedIds: string[]) {
    const rows = await this.db
      .select({ id: schema.userProfileLinks.id })
      .from(schema.userProfileLinks)
      .where(eq(schema.userProfileLinks.userId, userId));
    const owned = new Set(rows.map((r) => r.id));
    if (orderedIds.length !== owned.size || !orderedIds.every((id) => owned.has(id))) {
      throw new ValidationError("Reorder must include exactly the user's links");
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db
        .update(schema.userProfileLinks)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(eq(schema.userProfileLinks.id, orderedIds[i]!));
    }
    return this.listLinks(userId);
  }

  // ---- Follows ----

  async follow(followerUserId: string, followedUserId: string) {
    if (followerUserId === followedUserId) {
      throw new ValidationError("You cannot follow yourself");
    }
    const followed = await this.db.query.users.findFirst({
      where: eq(schema.users.id, followedUserId),
    });
    if (!followed) throw new NotFoundError("User not found");
    await this.db
      .insert(schema.userFollows)
      .values({ followerUserId, followedUserId })
      .onConflictDoNothing();
    return this.getFollowState(followerUserId, followedUserId);
  }

  async unfollow(followerUserId: string, followedUserId: string) {
    await this.db
      .delete(schema.userFollows)
      .where(
        and(
          eq(schema.userFollows.followerUserId, followerUserId),
          eq(schema.userFollows.followedUserId, followedUserId),
        ),
      );
    return this.getFollowState(followerUserId, followedUserId);
  }

  async getFollowState(viewerUserId: string | null, profileUserId: string) {
    if (!viewerUserId || viewerUserId === profileUserId) {
      const counts = await this.getFollowCounts(profileUserId);
      return { isFollowing: false, ...counts };
    }
    const row = await this.db.query.userFollows.findFirst({
      where: and(
        eq(schema.userFollows.followerUserId, viewerUserId),
        eq(schema.userFollows.followedUserId, profileUserId),
      ),
    });
    const counts = await this.getFollowCounts(profileUserId);
    return { isFollowing: !!row, ...counts };
  }

  async getFollowCounts(userId: string) {
    const [followers, following] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.userFollows)
        .where(eq(schema.userFollows.followedUserId, userId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.userFollows)
        .where(eq(schema.userFollows.followerUserId, userId)),
    ]);
    return {
      followers: followers[0]?.count ?? 0,
      following: following[0]?.count ?? 0,
    };
  }

  async listFollowers(userId: string, limit = 50, offset = 0) {
    const rows = await this.db
      .select({
        user: schema.users,
        cosmetics: schema.userProfiles.cosmetics,
        createdAt: schema.userFollows.createdAt,
      })
      .from(schema.userFollows)
      .innerJoin(schema.users, eq(schema.users.id, schema.userFollows.followerUserId))
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.users.id))
      .where(eq(schema.userFollows.followedUserId, userId))
      .orderBy(desc(schema.userFollows.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset);
    return rows;
  }

  async listFollowing(userId: string, limit = 50, offset = 0) {
    const rows = await this.db
      .select({
        user: schema.users,
        cosmetics: schema.userProfiles.cosmetics,
        createdAt: schema.userFollows.createdAt,
      })
      .from(schema.userFollows)
      .innerJoin(schema.users, eq(schema.users.id, schema.userFollows.followedUserId))
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.users.id))
      .where(eq(schema.userFollows.followerUserId, userId))
      .orderBy(desc(schema.userFollows.createdAt))
      .limit(Math.min(limit, 100))
      .offset(offset);
    return rows;
  }

  // ---- Obsessions ----

  async listObsessions(userId: string) {
    return this.db
      .select()
      .from(schema.profileObsessions)
      .where(eq(schema.profileObsessions.userId, userId))
      .orderBy(asc(schema.profileObsessions.sortOrder));
  }

  async addObsession(
    userId: string,
    targetType: ObsessionTargetType,
    targetId: string,
    note?: string | null,
  ) {
    const existing = await this.listObsessions(userId);
    if (existing.length >= PROFILE_OBSESSION_MAX) {
      throw new ValidationError("You can pin up to 3 obsessions");
    }
    const duplicate = existing.find(
      (o) => o.targetType === targetType && o.targetId === targetId,
    );
    if (duplicate) throw new ConflictError("Already pinned");
    const id = generateId();
    await this.db.insert(schema.profileObsessions).values({
      id,
      userId,
      targetType,
      targetId,
      note: note?.trim() ? note.trim().slice(0, 140) : null,
      sortOrder: existing.length,
    });
    return this.db.query.profileObsessions.findFirst({
      where: eq(schema.profileObsessions.id, id),
    });
  }

  async updateObsession(
    userId: string,
    obsessionId: string,
    note: string | null | undefined,
  ) {
    const row = await this.db.query.profileObsessions.findFirst({
      where: and(
        eq(schema.profileObsessions.id, obsessionId),
        eq(schema.profileObsessions.userId, userId),
      ),
    });
    if (!row) throw new NotFoundError("Obsession not found");
    await this.db
      .update(schema.profileObsessions)
      .set({ note: note?.trim() ? note.trim().slice(0, 140) : null })
      .where(eq(schema.profileObsessions.id, obsessionId));
    return this.db.query.profileObsessions.findFirst({
      where: eq(schema.profileObsessions.id, obsessionId),
    });
  }

  async deleteObsession(userId: string, obsessionId: string) {
    await this.db
      .delete(schema.profileObsessions)
      .where(
        and(
          eq(schema.profileObsessions.id, obsessionId),
          eq(schema.profileObsessions.userId, userId),
        ),
      );
    // Compact sort order
    const remaining = await this.listObsessions(userId);
    for (let i = 0; i < remaining.length; i++) {
      await this.db
        .update(schema.profileObsessions)
        .set({ sortOrder: i })
        .where(eq(schema.profileObsessions.id, remaining[i]!.id));
    }
  }

  async reorderObsessions(userId: string, orderedIds: string[]) {
    const rows = await this.listObsessions(userId);
    const owned = new Set(rows.map((r) => r.id));
    if (orderedIds.length !== owned.size || !orderedIds.every((id) => owned.has(id))) {
      throw new ValidationError("Reorder must include exactly your obsessions");
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db
        .update(schema.profileObsessions)
        .set({ sortOrder: i })
        .where(eq(schema.profileObsessions.id, orderedIds[i]!));
    }
    return this.listObsessions(userId);
  }

  // ---- Artifacts ----

  async listArtifacts(userId: string) {
    await this.ensureDefaultArtifacts(userId);
    return this.db
      .select()
      .from(schema.userProfileArtifacts)
      .where(eq(schema.userProfileArtifacts.userId, userId))
      .orderBy(asc(schema.userProfileArtifacts.sortOrder));
  }

  async addArtifact(
    userId: string,
    artifactType: ProfileArtifactType,
    config: Record<string, unknown>,
    size: ProfileArtifactSize,
    isVisible: boolean,
  ) {
    const existing = await this.db
      .select({ maxOrder: sql<number | null>`max(${schema.userProfileArtifacts.sortOrder})` })
      .from(schema.userProfileArtifacts)
      .where(eq(schema.userProfileArtifacts.userId, userId));
    const nextOrder = (existing[0]?.maxOrder ?? -1) + 1;
    if (nextOrder > 50) throw new ValidationError("Too many artifacts");
    const id = generateId();
    await this.db.insert(schema.userProfileArtifacts).values({
      id,
      userId,
      artifactType,
      config,
      sortOrder: nextOrder,
      size,
      isVisible,
    });
    return this.db.query.userProfileArtifacts.findFirst({
      where: eq(schema.userProfileArtifacts.id, id),
    });
  }

  async patchArtifact(
    userId: string,
    artifactId: string,
    patch: {
      config?: Record<string, unknown>;
      size?: ProfileArtifactSize;
      isVisible?: boolean;
      sortOrder?: number;
    },
  ) {
    const row = await this.db.query.userProfileArtifacts.findFirst({
      where: and(
        eq(schema.userProfileArtifacts.id, artifactId),
        eq(schema.userProfileArtifacts.userId, userId),
      ),
    });
    if (!row) throw new NotFoundError("Artifact not found");
    const updates: Partial<typeof schema.userProfileArtifacts.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (patch.config !== undefined) updates.config = patch.config;
    if (patch.size !== undefined) updates.size = patch.size;
    if (patch.isVisible !== undefined) updates.isVisible = patch.isVisible;
    if (patch.sortOrder !== undefined) updates.sortOrder = patch.sortOrder;
    await this.db
      .update(schema.userProfileArtifacts)
      .set(updates)
      .where(eq(schema.userProfileArtifacts.id, artifactId));
    return this.db.query.userProfileArtifacts.findFirst({
      where: eq(schema.userProfileArtifacts.id, artifactId),
    });
  }

  async deleteArtifact(userId: string, artifactId: string) {
    await this.db
      .delete(schema.userProfileArtifacts)
      .where(
        and(
          eq(schema.userProfileArtifacts.id, artifactId),
          eq(schema.userProfileArtifacts.userId, userId),
        ),
      );
  }

  async reorderArtifacts(userId: string, orderedIds: string[]) {
    const rows = await this.db
      .select({ id: schema.userProfileArtifacts.id })
      .from(schema.userProfileArtifacts)
      .where(eq(schema.userProfileArtifacts.userId, userId));
    const owned = new Set(rows.map((r) => r.id));
    if (orderedIds.length !== owned.size || !orderedIds.every((id) => owned.has(id))) {
      throw new ValidationError("Reorder must include exactly your artifacts");
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db
        .update(schema.userProfileArtifacts)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(eq(schema.userProfileArtifacts.id, orderedIds[i]!));
    }
    return this.listArtifacts(userId);
  }

  // ---- Guestbook ----

  async listGuestbook(profileUserId: string, limit = 20, offset = 0) {
    const rows = await this.db
      .select({
        entry: schema.profileGuestbookEntries,
        author: schema.users,
        authorCosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.profileGuestbookEntries)
      .innerJoin(schema.users, eq(schema.users.id, schema.profileGuestbookEntries.authorUserId))
      .leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.users.id))
      .where(
        and(
          eq(schema.profileGuestbookEntries.profileUserId, profileUserId),
          isNull(schema.profileGuestbookEntries.deletedAt),
        ),
      )
      .orderBy(desc(schema.profileGuestbookEntries.createdAt))
      .limit(Math.min(limit, 50))
      .offset(offset);
    return rows;
  }

  async postGuestbook(profileUserId: string, authorUserId: string, body: string) {
    const profile = await this.ensureUserProfile(profileUserId);
    if (!profile.guestbookEnabled && profileUserId !== authorUserId) {
      throw new ForbiddenError("Guestbook is disabled");
    }
    const trimmed = body.trim();
    if (!trimmed) throw new ValidationError("Entry cannot be empty");
    if (trimmed.length > 1000) throw new ValidationError("Entry is too long");
    const id = generateId();
    await this.db.insert(schema.profileGuestbookEntries).values({
      id,
      profileUserId,
      authorUserId,
      body: trimmed,
    });
    return this.db.query.profileGuestbookEntries.findFirst({
      where: eq(schema.profileGuestbookEntries.id, id),
    });
  }

  async editGuestbookEntry(entryId: string, authorUserId: string, body: string) {
    const row = await this.db.query.profileGuestbookEntries.findFirst({
      where: eq(schema.profileGuestbookEntries.id, entryId),
    });
    if (!row || row.deletedAt) throw new NotFoundError("Entry not found");
    if (row.authorUserId !== authorUserId) {
      throw new ForbiddenError("You can only edit your own entries");
    }
    const trimmed = body.trim();
    if (!trimmed) throw new ValidationError("Entry cannot be empty");
    await this.db
      .update(schema.profileGuestbookEntries)
      .set({ body: trimmed.slice(0, 1000), updatedAt: new Date() })
      .where(eq(schema.profileGuestbookEntries.id, entryId));
    return this.db.query.profileGuestbookEntries.findFirst({
      where: eq(schema.profileGuestbookEntries.id, entryId),
    });
  }

  async deleteGuestbookEntry(entryId: string, viewerUserId: string) {
    const row = await this.db.query.profileGuestbookEntries.findFirst({
      where: eq(schema.profileGuestbookEntries.id, entryId),
    });
    if (!row || row.deletedAt) throw new NotFoundError("Entry not found");
    const isAuthor = row.authorUserId === viewerUserId;
    const isOwner = row.profileUserId === viewerUserId;
    if (!isAuthor && !isOwner) {
      throw new ForbiddenError("Not allowed to delete this entry");
    }
    await this.db
      .update(schema.profileGuestbookEntries)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.profileGuestbookEntries.id, entryId));
  }

  bannerUrl(bannerFileId: string | null | undefined): string | undefined {
    if (!bannerFileId) return undefined;
    return `/api/v1/files/${bannerFileId}/content`;
  }
}
