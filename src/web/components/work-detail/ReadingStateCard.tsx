import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { BookReadingStateDetail } from "@shared/books";
import { Button } from "../primitives";
import { bookReaderPath } from "../../routes/paths";
import styles from "./work-detail.module.css";

interface ReadingStateCardProps {
  slug: string;
  readingState: BookReadingStateDetail;
  rating?: number | null;
}

export function ReadingStateCard({
  slug,
  readingState,
  rating,
}: ReadingStateCardProps) {
  const { t } = useTranslation("books");
  const navigate = useNavigate();

  const { progress, finished, started, canContinueInReader } = readingState;
  if (!started && !finished) return null;

  const pct =
    progress?.totalProgression ?? progress?.progression ?? null;
  const pctRounded = pct != null ? Math.round(pct * 100) : null;

  let mainText: string;
  if (finished) {
    mainText = t("readingFinished");
    if (rating != null) mainText += ` · ${"★".repeat(rating)}`;
  } else if (pctRounded != null) {
    mainText = t("continueReadingProgress", { percent: pctRounded });
  } else {
    mainText = t("readingInProgress");
  }

  const metaParts: string[] = [];
  if (progress?.title) metaParts.push(progress.title);
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
    <div className={styles.readingState}>
      <p className={styles.readingStateHeader}>{t("yourReading")}</p>
      <p className={styles.readingStateMain}>{mainText}</p>
      {metaParts.length > 0 && (
        <p className={styles.readingStateMeta}>{metaParts.join(" · ")}</p>
      )}
      {!finished && pctRounded != null && (
        <div className={styles.progressBar} aria-hidden>
          <div
            className={styles.progressFill}
            style={{ width: `${pctRounded}%` }}
          />
        </div>
      )}
      {canContinueInReader && (
        <div className={styles.readingStateActions}>
          <Button
            variant="primary"
            type="button"
            onClick={() => navigate(bookReaderPath(slug))}
          >
            {t("continueReading")}
          </Button>
        </div>
      )}
    </div>
  );
}
