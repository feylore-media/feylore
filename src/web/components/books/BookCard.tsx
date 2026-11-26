import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { BookListItem } from "@shared/books";
import { BookCover } from "./BookCover";
import { bookPath, bookReaderPath } from "../../routes/paths";
import styles from "./books.module.css";

function progressPct(book: BookListItem): number | null {
  const p = book.progress?.totalProgression ?? book.progress?.progression;
  if (p == null || p <= 0) return null;
  return p;
}

function seriesLabel(book: BookListItem): string | null {
  if (!book.series) return null;
  const pos =
    book.series.position != null ? ` #${book.series.position}` : "";
  return `${book.series.name}${pos}`;
}

export interface BookCardProps {
  book: BookListItem;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function BookCard({
  book,
  selected,
  selectionMode,
  onToggleSelect,
}: BookCardProps) {
  const { t } = useTranslation("books");
  const pct = progressPct(book);
  const series = seriesLabel(book);
  const hasProgress = pct != null && pct > 0;
  const readLabel = hasProgress ? t("continueReading") : t("read");
  const readTo = hasProgress
    ? bookReaderPath(book.slug)
    : bookPath(book.slug);

  const coverVisuals = (
    <>
      <BookCover coverFileId={book.coverFileId} title={book.title} />
      {book.favorite && (
        <span className={styles.cardFavorite} aria-label="Favorite">
          ★
        </span>
      )}
      {pct != null && (
        <div className={styles.progressBar} aria-hidden>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
      )}
    </>
  );

  const coverBlock = selectionMode ? (
    <div className={styles.cardCoverBlock}>{coverVisuals}</div>
  ) : (
    <div className={styles.cardCoverBlock}>
      <Link
        to={bookPath(book.slug)}
        className={styles.cardCoverLink}
        aria-label={book.title}
      >
        {coverVisuals}
      </Link>
      <div className={styles.cardQuickAction}>
        <Link to={readTo} className={styles.cardQuickActionBtn}>
          {readLabel}
        </Link>
      </div>
    </div>
  );

  const textBlock = (
    <>
      <div className={styles.cardTitle}>{book.title}</div>
      {book.authors.length > 0 && (
        <div className={styles.cardMeta}>{book.authors.join(", ")}</div>
      )}
      {series && <div className={styles.cardSeries}>{series}</div>}
    </>
  );

  if (selectionMode) {
    return (
      <button
        type="button"
        className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
        onClick={() => onToggleSelect?.(book.id)}
        aria-pressed={selected}
        aria-label={book.title}
      >
        {coverBlock}
        {textBlock}
      </button>
    );
  }

  return (
    <div className={styles.card}>
      {coverBlock}
      <Link to={bookPath(book.slug)} className={styles.cardBodyLink}>
        {textBlock}
      </Link>
    </div>
  );
}
