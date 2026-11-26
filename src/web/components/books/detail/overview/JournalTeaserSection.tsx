import { NavForwardLink } from "../../../icons/NavLinks";
import { useTranslation } from "react-i18next";
import type { BookJournalSummary } from "@shared/books";
import { bookJournalPath } from "../../../../routes/paths";
import { WorkDetailSection } from "../../../work-detail/WorkDetailSection";
import { formatLocatorExcerpt, formatLocatorLabel } from "../../../work-detail/locatorPreview";
import styles from "../../../work-detail/work-detail.module.css";

interface JournalTeaserSectionProps {
  slug: string;
  summary: BookJournalSummary;
}

export function JournalTeaserSection({ slug, summary }: JournalTeaserSectionProps) {
  const { t } = useTranslation("books");

  const hasContent =
    summary.bookmarkCount > 0 ||
    summary.annotationCount > 0 ||
    (summary.quoteCountApprox ?? 0) > 0;

  return (
    <WorkDetailSection label={t("readingJournal")} rule>
      {hasContent ? (
        <>
          <p className={styles.journalCounts}>
            {[
              t("journalBookmarks", { count: summary.bookmarkCount }),
              t("journalAnnotations", { count: summary.annotationCount }),
            ].join(" · ")}
          </p>
          {summary.recent.length > 0 && (
            <ul className={styles.journalList}>
              {summary.recent.slice(0, 2).map((item) => {
                const excerpt = formatLocatorExcerpt(
                  item.locator,
                  item.highlightText,
                  item.label,
                );
                return (
                  <li key={`${item.kind}-${item.id}`} className={styles.journalItem}>
                    <div className={styles.journalItemLocation}>
                      {formatLocatorLabel(item.locator)}
                    </div>
                    {excerpt && (
                      <p className={styles.journalItemExcerpt}>{excerpt}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <p className={styles.journalCounts}>{t("journalTeaserEmpty")}</p>
      )}
      <NavForwardLink to={bookJournalPath(slug)}>
        {t("viewFullJournal")}
      </NavForwardLink>
    </WorkDetailSection>
  );
}
