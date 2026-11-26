import type { CSSProperties } from "react";
import {
  PROFILE_USERNAME_ACCENT_STYLES,
  PROFILE_USERNAME_PALETTE,
  type ProfileCosmetics,
} from "@shared/profile-platform";
import styles from "./profile-name.module.css";

/** Palette tokens resolve to theme variables; hex values pass through. */
function resolveColor(value: string | null): string | null {
  if (!value) return null;
  const option = PROFILE_USERNAME_PALETTE.find(
    (entry) => entry.key === value,
  );
  if (option) return option.token ? `var(${option.token})` : null;
  return value.startsWith("#") ? value : null;
}

export interface ProfileNameUser {
  username: string;
  displayName?: string | null;
  cosmetics?: ProfileCosmetics | null;
}

export type ProfileNameSize = "sm" | "md" | "lg";

export interface ProfileNameProps {
  user: ProfileNameUser;
  size?: ProfileNameSize;
  /** Render the name without cosmetics (unstyled but still canonical). */
  plain?: boolean;
  className?: string;
}

/**
 * Canonical display-name renderer.
 *
 * Renders the user's display name through one code path everywhere a Feylore
 * account identity is presented as social content (profile headers, club
 * attribution, guestbook, follows, picks). Applies cosmetics unless:
 *
 * - `plain` is true (escape hatch for admin/audit-ish surfaces), or
 * - no cosmetics payload is present.
 *
 * The `@handle` and pronouns are never styled here. When no cosmetics apply,
 * the base name class still renders so typography stays consistent and the
 * text is never invisible.
 */
export function ProfileName({
  user,
  size = "md",
  plain = false,
  className,
}: ProfileNameProps) {
  const displayName = (user.displayName ?? "").trim();
  if (!displayName) return null;

  const cosmetics = !plain ? (user.cosmetics ?? null) : null;
  const styleClass = cosmetics
    ? styles[`style--${cosmetics.usernameStyle}`]
    : null;
  const color = cosmetics ? resolveColor(cosmetics.usernameColor) : null;
  const accent =
    cosmetics && PROFILE_USERNAME_ACCENT_STYLES.has(cosmetics.usernameStyle)
      ? resolveColor(cosmetics.usernameAccentColor)
      : null;
  const style =
    color || accent
      ? ({
          ...(color ? { "--profile-name-color": color } : {}),
          ...(accent ? { "--profile-name-accent": accent } : {}),
        } as CSSProperties)
      : undefined;
  const sizeClass = styles[`size--${size}`];

  return (
    <span
      className={[styles.name, sizeClass, styleClass, className]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {displayName}
    </span>
  );
}