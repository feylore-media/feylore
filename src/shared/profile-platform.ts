import { z } from "zod";
import {
  cosmeticsUpdateSchema,
  type ProfileCosmetics,
} from "./profile-cosmetics.js";
export * from "./profile-cosmetics.js";

/**
 * Profile platform (first implementation pass).
 *
 * Dedicated profile domain alongside the canonical `users` record.
 * `users` remains canonical for username, displayName, bio, avatar, and
 * profileVisibility. `user_profiles` holds presentation-specific identity
 * (pronouns, banner, appearance, custom CSS, guestbook preference).
 *
 * Decisions recorded here to avoid silent architecture drift:
 * - Route: `/users/:username` is canonical going forward; `/u/:username`
 *   remains as a compatibility alias.
 * - `/settings/privacy` is authoritative for profileVisibility
 *   (`public` / `members` == "club only" / `private`). The account page
 *   control is a convenience mirror.
 * - Follows are a minimal idempotent graph (no feed/recommendations/
 *   notifications) to establish relationships for later features.
 */

export const PROFILE_PRONOUNS_MAX = 64;
export const PROFILE_CUSTOM_CSS_MAX = 8000;
export const PROFILE_LINK_LABEL_MAX = 60;
export const PROFILE_LINK_URL_MAX = 2048;
export const PROFILE_OBSESSION_MAX = 3;
export const PROFILE_OBSESSION_NOTE_MAX = 140;
export const PROFILE_GUESTBOOK_BODY_MAX = 1000;
export const PROFILE_ARTIFACT_CONFIG_MAX_BYTES = 8000;

export const profileArtifactSizes = ["small", "medium", "wide"] as const;
export type ProfileArtifactSize = (typeof profileArtifactSizes)[number];

export const profileArtifactTypes = [
  "obsessions",
  "favorites",
  "favorite-quote",
  "currently-reading",
  "recent-five-star",
  "favorite-person",
  "shelf",
  "shelf-preview",
  "club",
  "recent-activity",
  "stats",
] as const;
export type ProfileArtifactType = (typeof profileArtifactTypes)[number];

export function normalizeProfileArtifactType(
  value: string,
): ProfileArtifactType {
  if (value === "shelf-preview") return "shelf";
  if (value === "shelf") return "shelf";
  if (
    profileArtifactTypes.includes(
      value as (typeof profileArtifactTypes)[number],
    )
  ) {
    return value as ProfileArtifactType;
  }
  return "stats";
}

export function formatProfileDisplayIdentity(
  displayName: string | null | undefined,
  username: string,
  pronouns?: string | null,
): {
  primary: string;
  secondary?: string;
  username?: string;
} {
  const name = (displayName ?? "").trim();
  const bareUsername = username.trim().replace(/^@+/, "");
  const handle = `@${bareUsername}`;
  const sameIdentity = name.toLowerCase() === bareUsername.toLowerCase();

  if (sameIdentity) {
    return {
      primary: handle,
      secondary: pronouns?.trim() || undefined,
    };
  }

  return {
    primary: name || handle,
    username: handle,
    secondary: pronouns?.trim() || undefined,
  };
}

export const obsessionTargetTypes = [
  "work",
  "person",
  "series",
  "shelf",
  "club",
] as const;
export type ObsessionTargetType = (typeof obsessionTargetTypes)[number];

export const pronounsSchema = z
  .string()
  .max(PROFILE_PRONOUNS_MAX)
  .nullable()
  .optional();

export const profileUrlSchema = z
  .string()
  .min(1)
  .max(PROFILE_LINK_URL_MAX)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "Link must be an http(s) URL");

export const profileLinkInputSchema = z.object({
  label: z.string().min(1).max(PROFILE_LINK_LABEL_MAX),
  url: profileUrlSchema,
});

export const profileLinkReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(50),
});

export const obsessionInputSchema = z.object({
  targetType: z.enum(obsessionTargetTypes),
  targetId: z.string().min(1).max(128),
  note: z.string().max(PROFILE_OBSESSION_NOTE_MAX).nullable().optional(),
});

export const obsessionReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(PROFILE_OBSESSION_MAX),
});

export const profileArtifactConfigSchema = z
  .record(z.unknown())
  .refine((value) => {
    try {
      return JSON.stringify(value).length <= PROFILE_ARTIFACT_CONFIG_MAX_BYTES;
    } catch {
      return false;
    }
  }, "Artifact config is too large");

export const profileArtifactInputSchema = z.object({
  artifactType: z.enum(profileArtifactTypes),
  config: profileArtifactConfigSchema.default({}),
  size: z.enum(profileArtifactSizes).default("medium"),
  isVisible: z.boolean().default(true),
});

export const profileArtifactPatchSchema = z.object({
  config: profileArtifactConfigSchema.optional(),
  size: z.enum(profileArtifactSizes).optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const profileArtifactReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(50),
});

export const guestbookEntryInputSchema = z.object({
  body: z.string().min(1).max(PROFILE_GUESTBOOK_BODY_MAX),
});

export const extendedProfileUpdateSchema = z.object({
  pronouns: pronounsSchema,
  bannerFileId: z.string().uuid().nullable().optional(),
  accent: z.string().max(32).nullable().optional(),
  cardStyle: z.enum(["flat", "outlined", "soft"]).nullable().optional(),
  heroTreatment: z.enum(["banner", "minimal", "compact"]).nullable().optional(),
  surfaceTreatment: z
    .enum(["default", "paper", "contrast"])
    .nullable()
    .optional(),
  customCss: z.string().max(PROFILE_CUSTOM_CSS_MAX).nullable().optional(),
  guestbookEnabled: z.boolean().optional(),
  cosmetics: cosmeticsUpdateSchema.optional(),
});

