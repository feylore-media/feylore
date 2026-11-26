import { useTranslation } from "react-i18next";
import type { BookDetail } from "@shared/books";
import { WorkDetailSection } from "../../../work-detail/WorkDetailSection";
import styles from "../../../work-detail/work-detail.module.css";

interface YourReadingSectionProps {
  book: BookDetail;
}

function progressPercent(book: BookDetail): number | null {
  const pct =
    book.readingState.progress?.totalProgression ??
    book.readingState.progress?.progression ??
    null;
  return pct != null ? Math.round(pct * 100) : null;
}

export function YourReadingSection({ book }: YourReadingSectionProps) {
  const { t } = useTranslation("books");
  const { readingState } = book;
  const pct = progressPercent(book);

  const hasStarted = readingState.started || readingState.finished;
  if (!hasStarted && !readingState.canContinueInReader) return null;

  const statusLabel = readingState.finished
    ? t("readingFinished")
    : readingState.started
      ? t("readingInProgress")
      : t("readingUnread");

  const metaParts: string[] = [];
  if (pct != null) metaParts.push(t("progressPercent", { percent: pct }));
  if (readingState.progress?.title) metaParts.push(readingState.progress.title);
  if (readingState.activeRepresentationLabel) {
    metaParts.push(readingState.activeRepresentationLabel);
  }
  if (readingState.progressUpdatedAt) {
    metaParts.push(
      t("lastSynced", {
        time: new Date(readingState.progressUpdatedAt).toLocaleString(),
      }),
    );
  }

  return (
    <WorkDetailSection label={t("yourReading")} rule>
      <p className={styles.readingStateMain}>{statusLabel}</p>
      {metaParts.length > 0 && (
        <p className={styles.readingStateMeta}>{metaParts.join(" · ")}</p>
      )}
      {!readingState.finished && pct != null && (
        <div className={styles.progressBar} aria-hidden>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      )}
    </WorkDetailSection>
  );
}
