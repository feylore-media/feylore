import type { ReactNode } from "react";
import styles from "./music.module.css";

export function AlbumGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export function AlbumGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={styles.skeletonGrid}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeletonCard} aria-hidden />
      ))}
    </div>
  );
}
