import { and, eq, inArray, sql } from "drizzle-orm";
import path from "node:path";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import {
  PROFILE_VISIBILITY,
  type ProfileVisibility,
  type PublicUserProfile,
} from "../../../shared/profile.js";
import {
  normalizeUsername,
  usernameSchema,
  validateUsername,
} from "../../../shared/username.js";
import {
  normalizeProfileCosmetics,
  type ProfileCosmetics,
} from "../../../shared/profile-cosmetics.js";
import type { FileService } from "../files/service.js";
import { generateId } from "../../security/crypto.js";

const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export class ProfileService {
  constructor(
    private readonly db: Database,
    private readonly files: FileService,
  ) {}

  async findByUsername(username: string) {
    const normalized = normalizeUsername(username);
    return this.db.query.users.findFirst({
      where: sql`lower(${schema.users.username}) = ${normalized}`,
    });
  }

  async usersShareClub(userIdA: string, userIdB: string): Promise<boolean> {
    const membershipsA = await this.db
      .select({ clubId: schema.clubMembers.clubId })
      .from(schema.clubMembers)
      .where(eq(schema.clubMembers.userId, userIdA));
    if (membershipsA.length === 0) return false;

    const clubIds = membershipsA.map((m) => m.clubId);
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.clubMembers)
      .where(
        and(
          eq(schema.clubMembers.userId, userIdB),
          inArray(schema.clubMembers.clubId, clubIds),
        ),
      );
    return (row?.count ?? 0) > 0;
  }

  async canViewProfileAsync(
    subject: typeof schema.users.$inferSelect,
    viewerId: string | null,
  ): Promise<boolean> {
    if (viewerId === subject.id) return true;
    if (subject.profileVisibility === PROFILE_VISIBILITY.PRIVATE) return false;
    if (!viewerId) return false;
    if (subject.profileVisibility === PROFILE_VISIBILITY.PUBLIC) return true;
    if (subject.profileVisibility === PROFILE_VISIBILITY.MEMBERS) {
      return this.usersShareClub(viewerId, subject.id);
    }
    return false;
  }

  avatarUrl(avatarFileId: string | null | undefined): string | undefined {
    if (!avatarFileId) return undefined;
    return `/api/v1/files/${avatarFileId}/content`;
  }

  selfAvatarUrl(avatarFileId: string | null | undefined): string | undefined {
    if (!avatarFileId) return undefined;
    return "/api/v1/auth/me/avatar";
  }

  toPublicProfile(
    user: typeof schema.users.$inferSelect,
    viewerId: string | null,
    isOwner: boolean,
  ): PublicUserProfile {
    return {
      username: user.username,
      displayName: user.displayName,
      avatarUrl: isOwner
        ? this.selfAvatarUrl(user.avatarFileId)
        : this.avatarUrl(user.avatarFileId),
      bio: user.bio,
      profileVisibility: user.profileVisibility as ProfileVisibility,
      isOwner,
    };
  }

  async getPublicProfile(username: string, viewerId: string | null) {
    const user = await this.findByUsername(username);
    if (!user) throw new NotFoundError("Profile not found");

    const isOwner = viewerId === user.id;
    const canView = await this.canViewProfileAsync(user, viewerId);
    if (!canView) throw new NotFoundError("Profile not found");

    return this.toPublicProfile(user, viewerId, isOwner);
  }

  async updateProfile(
    userId: string,
    input: {
      displayName?: string;
      locale?: string;
      bio?: string | null;
      profileVisibility?: ProfileVisibility;
      avatarFileId?: string | null;
      profileJson?: Record<string, unknown>;
    },
  ) {
    const updates: Partial<typeof schema.users.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.displayName !== undefined) updates.displayName = input.displayName;
    if (input.locale !== undefined) updates.locale = input.locale;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.profileVisibility !== undefined) {
      updates.profileVisibility = input.profileVisibility;
    }
    if (input.profileJson !== undefined) updates.profileJson = input.profileJson;
    if (input.avatarFileId !== undefined) {
      if (input.avatarFileId) {
        await this.files.getFile(input.avatarFileId);
      }
      updates.avatarFileId = input.avatarFileId;
    }

    if (Object.keys(updates).length <= 1) {
      throw new ValidationError("No fields to update");
    }

    await this.db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, userId));

    return this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
  }

  async changeUsername(userId: string, newUsername: string) {
    const parsed = usernameSchema.parse(newUsername);
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (!user) throw new NotFoundError("User not found");
    if (user.username === parsed) return user;

    if (user.usernameChangedAt) {
      const elapsed = Date.now() - user.usernameChangedAt.getTime();
      if (elapsed < USERNAME_CHANGE_COOLDOWN_MS) {
        throw new ValidationError(
          "Username can only be changed once every 30 days",
        );
      }
    }

    const existing = await this.findByUsername(parsed);
    if (existing && existing.id !== userId) {
      throw new ConflictError("Username is already taken");
    }

    await this.db
      .update(schema.users)
      .set({
        username: parsed,
        usernameChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));

    return this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
  }

  async uploadAvatar(userId: string, data: Buffer, mediaType: string) {
    if (!AVATAR_MEDIA_TYPES.has(mediaType)) {
      throw new ValidationError("Avatar must be a JPEG, PNG, WebP, or GIF image");
    }
    if (data.length > AVATAR_MAX_BYTES) {
      throw new ValidationError("Avatar must be 2 MB or smaller");
    }

    const storageLocationId = await this.files.getManagedStorageLocationId();
    if (!storageLocationId) {
      throw new ValidationError("Managed storage is not configured");
    }

    const ext =
      mediaType === "image/jpeg"
        ? ".jpg"
        : mediaType === "image/png"
          ? ".png"
          : mediaType === "image/webp"
            ? ".webp"
            : ".gif";
    const relativePath = path.posix.join(
      "avatars",
      userId,
      `${generateId()}${ext}`,
    );

    const fileId = await this.files.storeDerivedFile({
      storageLocationId,
      relativePath,
      data,
      mediaType,
    });

    await this.updateProfile(userId, { avatarFileId: fileId });
    return fileId;
  }

  async getSelfProfile(user: typeof schema.users.$inferSelect): Promise<
    PublicUserProfile & {
      email: string;
      locale: string;
      profileJson: Record<string, unknown>;
      cosmetics?: ProfileCosmetics | null;
    }
  > {
    const extended = await this.db.query.userProfiles.findFirst({
      where: eq(schema.userProfiles.userId, user.id),
    });
    return {
      ...this.toPublicProfile(user, user.id, true),
      email: user.email,
      locale: user.locale,
      profileJson: user.profileJson ?? {},
      cosmetics: normalizeProfileCosmetics(extended?.cosmetics),
    };
  }

  validateUsernameForCreate(username: string): string {
    const error = validateUsername(normalizeUsername(username));
    if (error) throw new ValidationError(error);
    return usernameSchema.parse(username);
  }
}
