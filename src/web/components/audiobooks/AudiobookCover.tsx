import { useState } from "react";
import styles from "./audiobooks.module.css";

export interface AudiobookCoverProps {
  coverFileId: string | null;
  title: string;
  size?: "default" | "small";
  loading?: boolean;
  className?: string;
}

function coverInitial(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function AudiobookCover({
  coverFileId,
  title,
  size = "default",
  loading = false,
  className,
}: AudiobookCoverProps) {
  const [imgError, setImgError] = useState(false);
  const wrapClass = [
    styles.coverWrap,
    size === "small" ? styles.coverWrapSmall : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (loading) {
    return (
      <div className={wrapClass} aria-hidden>
        <div className={styles.coverSkeleton} />
      </div>
    );
  }

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
