import type { ReactNode, Ref } from "react";
import styles from "./compact-menu.module.css";

export function CompactMenuPanel({
  children,
  ref,
  className,
}: {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
  className?: string;
}) {
  const panelClass = className ? `${styles.panel} ${className}` : styles.panel;
  return (
    <div className={panelClass} ref={ref} role="menu">
      {children}
    </div>
  );
}
