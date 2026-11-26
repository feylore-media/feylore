import { normalizeUsername } from "./username.js";
import type { ProfileCosmetics } from "./profile-cosmetics.js";

/**
 * Global User Identity — canonical presentation rules.
 *
 * - Database/API identity is the bare username (`sally`). The `@` prefix is
 *   presentation syntax only and must never be persisted, validated as part
 *   of the username, or embedded in URLs, mentions storage, or imports.
 * - Usernames are always rendered as `@username` when an account identity
 *   is shown. A display name may accompany the handle but never substitutes
 *   for it where an actual account identity matters.
 * - A known user identity always links to `/users/:username`.
 *   `/u/:username` remains a compatibility-only alias (router redirect
 *   target, never rendered by Feylore UI).
 */

/** Minimal account-identity shape shared by identity primitives. */
export interface UserIdentityLike {
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  /** Normalized name cosmetics delivered with the identity payload. */
  cosmetics?: ProfileCosmetics | null;
}

/**
 * True when the display name is a distinct identity from the username.
 * Presentation cosmetics only ever apply to distinct display names — a name
 * that is merely the handle restyled never gets decorated.
 */
export function isDistinctIdentityName(
  displayName: string | null | undefined,
  username: string,
): boolean {
  const display = (displayName ?? "").trim();
  if (!display) return false;
  return normalizeUsername(display) !== normalizeUsername(username);
}

/**
 * Strip presentation-only `@` prefixes. Internal helper: public callers
 * should prefer `normalizeUsername` (which applies this) or
 * `formatUserHandle` (which adds presentation syntax back).
 */
export function stripHandlePrefix(value: string): string {
  return value.trim().replace(/^@+/, "").trim();
}

/**
 * Parse a user-supplied handle or username into stored identity syntax.
 * `@Sally` -> `sally`. Never returns a value with a leading `@`.
 */
export function parseUsernameInput(value: string): string {
  return normalizeUsername(stripHandlePrefix(value));
}

/**
 * Format stored identity syntax as presentation syntax. `sally` -> `@sally`.
 * Input already carrying `@` is normalized rather than doubled (`@sally`
 * stays `@sally`, never `@@sally`).
 */
export function formatUserHandle(username: string): string {
  const bare = stripHandlePrefix(username).toLowerCase();
  return `@${bare}`;
}

/** Canonical profile link for a known user. Never emits `/u/:username`. */
export function userProfilePath(username: string): string {
  const bare = stripHandlePrefix(username).toLowerCase();
  return `/users/${encodeURIComponent(bare)}`;
}

/** Compatibility-only alias. Do not render; used for redirects/legacy. */
export function legacyUserProfilePath(username: string): string {
  const bare = stripHandlePrefix(username).toLowerCase();
  return `/u/${encodeURIComponent(bare)}`;
}

/** True when the identity is usable as a navigable account link. */
export function isNavigableUserIdentity(
  user: Pick<UserIdentityLike, "username"> | null | undefined,
): user is UserIdentityLike & { username: string } {
  if (!user) return false;
  return stripHandlePrefix(user.username).length > 0;
}

/** Display-name fallback for identity rendering (never a substitute link). */
export function identityDisplayName(user: UserIdentityLike): string {
  const display = (user.displayName ?? "").trim();
  if (display.length > 0) return display;
  return formatUserHandle(user.username);
}

/** Truncate hover-card bios. Card shows identity, not full profile text. */
export const PROFILE_CARD_BIO_MAX = 140;

export function truncateProfileCardBio(
  bio: string | null | undefined,
  max = PROFILE_CARD_BIO_MAX,
): string | null {
  if (!bio) return null;
  const trimmed = bio.trim();
  if (!trimmed) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}.`;
}
