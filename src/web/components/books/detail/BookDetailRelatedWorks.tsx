import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { BookDetail } from "@shared/books";
import { WorkDetailSection } from "../../work-detail/WorkDetailSection";
import styles from "../../work-detail/work-detail.module.css";

interface BookDetailRelatedWorksProps {
  book: BookDetail;
}

export function BookDetailRelatedWorks({ book }: BookDetailRelatedWorksProps) {
  const { t } = useTranslation("books");
  const enriched = book.relationships.filter((r) => r.targetHref || r.targetTitle);
  if (enriched.length === 0) return null;

  return (
    <WorkDetailSection title={t("relationships")} rule>
      <ul className={styles.relatedList}>
        {enriched.map((rel) => (
          <li key={rel.id}>
            {rel.targetHref ? (
              <Link to={rel.targetHref}>
                {rel.targetTitle ?? rel.targetId}
                <span className={styles.journalCounts}>
                  {" "}
                  · {rel.relationshipType.replace(/_/g, " ")}
                </span>
              </Link>
            ) : (
              <>
                {rel.targetTitle ?? rel.targetId} · {rel.relationshipType}
              </>
            )}
          </li>
        ))}
      </ul>
    </WorkDetailSection>
  );
}
