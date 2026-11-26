import { useState } from "react";
import { BookCover } from "../BookCover";
import styles from "./metadata-edit.module.css";

interface MetadataCoverThumbnailProps {
  coverFileId?: string | null;
  coverUrl?: string | null;
  title: string;
}

export function MetadataCoverThumbnail({
  coverFileId,
  coverUrl,
  title,
}: MetadataCoverThumbnailProps) {
  const [imgError, setImgError] = useState(false);

  const safeCoverUrl = (() => {
    if (!coverUrl) return null;
    try {
      const parsed = new URL(coverUrl);
      return parsed.protocol === "https:" || parsed.protocol === "http:"
        ? parsed.href
        : null;
    } catch {
      return null;
    }
  })();

  if (coverFileId) {
    return <BookCover coverFileId={coverFileId} title={title} size="small" />;
  }

  if (safeCoverUrl && !imgError) {
    return (
      <div className={styles.coverThumbWrap}>
        <img
          src={safeCoverUrl}
          alt={title}
          className={styles.coverThumbImg}
          loading="lazy"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div className={styles.coverThumbWrap} aria-hidden>
      <div className={styles.coverThumbPlaceholder}>—</div>
    </div>
  );
}
