import { useState } from "react";
import styles from "./profile.module.css";

function fileContentUrl(fileId: string): string {
  return `/api/v1/files/${fileId}/content`;
}

function initialFor(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

/**
 * Shared profile artwork primitives.
 *
 * Covers (books, movies, albums, shows) render 2:3; person portraits render
 * a rounded portrait frame. Missing art renders a typographic placeholder
 * initial — never a broken image. Decorative `<img alt="">` when a visible
 * title accompanies the art; callers pass `alt` when the image stands alone.
 */
export function ProfileCover({
  coverFileId,
  title,
  alt,
  sizes,
}: {
  coverFileId: string | null | undefined;
  title: string;
  alt?: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = coverFileId && !failed;
  return (
    <span className={styles.artCover} aria-hidden={alt ? undefined : true}>
      {showImage ? (
        <img
          src={fileContentUrl(coverFileId)}
          alt={alt ?? ""}
          sizes={sizes}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.artPlaceholder} aria-hidden>
          {initialFor(title)}
        </span>
      )}
    </span>
  );
}

export function ProfilePortrait({
  photoFileId,
  name,
  alt,
}: {
  photoFileId: string | null | undefined;
  name: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = photoFileId && !failed;
  return (
    <span className={styles.artPortrait} aria-hidden={alt ? undefined : true}>
      {showImage ? (
        <img
          src={fileContentUrl(photoFileId)}
          alt={alt ?? ""}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.artPlaceholder} aria-hidden>
          {initialFor(name)}
        </span>
      )}
    </span>
  );
}
