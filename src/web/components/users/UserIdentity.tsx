import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProfileCardView } from "@shared/profile-platform";
import {
  formatUserHandle,
  isNavigableUserIdentity,
  userProfilePath,
  type UserIdentityLike,
} from "@shared/user-identity";
import { api } from "../../app/api";
import { ProfileName } from "../profile/ProfileName";
import { UserAvatar } from "./UserAvatar";
import { UserHandle, UserLink } from "./UserHandle";
import styles from "./users.module.css";

export type UserIdentityVariant = "handle" | "compact" | "full";

export interface UserIdentityProps {
  user: UserIdentityLike | null | undefined;
  variant?: UserIdentityVariant;
  /** Avatar size override. Defaults: full -> md, others -> sm. */
  avatarSize?: "sm" | "md" | "lg";
  /** Enable hover/focus profile preview. Defaults to true for links. */
  withHoverCard?: boolean;
  /** Disable display-name cosmetics. Escape hatch for plain surfaces. */
  plain?: boolean;
  className?: string;
}

/**
 * Canonical account attribution.
 *
 * - `handle`  -> `@sally`
 * - `compact` -> `Sally @sally`
 * - `full`    -> avatar + `Sally` + `@sally`
 *
 * Every variant links to the canonical `/users/:username` profile. Display
 * name may accompany the handle but never substitutes for it. Missing or
 * empty identities render a non-navigable "Deleted user" placeholder.
 */
export function UserIdentity({
  user,
  variant = "compact",
  avatarSize,
  withHoverCard = true,
  plain = false,
  className,
}: UserIdentityProps) {
  const { t } = useTranslation("profile");

  if (!isNavigableUserIdentity(user)) {
    return (
      <span className={[styles.identity, className].filter(Boolean).join(" ")}>
        <span className={styles.deleted}>
          {t("deletedUser", { defaultValue: "Deleted user" })}
        </span>
      </span>
    );
  }

  const username = user.username;
  const displayName = (user.displayName ?? "").trim();
  const showDisplayName = variant !== "handle" && displayName.length > 0;
  const showAvatar = variant === "full";
  const size = avatarSize ?? (variant === "full" ? "md" : "sm");
  const label = showDisplayName
    ? `${displayName} ${formatUserHandle(username)}`
    : formatUserHandle(username);

  const identity = (
    <UserLink
      username={username}
      className={[styles.link, styles.identity, className]
        .filter(Boolean)
        .join(" ")}
      ariaLabel={label}
    >
      {showAvatar && (
        <UserAvatar
          displayName={displayName || username}
          username={username}
          avatarUrl={user.avatarUrl}
          size={size}
        />
      )}
      <span className={styles.identityText}>
        {showDisplayName && (
          <ProfileName
            user={{ username, displayName, cosmetics: user.cosmetics ?? null }}
            size="sm"
            plain={plain}
            className={styles.displayName}
          />
        )}
        <UserHandle username={username} />
      </span>
    </UserLink>
  );

  if (!withHoverCard) return identity;

  return (
    <UserHoverCardAnchor username={username}>{identity}</UserHoverCardAnchor>
  );
}

/**
 * Progressive-enhancement hover/focus card. Describes the user (`@sally`),
 * never contextual activity (read dates, ratings, reviews belong to the
 * activity event or media treatment). Clicking the wrapped identity always
 * navigates normally; touch never depends on hover.
 */
export function UserHoverCardAnchor({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<ProfileCardView | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const openTimer = useRef<number | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      if (openTimer.current) window.clearTimeout(openTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function scheduleOpen() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    // Small delay avoids card flashing during pointer transit.
    openTimer.current = window.setTimeout(() => setOpen(true), 250);
  }

  function scheduleClose() {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  }

  useEffect(() => {
    if (!open) return;
    if (loadedFor.current === username && (card || error)) return;
    let live = true;
    setLoading(true);
    setError(false);
    void api<{ data: ProfileCardView }>(
      `/profiles/${encodeURIComponent(username)}/card`,
    )
      .then((res) => {
        if (!live) return;
        loadedFor.current = username;
        setCard(res.data);
      })
      .catch(() => {
        if (!live) return;
        loadedFor.current = username;
        setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, username]);

  return (
    <span
      className={styles.hoverAnchor}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={scheduleClose}
    >
      {children}
      {open && (
        <span
          className={styles.hoverCard}
          role="dialog"
          aria-label={formatUserHandle(username)}
          onMouseEnter={() => {
            if (closeTimer.current) {
              window.clearTimeout(closeTimer.current);
              closeTimer.current = null;
            }
          }}
          onMouseLeave={scheduleClose}
        >
          <UserHoverCardBody
            username={username}
            card={card}
            loading={loading}
            error={error}
          />
        </span>
      )}
    </span>
  );
}

export function UserHoverCardBody({
  username,
  card,
  loading,
  error,
}: {
  username: string;
  card: ProfileCardView | null;
  loading: boolean;
  error: boolean;
}) {
  const { t } = useTranslation("profile");
  if (loading && !card) {
    return (
      <p className={styles.hoverCardLoading}>
        {t("loading", { defaultValue: "Loading…" })}
      </p>
    );
  }
  if (error || !card) {
    // Privacy-preserving: an unloadable card degrades to the plain handle
    // link rather than leaking why (private vs missing).
    return (
      <span className={styles.hoverCardHeader}>
        <span>
          <span className={styles.hoverCardName}>
            {formatUserHandle(username)}
          </span>
          <span className={styles.hoverCardMeta}>
            {" "}
            {t("cardUnavailable", { defaultValue: "View profile" })}
          </span>
        </span>
      </span>
    );
  }
  return (
    <span>
      <span className={styles.hoverCardHeader}>
        <UserAvatar
          displayName={card.displayName}
          username={card.username}
          avatarUrl={card.avatarUrl}
          size="md"
        />
        <span>
          <span className={styles.hoverCardName}>
            <ProfileName
              user={{
                username: card.username,
                displayName: card.displayName,
                cosmetics: card.cosmetics ?? null,
              }}
              size="sm"
            />
          </span>
          <br />
          <UserHandle
            username={card.username}
            className={styles.hoverCardHandle}
          />
          {card.pronouns && (
            <span className={styles.hoverCardPronouns}> · {card.pronouns}</span>
          )}
        </span>
      </span>
      {card.bio && <span className={styles.hoverCardBio}>{card.bio}</span>}
      <span className={styles.hoverCardMeta}>
        {t("followerCount", {
          defaultValue: "{{count}} followers",
          count: card.followerCount,
        })}
        {card.viewerIsFollowing &&
          ` · ${t("followingBadge", { defaultValue: "Following" })}`}
        {" · "}
        <a
          href={userProfilePath(card.username)}
          onClick={(e) => e.stopPropagation()}
        >
          {t("viewProfile", { defaultValue: "View profile" })}
        </a>
      </span>
    </span>
  );
}
