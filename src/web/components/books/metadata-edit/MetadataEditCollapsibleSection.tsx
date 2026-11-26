import type { ReactNode } from "react";
import styles from "./metadata-edit.module.css";

interface MetadataEditCollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function MetadataEditCollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: MetadataEditCollapsibleSectionProps) {
  return (
    <details
      className={styles.editCollapsible}
      open={defaultOpen || undefined}
    >
      <summary className={styles.editCollapsibleSummary}>{title}</summary>
      <div className={styles.editCollapsibleBody}>{children}</div>
    </details>
  );
}
