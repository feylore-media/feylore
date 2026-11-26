import { Link, Outlet } from "react-router";
import { NavBackLink } from "../../../../components/icons/NavLinks";
import { useTranslation } from "react-i18next";
import { LoadingState } from "../../../../components/states";
import { BookDetailHero } from "../../../../components/books/detail/BookDetailHero";
import { BookDetailProvider, useBookDetailContext } from "./BookDetailContext";
import { BookDetailNavigation } from "./BookDetailNavigation";
import styles from "../../../../components/work-detail/work-detail.module.css";
import bookStyles from "../../../../components/books/books.module.css";

function BookDetailLayoutContent() {
  const { t } = useTranslation("books");
  const {
    book,
    loading,
    error,
    rating,
    setRating,
    toggleFavorite,
    reload,
  } = useBookDetailContext();

  if (loading) return <LoadingState />;
  if (error || !book) {
    return (
      <div className={bookStyles.emptyInline}>
        <h2 className={bookStyles.emptyInlineTitle}>{t("bookNotFound")}</h2>
        <Link to="/books/library" className={styles.backLink}>
          {t("backToLibrary")}
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.detailWorkspace}>
      <NavBackLink to="/books/library">{t("backToLibrary")}</NavBackLink>

      <BookDetailHero
        book={book}
        rating={rating}
        onRatingChange={setRating}
        onFavoriteToggle={() => void toggleFavorite()}
        onShelfChange={reload}
      />

      <BookDetailNavigation />

      <Outlet />
    </div>
  );
}

export function BookDetailLayout() {
  return (
    <BookDetailProvider>
      <BookDetailLayoutContent />
    </BookDetailProvider>
  );
}
