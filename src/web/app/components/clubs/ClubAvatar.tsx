import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./clubs.module.css";

export interface ClubAvatarProps {
  name: string;
  coverFileId: string | null;
  showUnread?: boolean;
}

function clubInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function ClubAvatar({ name, coverFileId, showUnread = false }: ClubAvatarProps) {
  const { t } = useTranslation("clubs");
  const [imgError, setImgError] = useState(false);
  const showImage = coverFileId && !imgError;

  return (
    <span className={styles.avatarWrap}>
      {showImage ? (
        <img
          src={`/api/v1/files/${coverFileId}/content`}
          alt=""
          className={styles.avatar}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className={styles.avatarPlaceholder} aria-hidden>
          {clubInitial(name)}
        </span>
      )}
      {showUnread && (
        <span
          className={styles.unreadDot}
          aria-label={t("newActivity")}
        />
      )}
    </span>
  );
}
