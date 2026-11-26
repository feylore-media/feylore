import { NavForwardLink } from "../../../icons/NavLinks";
import { useTranslation } from "react-i18next";
import { useBookHistory } from "../../../../hooks/books/useBookHistory";
import { WorkDetailSection } from "../../../work-detail/WorkDetailSection";
import { bookHistoryPath } from "../../../../routes/paths";
import styles from "../../../work-detail/work-detail.module.css";

interface YourActivitySectionProps {
  slug: string;
}

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

export function YourActivitySection({ slug }: YourActivitySectionProps) {
  const { t } = useTranslation("books");
  const { events, loading } = useBookHistory(slug);

  if (loading || events.length === 0) return null;

  const recent = [...events]
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    )
    .slice(0, 3);

  return (
    <WorkDetailSection label={t("yourActivity")} rule>
      <ul className={styles.journalList}>
        {recent.map((event) => (
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
      {events.length > 3 && (
        <NavForwardLink to={bookHistoryPath(slug)}>
          {t("viewFullHistory")}
        </NavForwardLink>
      )}
    </WorkDetailSection>
  );
}
