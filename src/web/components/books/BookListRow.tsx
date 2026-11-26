import { Link } from "react-router";
import type { BookListItem } from "@shared/books";
import { BookCover } from "./BookCover";
import { bookPath } from "../../routes/paths";
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

export interface BookListRowProps {
  book: BookListItem;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function BookListRow({
  book,
  selected,
  selectionMode,
  onToggleSelect,
}: BookListRowProps) {
  const pct = progressPct(book);
  const series = seriesLabel(book);

  const body = (
    <>
      <BookCover
        coverFileId={book.coverFileId}
        title={book.title}
        size="small"
      />
      <div className={styles.listRowBody}>
        <div className={styles.cardTitle}>{book.title}</div>
        {book.authors.length > 0 && (
          <div className={styles.cardMeta}>{book.authors.join(", ")}</div>
        )}
        {series && <div className={styles.cardSeries}>{series}</div>}
      </div>
      {book.favorite && (
        <span className={styles.cardFavorite} aria-label="Favorite">
          ★
        </span>
      )}
      {pct != null && (
        <div className={`${styles.progressBar} ${styles.listRowProgress}`}>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
      )}
    </>
  );

  if (selectionMode) {
    return (
      <button
        type="button"
        className={`${styles.listRow} ${selected ? styles.listRowSelected : ""}`}
        onClick={() => onToggleSelect?.(book.id)}
        aria-pressed={selected}
      >
        {body}
      </button>
    );
  }

  return (
    <Link to={bookPath(book.slug)} className={styles.listRow}>
      {body}
    </Link>
  );
}
