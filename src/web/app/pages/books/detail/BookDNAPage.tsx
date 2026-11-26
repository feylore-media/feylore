import { Fragment } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useBookDetailContext } from "./BookDetailContext";
import { BookDetailRelatedWorks } from "../../../../components/books/detail/BookDetailRelatedWorks";
import { WorkDetailSection } from "../../../../components/work-detail/WorkDetailSection";
import styles from "../../../../components/work-detail/work-detail.module.css";

export function BookDNAPage() {
  const { t } = useTranslation("books");
  const { book } = useBookDetailContext();

  if (!book) return null;

  const customDimensions = book.customFields.filter(
    (f) => f.displayValue != null && f.displayValue !== "",
  );

  const hasGenres = book.genres.length > 0;
  const hasRelationships = book.relationships.some(
    (r) => r.targetHref || r.targetTitle,
  );
  const hasCustom = customDimensions.length > 0;

  if (!hasGenres && !hasRelationships && !hasCustom) {
    return (
      <p className={styles.journalCounts}>{t("dnaEmpty")}</p>
    );
  }

  return (
    <>
      {hasGenres && (
        <WorkDetailSection label={t("genresLabel")} rule>
          <div className={styles.chipList}>
            {book.genres.map((genre) => (
              <Link
                key={genre}
                to={`/books/library?genre=${encodeURIComponent(genre)}`}
                className={styles.chip}
              >
                {genre}
              </Link>
            ))}
          </div>
        </WorkDetailSection>
      )}

      {hasCustom && (
        <WorkDetailSection label={t("customFields")} rule>
          <dl className={styles.metadataSecondary}>
            {customDimensions.map((field) => (
              <Fragment key={field.key}>
                <dt>{field.displayName}</dt>
                <dd>{field.displayValue}</dd>
              </Fragment>
            ))}
          </dl>
        </WorkDetailSection>
      )}

      {hasRelationships && <BookDetailRelatedWorks book={book} />}
    </>
  );
}
