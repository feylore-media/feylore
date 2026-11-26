import type { ReactNode } from "react";
import styles from "./tv.module.css";

export function ShowGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export function ShowGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={styles.skeletonGrid}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeletonCard} aria-hidden />
      ))}
    </div>
  );
}
