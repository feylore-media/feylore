import { useState } from "react";
import styles from "./calendar.module.css";

function coverInitial(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function CalendarCover({
  artworkFileId,
  title,
  size = "list",
  className,
}: {
  artworkFileId: string | null;
  title: string;
  size?: "list" | "cell" | "popover";
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const wrapClass = [
    styles.cover,
    size === "cell" ? styles.coverCell : "",
    size === "popover" ? styles.coverPopover : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (artworkFileId && !imgError) {
    return (
      <div className={wrapClass}>
        <img
          src={`/api/v1/files/${artworkFileId}/content`}
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
      <span className={styles.coverPlaceholder}>{coverInitial(title)}</span>
    </div>
  );
}