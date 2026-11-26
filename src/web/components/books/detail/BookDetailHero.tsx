import { useNavigate } from "react-router";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { BookDetail, BookReadingStateDetail } from "@shared/books";
import { BookCover } from "../BookCover";
import { AddToShelfMenu } from "../AddToShelfMenu";
import { Button } from "../../primitives";
import { api } from "../../../app/api";
import { bookEditPath, bookReaderPath } from "../../../routes/paths";
import { usePermission } from "../../../app/auth-context";
import { PERMISSIONS } from "@shared/permissions";
import styles from "../../work-detail/work-detail.module.css";

type ReadingPhase = "unread" | "in_progress" | "finished";

function getReadingPhase(readingState: BookReadingStateDetail): ReadingPhase {
  if (readingState.finished) return "finished";
  if (readingState.started) return "in_progress";
  return "unread";
}

function progressPercent(readingState: BookReadingStateDetail): number | null {
  const pct =
    readingState.progress?.totalProgression ??
    readingState.progress?.progression ??
    null;
  return pct != null ? Math.round(pct * 100) : null;
}

interface BookDetailHeroProps {
  book: BookDetail;
  rating: number | null;
  onRatingChange: (rating: number | null) => void;
  onFavoriteToggle: () => void;
  onShelfChange?: () => void;
}

export function BookDetailHero({
  book,
  rating,
  onRatingChange,
  onFavoriteToggle,
  onShelfChange,
}: BookDetailHeroProps) {
  const { t } = useTranslation("books");
  const navigate = useNavigate();
  const canEdit = usePermission(PERMISSIONS.BOOKS_WRITE);
  const phase = getReadingPhase(book.readingState);
  const pct = progressPercent(book.readingState);
  const { readingState } = book;

  async function setRating(value: number) {
    await api(`/books/${book.slug}/rating`, {
      method: "PUT",
      body: JSON.stringify({ rating: value }),
    });
    onRatingChange(value);
  }

  async function clearRating() {
    await api(`/books/${book.slug}/rating`, {
      method: "PUT",
      body: JSON.stringify({ rating: null }),
    });
    onRatingChange(null);
  }

  function handlePrimaryAction() {
    if (readingState.canContinueInReader) {
      navigate(bookReaderPath(book.slug));
    }
  }

  const primaryLabel =
    phase === "unread"
      ? t("startReading")
      : phase === "finished"
        ? t("readAgain")
        : t("continueReading");

  const showPrimaryAction = readingState.canContinueInReader;

  return (
    <header className={styles.identityBlock}>
      <div className={styles.identityCover}>
        <BookCover coverFileId={book.coverFileId} title={book.title} />
      </div>
      <div className={styles.identityBody}>
        <h1 className={styles.identityTitle}>{book.title}</h1>
        {book.subtitle && (
          <p className={styles.identitySubtitle}>{book.subtitle}</p>
        )}
        {book.authors.length > 0 && (
          <p className={styles.identityLinks}>
            {book.authors.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                {a.peopleSlug ? (
                  <Link to={`/people/${a.peopleSlug}`}>{a.name}</Link>
                ) : (
                  <Link
                    to={`/books/library?author=${encodeURIComponent(a.name)}`}
                  >
                    {a.name}
                  </Link>
                )}
              </span>
            ))}
          </p>
        )}
        {book.series && (
          <p className={styles.identityLinks}>
            <Link to={`/books/library?series=${book.series.id}`}>
              {book.series.name}
              {book.series.position != null && ` #${book.series.position}`}
            </Link>
          </p>
        )}

        {phase === "in_progress" && (
          <div className={styles.readingState}>
            <p className={styles.readingStateMain}>
              {pct != null
                ? t("continueReadingProgress", { percent: pct })
                : t("readingInProgress")}
            </p>
            {(readingState.progress?.title ||
              readingState.activeRepresentationLabel) && (
              <p className={styles.readingStateMeta}>
                {[
                  readingState.progress?.title,
                  readingState.activeRepresentationLabel,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {pct != null && (
              <div className={styles.progressBar} aria-hidden>
                <div
                  className={styles.progressFill}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        )}

        {phase === "finished" && (
          <p className={styles.readingStateMeta}>{t("readingFinished")}</p>
        )}

        <div className={styles.starRating} role="group" aria-label={t("rate")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Button
              key={n}
              type="button"
              className={`${styles.starButton} ${rating != null && n <= rating ? styles.starFilled : ""}`}
              onClick={() => setRating(n)}
              aria-pressed={rating === n}
              aria-label={`${n} stars`}
            >
              ★
            </Button>
          ))}
          {rating != null && (
            <button type="button" className={styles.starClear} onClick={clearRating}>
              {t("clearRating")}
            </button>
          )}
        </div>

        <div className={styles.readingStateActions}>
          {showPrimaryAction && (
            <Button variant="primary" type="button" onClick={handlePrimaryAction}>
              {primaryLabel}
            </Button>
          )}
          <Button type="button" onClick={onFavoriteToggle}>
            {book.userState.favorite ? t("unfavorite") : t("favorite")}
          </Button>
          <AddToShelfMenu
            bookId={book.id}
            onAdded={onShelfChange}
          />
          {canEdit && (
            <Link to={bookEditPath(book.slug)} className={styles.journalLink}>
              {t("editMetadata")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
