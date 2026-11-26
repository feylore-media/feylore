import { z } from "zod";

export const PROFILE_VISIBILITY = {
  PUBLIC: "public",
  MEMBERS: "members",
  PRIVATE: "private",
} as const;

export type ProfileVisibility =
  (typeof PROFILE_VISIBILITY)[keyof typeof PROFILE_VISIBILITY];

export const profileVisibilitySchema = z.enum([
  PROFILE_VISIBILITY.PUBLIC,
  PROFILE_VISIBILITY.MEMBERS,
  PROFILE_VISIBILITY.PRIVATE,
]);

export const PROFILE_BIO_MAX = 500;

export const profileBioSchema = z
  .string()
  .max(PROFILE_BIO_MAX)
  .nullable()
  .optional();

/** Namespaced extension payload for future module profile sections. */
export type UserProfileJson = Record<string, unknown>;

export interface PublicUserProfile {
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string | null;
  profileVisibility: ProfileVisibility;
  isOwner?: boolean;
}
