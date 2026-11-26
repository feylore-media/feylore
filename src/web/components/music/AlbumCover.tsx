import { useState } from "react";
import styles from "./music.module.css";

export interface AlbumCoverProps {
  coverFileId: string | null;
  title: string;
  size?: "default" | "small";
  className?: string;
}

function coverInitial(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function AlbumCover({
  coverFileId,
  title,
  size = "default",
  className,
}: AlbumCoverProps) {
  const [imgError, setImgError] = useState(false);
  const wrapClass = [
    styles.coverWrap,
    size === "small" ? styles.coverWrapSmall : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (coverFileId && !imgError) {
    return (
      <div className={wrapClass}>
        <img
          src={`/api/v1/files/${coverFileId}/content`}
          alt={title}
          className={styles.coverImg}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div className={wrapClass} aria-hidden>
      <div className={styles.coverPlaceholder}>{coverInitial(title)}</div>
    </div>
  );
}
