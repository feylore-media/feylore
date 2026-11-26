import { NavForwardLink } from "../../components/icons/NavLinks";
import { useTranslation } from "react-i18next";
import type { BookJournalSummary } from "@shared/books";
import { bookJournalPath } from "../../routes/paths";
import { formatLocatorExcerpt, formatLocatorLabel } from "./locatorPreview";
import { WorkDetailSection } from "./WorkDetailSection";
import styles from "./work-detail.module.css";

interface JournalPreviewProps {
  slug: string;
  summary: BookJournalSummary;
}

export function JournalPreview({ slug, summary }: JournalPreviewProps) {
  const { t } = useTranslation("books");

  const hasContent =
    summary.bookmarkCount > 0 ||
    summary.annotationCount > 0 ||
    (summary.quoteCountApprox ?? 0) > 0;

  if (!hasContent) return null;

  const countParts = [
    t("journalBookmarks", { count: summary.bookmarkCount }),
    t("journalAnnotations", { count: summary.annotationCount }),
  ];
  if (summary.quoteCountApprox != null && summary.quoteCountApprox > 0) {
    countParts.push(
      t("journalQuotesApprox", { count: summary.quoteCountApprox }),
    );
  }
  if (summary.journalEntryCount > 0) {
    countParts.push(
      t("journalEntries", { count: summary.journalEntryCount }),
    );
  }

  return (
    <WorkDetailSection label={t("readingJournal")} rule>
      <p className={styles.journalCounts}>{countParts.join(" · ")}</p>
      {summary.recent.length > 0 && (
        <ul className={styles.journalList}>
          {summary.recent.map((item) => {
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
      <NavForwardLink to={bookJournalPath(slug)}>
        {t("viewFullJournal")}
      </NavForwardLink>
    </WorkDetailSection>
  );
}