export type ExtendedProfileUpdate = z.infer<typeof extendedProfileUpdateSchema>;

/** Documented profile CSS customization API. Only these selectors are stable. */
export const PROFILE_CSS_SELECTORS = [
  ".profile",
  ".profile-hero",
  ".profile-identity",
  ".profile-links",
  ".profile-artifacts",
  ".profile-artifact",
  ".profile-artifact--obsessions",
  ".profile-artifact--quote",
  ".profile-artifact--favorites",
] as const;

/** Known link providers recognized at presentation time only. */
export const PROFILE_LINK_PROVIDERS = [
  { key: "hardcover", label: "Hardcover", hosts: ["hardcover.app"] },
  { key: "goodreads", label: "Goodreads", hosts: ["goodreads.com"] },
  {
    key: "storygraph",
    label: "StoryGraph",
    hosts: ["thestorygraph.com", "storygraph.com"],
  },
  { key: "letterboxd", label: "Letterboxd", hosts: ["letterboxd.com"] },
  { key: "bluesky", label: "Bluesky", hosts: ["bsky.app"] },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  {
    key: "spotify",
    label: "Spotify",
    hosts: ["spotify.com", "open.spotify.com"],
  },
] as const;

export type ProfileLinkProviderKey =
  (typeof PROFILE_LINK_PROVIDERS)[number]["key"] | "generic";

export function recognizeProfileLinkProvider(url: string): {
  key: ProfileLinkProviderKey;
  label: string;
} {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    for (const provider of PROFILE_LINK_PROVIDERS) {
      if (provider.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
        return { key: provider.key, label: provider.label };
      }
    }
  } catch {
    // fall through to generic
  }
  return { key: "generic", label: "Website" };
}

export interface ProfileLinkView {
  id: string;
  label: string;
  url: string;
  sortOrder: number;
  provider: ProfileLinkProviderKey;
  providerLabel: string;
}

export interface ProfileObsessionView {
  id: string;
  targetType: ObsessionTargetType;
  targetId: string;
  note: string | null;
  sortOrder: number;
  title: string;
  href: string | null;
  subtitle: string | null;
  restricted: boolean;
  /** Opaque file id for cover/portrait art; null when unavailable. */
  coverFileId: string | null;
  /** Which visual grammar to use: cover art, person portrait, or none. */
  imageKind: "cover" | "portrait" | "none";
}

/**
 * Media item shape used inside artifact `data` payloads (favorites,
 * five-star, shelf-preview, currently-reading). `coverFileId` is an opaque
 * file id served via the authorization-aware file endpoint; null renders
 * a typographic placeholder instead of artwork.
 */
export interface ProfileMediaItemView {
  subjectType: string;
  subjectId: string;
  title: string;
  href: string | null;
  coverFileId: string | null;
  subtitle?: string | null;
}

export interface ProfileReadingItemView {
  workType: string;
  workId: string;
  title: string;
  href: string | null;
  coverFileId: string | null;
  /** 0-100 reading progress, when the locator exposes progression. */
  progressPercent: number | null;
}

export interface ProfilePersonView {
  id: string | null;
  name: string;
  href: string | null;
  photoFileId: string | null;
  role: string | null;
}

export interface ProfileArtifactView {
  id: string;
  artifactType: ProfileArtifactType;
  config: Record<string, unknown>;
  sortOrder: number;
  size: ProfileArtifactSize;
  isVisible: boolean;
  data: Record<string, unknown> | null;
}

export interface ProfileFollowCounts {
  followers: number;
  following: number;
}

/**
 * Lightweight identity card for hover/focus previews.
 *
 * Deliberately small: identity only (who `@username` is), never contextual
 * activity (what they read, rated, or reviewed belongs to the activity
 * event or media detail treatment). `bio` is truncated server-side.
 * `userId` is included so clients can key caches without parsing URLs.
 */
export interface ProfileCardView {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  pronouns: string | null;
  bio: string | null;
  followerCount: number;
  viewerIsFollowing: boolean;
  /** Normalized display-name cosmetics for the card's identity. */
  cosmetics?: ProfileCosmetics | null;
}

export interface ViewerProfileView {
  username: string;
  displayName: string;
  pronouns: string | null;
  bio: string | null;
  avatarUrl?: string;
  bannerUrl?: string;
  profileVisibility: "public" | "members" | "private";
  isOwner: boolean;
  isFollowing: boolean;
  counts: ProfileFollowCounts;
  links: ProfileLinkView[];
  obsessions: ProfileObsessionView[];
  artifacts: ProfileArtifactView[];
  appearance: {
    accent: string | null;
    cardStyle: string | null;
    heroTreatment: string | null;
    surfaceTreatment: string | null;
    customCss: string | null;
    cosmetics: ProfileCosmetics;
  };
  guestbookEnabled: boolean;
  /** ISO timestamp of account creation; used for sparse-profile empty states. */
  memberSince: string | null;
  goals: ProfileGoalView[];
  /** Recent earned achievements; empty when the module is disabled. */
  recentAchievements: ProfileAchievementView[];
}

export interface ProfileGoalView {
  id: string;
  title: string;
  description: string | null;
  visibility: "private" | "public";
  target: number;
  current: number;
  percentage: number;
  completed: boolean;
  startsAt: string | null;
  endsAt: string | null;
  presentation: string;
}

/** Recent earned achievements (source-visibility filtered for the viewer). */
export interface ProfileAchievementView {
  /** Grant id. */
  id: string;
  definitionId: string;
  definitionKey: string;
  name: string;
  description: string | null;
  icon: string | null;
  sourceType: string;
  sourceLabel: string | null;
  earnedAt: string;
}
