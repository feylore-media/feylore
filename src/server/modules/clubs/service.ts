import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId, generateSessionToken } from "../../security/crypto.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import type { AuthUser } from "../authorization/service.js";
import { PERMISSIONS } from "../../../shared/permissions.js";
import type {
  ClubDetail,
  ClubInvitePublic,
  ClubListItem,
  ClubMember,
  ClubPublic,
} from "../../../shared/clubs.js";
import { clubReadDefaultsSchema } from "../../../shared/clubs.js";
import { clubSelectionDefaultsSchema } from "../../../shared/club-selection.js";
import { normalizeProfileCosmetics } from "../../../shared/profile-cosmetics.js";
import type { ClubWorksService } from "./works.js";
import { getClubDiscussionActivityAt } from "./activity.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function membershipTimestamp(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

export class ClubService {
  constructor(
    private readonly db: Database,
    private clubWorks?: ClubWorksService,
  ) {}

  setClubWorksService(clubWorks: ClubWorksService) {
    this.clubWorks = clubWorks;
  }

  async listAccessible(user: AuthUser): Promise<ClubListItem[]> {
    const memberRows = await this.db
      .select({
        club: schema.clubs,
        lastVisitedAt: schema.clubMembers.lastVisitedAt,
      })
      .from(schema.clubMembers)
      .innerJoin(schema.clubs, eq(schema.clubMembers.clubId, schema.clubs.id))
      .where(eq(schema.clubMembers.userId, user.id));

    const memberClubIds = new Set(memberRows.map((r) => r.club.id));
    const lastVisitedByClub = new Map(
      memberRows.map((r) => [r.club.id, r.lastVisitedAt]),
    );

    const publicClubs = user.permissions.has(PERMISSIONS.CLUBS_READ)
      ? await this.db
          .select()
          .from(schema.clubs)
          .where(eq(schema.clubs.visibility, "public"))
      : [];

    const map = new Map<string, typeof schema.clubs.$inferSelect>();
    for (const row of [...memberRows.map((r) => r.club), ...publicClubs]) {
      map.set(row.id, row);
    }

    const clubs = [...map.values()];
    const clubIds = clubs.map((c) => c.id);
    const counts = await this.memberCounts(clubIds);
    const activityAt = await getClubDiscussionActivityAt(this.db, clubIds);
    const currentWorks = this.clubWorks
      ? await this.clubWorks.getCurrentWorkSummariesForClubs(clubIds)
      : new Map<string, null>();

    const canJoinGlobally = user.permissions.has(PERMISSIONS.CLUBS_WRITE);

    return clubs.map((club) => {
      const isMember = memberClubIds.has(club.id);
      const activity = activityAt.get(club.id) ?? null;
      const lastActivityAt = activity;
      const lastVisitedAt = membershipTimestamp(lastVisitedByClub.get(club.id));
      const hasUnreadActivity =
        isMember &&
        lastActivityAt != null &&
        (lastVisitedAt == null || lastActivityAt > lastVisitedAt);

      return {
        ...this.toPublic(club, counts.get(club.id) ?? 0, isMember),
        lastActivityAt,
        currentWork: currentWorks.get(club.id) ?? null,
        canJoin: !isMember && club.visibility === "public" && canJoinGlobally,
        hasUnreadActivity,
      };
    });
  }

  async getClub(clubId: string) {
    const club = await this.db.query.clubs.findFirst({
      where: eq(schema.clubs.id, clubId),
    });
    if (!club) throw new NotFoundError("Club not found");
    return club;
  }

  async getMembership(clubId: string, userId: string) {
    return this.db.query.clubMembers.findFirst({
      where: and(
        eq(schema.clubMembers.clubId, clubId),
        eq(schema.clubMembers.userId, userId),
      ),
    });
  }

  async canView(
    user: AuthUser,
    club: typeof schema.clubs.$inferSelect,
  ): Promise<boolean> {
    const membership = await this.getMembership(club.id, user.id);
    if (membership) return true;
    return (
      club.visibility === "public" &&
      user.permissions.has(PERMISSIONS.CLUBS_READ)
    );
  }

