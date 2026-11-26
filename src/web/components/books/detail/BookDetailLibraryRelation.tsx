import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ShelfPublic } from "@shared/shelves";
import { WorkDetailSection } from "../../work-detail/WorkDetailSection";
import { ShelfVisibilityIndicator } from "../../shelves/ShelfVisibilityIndicator";
import styles from "../../work-detail/work-detail.module.css";

interface BookDetailLibraryRelationProps {
  shelves: ShelfPublic[];
}

export function BookDetailLibraryRelation({
  shelves,
}: BookDetailLibraryRelationProps) {
  const { t } = useTranslation("books");
  if (shelves.length === 0) return null;

  return (
    <WorkDetailSection label={t("yourLibrary")} rule>
      <p className={styles.journalCounts}>{t("shelvesLabel")}</p>
      <div className={styles.chipList}>
        {shelves.map((s) => (
          <Link key={s.id} to={`/shelves/${s.id}`} className={styles.chip}>
            {s.name}
            <ShelfVisibilityIndicator
              visibility={s.visibility}
              isOwner={s.isOwner}
              compact
            />
          </Link>
        ))}
      </div>
    </WorkDetailSection>
  );
}
