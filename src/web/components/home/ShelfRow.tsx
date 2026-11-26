import { Link } from "react-router";
import type { ReactNode } from "react";
import styles from "./home.module.css";

interface ShelfRowProps {
  title: string;
  subtitle?: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  children: ReactNode;
  emptyMessage?: string;
}

export function ShelfRow({
  title,
  subtitle,
  seeAllHref,
  seeAllLabel = "See all",
  children,
  emptyMessage,
}: ShelfRowProps) {
  const hasChildren =
    Array.isArray(children) ? children.length > 0 : Boolean(children);

  if (!hasChildren && !emptyMessage) return null;

  return (
    <section className={styles.shelfRow} aria-label={title}>
      <div className={styles.shelfRowHeader}>
        <div>
          <h2 className={styles.shelfRowTitle}>{title}</h2>
          {subtitle && <p className={styles.shelfRowSubtitle}>{subtitle}</p>}
        </div>
        {seeAllHref && hasChildren && (
          <Link to={seeAllHref} className={styles.shelfRowSeeAll}>
            {seeAllLabel}
          </Link>
        )}
      </div>
      {hasChildren ? (
        <div className={styles.shelfRowTrack}>{children}</div>
      ) : emptyMessage ? (
        <p className={styles.shelfRowEmpty}>{emptyMessage}</p>
      ) : null}
    </section>
  );
}
