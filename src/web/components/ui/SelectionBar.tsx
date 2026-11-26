import type { ReactNode } from "react";
import styles from "./selection-bar.module.css";

export function SelectionBar({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.bar} role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

export function SelectionBarCount({ children }: { children: ReactNode }) {
  return <span className={styles.count}>{children}</span>;
}
