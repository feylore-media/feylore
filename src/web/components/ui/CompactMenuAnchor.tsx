import type { ReactNode, Ref } from "react";
import styles from "./compact-menu.module.css";

export function CompactMenuAnchor({
  children,
  ref,
}: {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div className={styles.anchor} ref={ref}>
      {children}
    </div>
  );
}
