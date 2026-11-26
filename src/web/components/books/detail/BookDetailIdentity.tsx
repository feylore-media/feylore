import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { BookDetail } from "@shared/books";
import { BookCover } from "../BookCover";
import { Button } from "../../primitives";
import { api } from "../../../app/api";
import { MetadataFieldGrid } from "../../work-detail/MetadataFieldGrid";
import { MetadataExpandable } from "../../work-detail/MetadataExpandable";
import { metadataFieldsForOverview } from "../metadata/metadata-field-display";
import styles from "../../work-detail/work-detail.module.css";

interface BookDetailIdentityProps {
  book: BookDetail;
  rating: number | null;
  onRatingChange: (rating: number | null) => void;
  onFavoriteToggle: () => void;
}

export function BookDetailIdentity({
  book,
  rating,
  onRatingChange,
  onFavoriteToggle,
}: BookDetailIdentityProps) {
  const { t } = useTranslation("books");
  const [descExpanded, setDescExpanded] = useState(false);
  const longDescription = (book.description?.length ?? 0) > 400;
  const overviewMetadataFields = metadataFieldsForOverview(book.metadataFields);

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

  return (
    <div className={styles.identityBlock}>
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

        <MetadataFieldGrid
          fields={overviewMetadataFields}
          prominence="primary"
        />

        {book.description && (
          <>
            <p
              className={`${styles.identityDescription} ${!descExpanded && longDescription ? styles.identityDescriptionCollapsed : ""}`}
            >
              {book.description}
            </p>
            {longDescription && (
              <button
                type="button"
                className={styles.expandBtn}
                onClick={() => setDescExpanded((e) => !e)}
              >
                {descExpanded ? t("showLess") : t("showMore")}
              </button>
            )}
          </>
        )}

        <MetadataExpandable fields={overviewMetadataFields} />

        <div className={styles.readingStateActions}>
          <Button type="button" onClick={onFavoriteToggle}>
            {book.userState.favorite ? t("unfavorite") : t("favorite")}
          </Button>
        </div>
      </div>
    </div>
  );
}