  async canModerate(
    user: AuthUser,
    club: typeof schema.clubs.$inferSelect,
  ): Promise<boolean> {
    if (club.ownerUserId === user.id) return true;
    const membership = await this.getMembership(club.id, user.id);
    return membership?.role === "moderator" || membership?.role === "owner";
  }

  async canAdmin(
    user: AuthUser,
    club: typeof schema.clubs.$inferSelect,
  ): Promise<boolean> {
    return club.ownerUserId === user.id;
  }

  async requireView(user: AuthUser, clubId: string) {
    const club = await this.getClub(clubId);
    if (!(await this.canView(user, club))) throw new ForbiddenError();
    return club;
  }

  async create(
    user: AuthUser,
    input: {
      name: string;
      description?: string;
      visibility: "private" | "public";
      context: "general" | "book" | "video" | "ttrpg";
    },
  ) {
    if (
      input.visibility === "public" &&
      !user.permissions.has(PERMISSIONS.CLUB_PUBLISH)
    ) {
      throw new ForbiddenError("Cannot publish public club");
    }

    const id = generateId();
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.clubs).values({
        id,
        ownerUserId: user.id,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        context: input.context,
      });
      await tx.insert(schema.clubMembers).values({
        clubId: id,
        userId: user.id,
        role: "owner",
      });
    });
    return id;
  }

  async update(
    user: AuthUser,
    clubId: string,
    input: Partial<{
      name: string;
      description: string | null;
      visibility: "private" | "public";
      context: "general" | "book" | "video" | "ttrpg";
      coverFileId: string | null;
    }>,
  ) {
    const club = await this.getClub(clubId);
    if (!(await this.canModerate(user, club))) throw new ForbiddenError();

    if (
      input.visibility === "public" &&
      !user.permissions.has(PERMISSIONS.CLUB_PUBLISH)
    ) {
      throw new ForbiddenError("Cannot publish public club");
    }

    if (input.coverFileId) {
      const file = await this.db.query.files.findFirst({
        where: eq(schema.files.id, input.coverFileId),
      });
      if (!file) throw new NotFoundError("Cover file not found");
    }

    await this.db
      .update(schema.clubs)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.clubs.id, clubId));
  }

  async updateDefaults(user: AuthUser, clubId: string, input: unknown) {
    const club = await this.getClub(clubId);
    if (!(await this.canModerate(user, club))) throw new ForbiddenError();
    const body = z
      .object({
        selection: clubSelectionDefaultsSchema.optional(),
        reading: clubReadDefaultsSchema.optional(),
      })
      .refine((value) => value.selection || value.reading)
      .parse(input);
    if (body.selection?.method === "random_draw") {
      body.selection.configuration.tieBehavior = "moderator";
      body.selection.configuration.resultVisibility = "after_completion";
    }
    await this.db
      .update(schema.clubs)
      .set({
        ...(body.selection ? { selectionDefaults: body.selection } : {}),
        ...(body.reading ? { readDefaults: body.reading } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.clubs.id, clubId));
  }

  async delete(user: AuthUser, clubId: string) {
    const club = await this.getClub(clubId);
    if (!(await this.canAdmin(user, club))) throw new ForbiddenError();
    await this.db.delete(schema.clubs).where(eq(schema.clubs.id, clubId));
  }

  async join(user: AuthUser, clubId: string) {
    const club = await this.getClub(clubId);
    if (club.visibility !== "public") {
      throw new ForbiddenError("This club is invite-only");
    }
    if (!(await this.canView(user, club))) throw new ForbiddenError();

    const existing = await this.getMembership(clubId, user.id);
    if (existing) return;

    await this.db.insert(schema.clubMembers).values({
      clubId,
      userId: user.id,
      role: "member",
    });
  }

  async leave(user: AuthUser, clubId: string) {
    await this.getClub(clubId);
    const membership = await this.getMembership(clubId, user.id);
    if (!membership) throw new ForbiddenError();
    if (membership.role === "owner") {
      throw new ForbiddenError(
        "Club owner cannot leave without transferring ownership",
      );
    }
    await this.db
      .delete(schema.clubMembers)
      .where(
        and(
          eq(schema.clubMembers.clubId, clubId),
          eq(schema.clubMembers.userId, user.id),
        ),
      );
  }

  async listMembers(clubId: string): Promise<ClubMember[]> {
    const rows = await this.db
      .select({
        userId: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        cosmetics: schema.userProfiles.cosmetics,
        role: schema.clubMembers.role,
        joinedAt: schema.clubMembers.joinedAt,
      })
      .from(schema.clubMembers)
      .innerJoin(schema.users, eq(schema.clubMembers.userId, schema.users.id))
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(eq(schema.clubMembers.clubId, clubId));

    return rows.map((row) => ({
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      cosmetics: normalizeProfileCosmetics(row.cosmetics),
      role: row.role,
      joinedAt: row.joinedAt.toISOString(),
    }));
  }

  async updateMemberRole(
    user: AuthUser,
    clubId: string,
    targetUserId: string,
    role: "moderator" | "member",
  ) {
    const club = await this.getClub(clubId);
    if (!(await this.canAdmin(user, club))) throw new ForbiddenError();

    const target = await this.getMembership(clubId, targetUserId);
    if (!target) throw new NotFoundError("Member not found");
    if (target.role === "owner") {
      throw new ForbiddenError("Cannot change owner role");
    }

    await this.db
      .update(schema.clubMembers)
      .set({ role })
      .where(
        and(
          eq(schema.clubMembers.clubId, clubId),
          eq(schema.clubMembers.userId, targetUserId),
        ),
      );
  }

  async removeMember(user: AuthUser, clubId: string, targetUserId: string) {
    const club = await this.getClub(clubId);
    if (!(await this.canModerate(user, club))) throw new ForbiddenError();

    const target = await this.getMembership(clubId, targetUserId);
    if (!target) throw new NotFoundError("Member not found");
    if (target.role === "owner") {
      throw new ForbiddenError("Cannot remove club owner");
    }

    await this.db
      .delete(schema.clubMembers)
      .where(
        and(
          eq(schema.clubMembers.clubId, clubId),
          eq(schema.clubMembers.userId, targetUserId),
        ),
      );
  }

  async createInvite(
    user: AuthUser,
    clubId: string,
    input: { userId?: string; username?: string },
  ) {
    const club = await this.getClub(clubId);
    if (!(await this.canModerate(user, club))) throw new ForbiddenError();

    let inviteeUserId = input.userId;
    if (!inviteeUserId && input.username) {
      const invitee = await this.db.query.users.findFirst({
        where: eq(schema.users.username, input.username),
      });
      if (!invitee) throw new NotFoundError("User not found");
      inviteeUserId = invitee.id;
    }
    if (!inviteeUserId) {
      throw new ValidationError("userId or username is required");
    }

    const existingMember = await this.getMembership(clubId, inviteeUserId);
    if (existingMember) {
      throw new ValidationError("User is already a member");
    }

    const pending = await this.db.query.clubInvites.findFirst({
      where: and(
        eq(schema.clubInvites.clubId, clubId),
        eq(schema.clubInvites.inviteeUserId, inviteeUserId),
        eq(schema.clubInvites.status, "pending"),
      ),
    });
    if (pending) {
      return pending.id;
    }

    const id = generateId();
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await this.db.insert(schema.clubInvites).values({
      id,
      clubId,
      inviterUserId: user.id,
      inviteeUserId,
      token,
      status: "pending",
      expiresAt,
    });
    return id;
  }

  async listInvites(
    user: AuthUser,
    clubId: string,
  ): Promise<ClubInvitePublic[]> {
    const club = await this.getClub(clubId);
    if (!(await this.canModerate(user, club))) throw new ForbiddenError();

    const rows = await this.db
      .select({
        invite: schema.clubInvites,
        username: schema.users.username,
        displayName: schema.users.displayName,
        inviteeCosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.clubInvites)
      .innerJoin(
        schema.users,
        eq(schema.clubInvites.inviteeUserId, schema.users.id),
      )
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.clubInvites.clubId, clubId),
          eq(schema.clubInvites.status, "pending"),
        ),
      );

    return rows.map((row) => ({
      id: row.invite.id,
      clubId: row.invite.clubId,
      inviteeUserId: row.invite.inviteeUserId,
      inviteeUsername: row.username,
      inviteeDisplayName: row.displayName,
      inviteeCosmetics: normalizeProfileCosmetics(row.inviteeCosmetics),
      status: row.invite.status,
      expiresAt: row.invite.expiresAt.toISOString(),
      createdAt: row.invite.createdAt.toISOString(),
    }));
  }

  async revokeInvite(user: AuthUser, clubId: string, inviteId: string) {
    const club = await this.getClub(clubId);
    if (!(await this.canModerate(user, club))) throw new ForbiddenError();

    const invite = await this.db.query.clubInvites.findFirst({
      where: and(
        eq(schema.clubInvites.id, inviteId),
        eq(schema.clubInvites.clubId, clubId),
      ),
    });
    if (!invite) throw new NotFoundError("Invite not found");

    await this.db
      .update(schema.clubInvites)
      .set({ status: "revoked" })
      .where(eq(schema.clubInvites.id, inviteId));
  }

  async acceptInvite(user: AuthUser, token: string) {
    const invite = await this.db.query.clubInvites.findFirst({
      where: eq(schema.clubInvites.token, token),
    });
    if (!invite) throw new NotFoundError("Invite not found");
    if (invite.inviteeUserId !== user.id) throw new ForbiddenError();
    if (invite.status !== "pending") {
      throw new ValidationError("Invite is no longer valid");
    }
    if (invite.expiresAt < new Date()) {
      await this.db
        .update(schema.clubInvites)
        .set({ status: "expired" })
        .where(eq(schema.clubInvites.id, invite.id));
      throw new ValidationError("Invite has expired");
    }

    const existing = await this.getMembership(invite.clubId, user.id);
    if (!existing) {
      await this.db.insert(schema.clubMembers).values({
        clubId: invite.clubId,
        userId: user.id,
        role: "member",
      });
    }

    await this.db
      .update(schema.clubInvites)
      .set({ status: "accepted" })
      .where(eq(schema.clubInvites.id, invite.id));

    return invite.clubId;
  }

  async getDetailForUser(user: AuthUser, clubId: string): Promise<ClubDetail> {
    const club = await this.requireView(user, clubId);
    const members = await this.listMembers(clubId);
    const membership = await this.getMembership(clubId, user.id);
    const isMember = !!membership;
    const canJoin =
      !isMember &&
      club.visibility === "public" &&
      user.permissions.has(PERMISSIONS.CLUBS_WRITE);

    if (isMember) {
      await this.db
        .update(schema.clubMembers)
        .set({ lastVisitedAt: new Date() })
        .where(
          and(
            eq(schema.clubMembers.clubId, clubId),
            eq(schema.clubMembers.userId, user.id),
          ),
        );
    }

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.clubMembers)
      .where(eq(schema.clubMembers.clubId, clubId));

    return {
      club: this.toPublic(club, countRow?.count ?? members.length, isMember),
      members,
      currentWork: this.clubWorks
        ? await this.clubWorks.getCurrentWorkSummary(clubId)
        : null,
      canEdit: await this.canModerate(user, club),
      canModerate: await this.canModerate(user, club),
      canAdmin: await this.canAdmin(user, club),
      isMember,
      canJoin,
      ...((await this.canModerate(user, club))
        ? {
            selectionDefaults: clubSelectionDefaultsSchema.parse(
              club.selectionDefaults,
            ),
            readDefaults: clubReadDefaultsSchema.parse(club.readDefaults),
          }
        : {}),
    };
  }

  toPublic(
    club: typeof schema.clubs.$inferSelect,
    memberCount: number,
    isMember = false,
  ): ClubPublic {
    return {
      id: club.id,
      name: club.name,
      description: club.description,
      coverFileId: club.coverFileId,
      visibility: club.visibility,
      context: club.context,
      ownerUserId: club.ownerUserId,
      memberCount,
      isMember,
      createdAt: club.createdAt.toISOString(),
      updatedAt: club.updatedAt.toISOString(),
    };
  }

  private async memberCounts(clubIds: string[]) {
    const map = new Map<string, number>();
    if (clubIds.length === 0) return map;

    const rows = await this.db
      .select({
        clubId: schema.clubMembers.clubId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.clubMembers)
      .where(inArray(schema.clubMembers.clubId, clubIds))
      .groupBy(schema.clubMembers.clubId);

    for (const row of rows) {
      map.set(row.clubId, row.count);
    }
    return map;
  }
}
