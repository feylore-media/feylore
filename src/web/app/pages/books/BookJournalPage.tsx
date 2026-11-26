import { ShareWithClub } from "../../components/clubs/ShareWithClub";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReadingLocator } from "@shared/books";
import { useBookJournal } from "../../../hooks/books/useBookJournal";
import { useBookDetailContext } from "./detail/BookDetailContext";
import {
  formatLocatorExcerpt,
  formatLocatorLabel,
  locatorProgression,
} from "../../../components/work-detail/locatorPreview";
import styles from "../../../components/work-detail/work-detail.module.css";
import bookStyles from "../../../components/books/books.module.css";

type JournalTab = "bookmarks" | "annotations" | "quotes" | "journal";

function compareLocators(a: ReadingLocator, b: ReadingLocator): number {
  const ap = locatorProgression(a) ?? 0;
  const bp = locatorProgression(b) ?? 0;
  return ap - bp;
}

export function BookJournalPage() {
  const { t } = useTranslation("books");
  const { slug, book } = useBookDetailContext();
  const { bookmarks, annotations, loading, error } = useBookJournal(slug);
  const [tab, setTab] = useState<JournalTab>("bookmarks");

  const sortedBookmarks = useMemo(
    () => [...bookmarks].sort((a, b) => compareLocators(a.locator, b.locator)),
    [bookmarks],
  );
  const sortedAnnotations = useMemo(
    () =>
      [...annotations].sort((a, b) => compareLocators(a.locator, b.locator)),
    [annotations],
  );
  const quoteAnnotations = useMemo(
    () => annotations.filter((a) => a.highlightText && !a.note),
    [annotations],
  );

  if (loading) return null;
  if (error) {
    return <p className={styles.journalCounts}>{t("journalLoadError")}</p>;
  }

  const tabs: { id: JournalTab; label: string; count?: number }[] = [
    { id: "bookmarks", label: t("bookmarks"), count: bookmarks.length },
    { id: "annotations", label: t("annotations"), count: annotations.length },
    {
      id: "quotes",
      label: t("quotesTab"),
      count: quoteAnnotations.length || undefined,
    },
    { id: "journal", label: t("journalTab") },
  ];

  return (
    <>
      <p className={styles.readingStateMeta}>{t("journalPageIntro")}</p>

      <nav className={styles.chipList} aria-label={t("readingJournal")}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.chip} ${tab === item.id ? bookStyles.moduleSubnavActive : ""}`}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "true" : undefined}
          >
            {item.label}
            {item.count != null ? ` (${item.count})` : ""}
          </button>
        ))}
      </nav>

      {tab === "bookmarks" && (
        <section className={styles.section}>
          {sortedBookmarks.length === 0 ? (
            <p className={styles.journalCounts}>{t("journalBookmarksEmpty")}</p>
          ) : (
            <ul className={styles.journalList}>
              {sortedBookmarks.map((bookmark) => (
                <li key={bookmark.id} className={styles.journalItem}>
                  <div className={styles.journalItemLocation}>
                    {formatLocatorLabel(bookmark.locator)}
                  </div>
                  {formatLocatorExcerpt(
                    bookmark.locator,
                    undefined,
                    bookmark.label ?? undefined,
                  ) && (
                    <p className={styles.journalItemExcerpt}>
                      {formatLocatorExcerpt(
                        bookmark.locator,
                        undefined,
                        bookmark.label ?? undefined,
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "annotations" && (
        <section className={styles.section}>
          {sortedAnnotations.length === 0 ? (
            <p className={styles.journalCounts}>
              {t("journalAnnotationsEmpty")}
            </p>
          ) : (
            <ul className={styles.journalList}>
              {sortedAnnotations.map((annotation) => (
                <li key={annotation.id} className={styles.journalItem}>
                  <div className={styles.journalItemLocation}>
                    {formatLocatorLabel(annotation.locator)}
                  </div>
                  {annotation.highlightText && (
                    <p className={styles.journalItemExcerpt}>
                      {annotation.highlightText}
                    </p>
                  )}
                  <ShareWithClub
                    workId={book?.id}
                    sourceAnnotationId={annotation.id}
                    locator={annotation.locator}
                  />
                  {annotation.note && (
                    <p className={styles.readingStateMeta}>{annotation.note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "quotes" && (
        <section className={styles.section}>
          {quoteAnnotations.length === 0 ? (
            <p className={styles.journalCounts}>{t("quotesEmpty")}</p>
          ) : (
            <>
              <p className={styles.journalCounts}>{t("quotesApproxNote")}</p>
              <ul className={styles.journalList}>
                {quoteAnnotations.map((annotation) => (
                  <li key={annotation.id} className={styles.journalItem}>
                    <div className={styles.journalItemLocation}>
                      {formatLocatorLabel(annotation.locator)}
                    </div>
                    <p className={styles.journalItemExcerpt}>
                      {annotation.highlightText}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {tab === "journal" && (
        <section className={styles.section}>
          <p className={styles.journalCounts}>{t("journalEntriesEmpty")}</p>
        </section>
      )}
    </>
  );
}
