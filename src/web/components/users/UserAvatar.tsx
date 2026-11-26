import { useEffect, useState } from "react";
import styles from "./UserAvatar.module.css";

export interface UserAvatarProps {
  displayName?: string | null;
  username?: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  showUnreadIndicator?: boolean;
  className?: string;
}

/**
 * Canonical user avatar. Initial derives from display name, falling back to
 * the bare username (never `@`). Decorative image; identity text lives with
 * `UserHandle` / `UserIdentity`.
 */
export function UserAvatar({
  displayName,
  username,
  avatarUrl,
  size = "sm",
  showUnreadIndicator = false,
  className,
}: UserAvatarProps) {
  const seed = (displayName ?? "").trim() || (username ?? "").trim();
  const initial = seed.slice(0, 1).toUpperCase() || "?";
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const sizeClass =
    size === "lg"
      ? styles.avatarLg
      : size === "md"
        ? styles.avatarMd
        : styles.avatarSm;
  const classes = [styles.avatar, sizeClass, className]
    .filter(Boolean)
    .join(" ");
  const showImage = avatarUrl && !imageFailed;

  return (
    <span className={styles.wrap}>
      {showImage ? (
        <img
          src={avatarUrl}
          alt=""
          className={classes}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className={`${classes} ${styles.placeholder}`} aria-hidden>
          {initial}
        </span>
      )}
      {showUnreadIndicator && <span className={styles.unreadDot} aria-hidden />}
    </span>
  );
}
