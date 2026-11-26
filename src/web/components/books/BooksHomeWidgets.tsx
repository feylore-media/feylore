import type { ReactNode } from "react";
import styles from "./books.module.css";

export interface HomeWidget {
  id: string;
  render: () => ReactNode;
}

interface BooksHomeWidgetsProps {
  widgets?: HomeWidget[];
}

/** Future device/sync/RSS widget slot — zero height when empty. */
export function BooksHomeWidgets({ widgets = [] }: BooksHomeWidgetsProps) {
  if (widgets.length === 0) return null;

  return (
    <div className={styles.homeWidgets} aria-label="Library widgets">
      {widgets.map((w) => (
        <div key={w.id}>{w.render()}</div>
      ))}
    </div>
  );
}
