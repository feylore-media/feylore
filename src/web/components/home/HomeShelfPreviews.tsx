import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { HomeShelfPreview } from "@shared/home";
import { ShelfPreviewCard } from "../books/ShelfPreviewCard";
import styles from "./home.module.css";

interface HomeShelfPreviewsProps {
  shelves: HomeShelfPreview[];
}

export function HomeShelfPreviews({ shelves }: HomeShelfPreviewsProps) {
  const { t } = useTranslation("home");

  if (shelves.length === 0) return null;

  return (
    <section className={styles.shelfRow} aria-label={t("shelves")}>
      <div className={styles.shelfRowHeader}>
        <h2 className={styles.shelfRowTitle}>{t("shelves")}</h2>
        <Link to="/shelves" className={styles.shelfRowSeeAll}>
          {t("seeAll")}
        </Link>
      </div>
      <div className={styles.shelvesPreviewRow}>
        {shelves.map((preview) => (
          <ShelfPreviewCard
            key={preview.shelf.id}
            shelf={preview.shelf}
            coverFileIds={preview.coverFileIds}
            itemCount={preview.itemCount}
          />
        ))}
      </div>
    </section>
  );
}
