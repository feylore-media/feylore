import { useTranslation } from "react-i18next";
import { useBookDetailContext } from "./BookDetailContext";
import { useBookHistory } from "../../../../hooks/books/useBookHistory";
import { WorkDetailSection } from "../../../../components/work-detail/WorkDetailSection";
import { LoadingState } from "../../../../components/states";
import styles from "../../../../components/work-detail/work-detail.module.css";

function formatEventLabel(
  eventType: string,
  t: (key: string) => string,
): string {
  switch (eventType) {
    case "progress_updated":
      return t("historyProgressUpdated");
    case "reading_started":
      return t("historyReadingStarted");
    case "reading_finished":
      return t("historyReadingFinished");
    case "rating_set":
      return t("historyRatingSet");
    case "favorite_set":
      return t("historyFavoriteSet");
    default:
      return eventType.replace(/_/g, " ");
  }
}

function progressPercent(
  progress: { totalProgression?: number; progression?: number } | null,
): number | null {
  if (!progress) return null;
  const pct = progress.totalProgression ?? progress.progression ?? null;
  return pct != null ? Math.round(pct * 100) : null;
}

export function BookHistoryPage() {
  const { t } = useTranslation("books");
  const { book, rating } = useBookDetailContext();
  const { events, loading } = useBookHistory(book?.slug);

  if (!book) return null;
  if (loading) return <LoadingState />;

  const pct = progressPercent(book.readingState.progress);
  const statusLabel = book.readingState.finished
    ? t("readingFinished")
    : book.readingState.started
      ? t("readingInProgress")
      : t("readingUnread");

  return (
    <>
      <WorkDetailSection label={t("tabHistory")} rule>
        <dl className={styles.metadataPrimary}>
          <dt>{t("rate")}</dt>
          <dd>{rating != null ? "★".repeat(rating) : "—"}</dd>
          <dt>{t("filterReadingState")}</dt>
          <dd>{statusLabel}</dd>
          <dt>{t("progress")}</dt>
          <dd>{pct != null ? t("progressPercent", { percent: pct }) : "—"}</dd>
          <dt>{t("activeFormat")}</dt>
          <dd>{book.readingState.activeRepresentationLabel ?? "—"}</dd>
          <dt>{t("readingJournal")}</dt>
          <dd>
            {[
              t("journalBookmarks", {
                count: book.journalSummary.bookmarkCount,
              }),
              t("journalAnnotations", {
                count: book.journalSummary.annotationCount,
              }),
            ].join(" · ")}
          </dd>
        </dl>
      </WorkDetailSection>

      {events.length > 0 && (
        <WorkDetailSection label={t("yourActivity")} rule>
          <ul className={styles.journalList}>
            {[...events]
              .sort(
                (a, b) =>
                  new Date(b.occurredAt).getTime() -
                  new Date(a.occurredAt).getTime(),
              )
              .map((event) => (
                <li key={event.id} className={styles.journalItem}>
                  <div className={styles.journalItemLocation}>
                    {formatEventLabel(event.eventType, t)}
                  </div>
                  <p className={styles.readingStateMeta}>
                    {new Date(event.occurredAt).toLocaleString()}
                  </p>
                </li>
              ))}
          </ul>
        </WorkDetailSection>
      )}

      {events.length === 0 && (
        <p className={styles.journalCounts}>{t("historyEmpty")}</p>
      )}
    </>
  );
}
