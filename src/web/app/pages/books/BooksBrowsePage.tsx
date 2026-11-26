import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useBooksQuery } from "../../../hooks/books/useBooksQuery";
import { BookCard } from "../../../components/books/BookCard";
import { BookListRow } from "../../../components/books/BookListRow";
import { BookGrid, BookGridSkeleton } from "../../../components/books/BookGrid";
import { BooksFilterBar } from "../../../components/books/BooksFilterBar";
import { BooksSelectionBar } from "../../../components/books/BooksSelectionBar";
import {
  DraggableBookCard,
  DraggableBookListRow,
} from "../../../components/shelves/DraggableBook";
import { Button } from "../../../components/primitives";
import styles from "../../../components/books/books.module.css";

interface BooksBrowsePageProps {
  defaultView?: "all" | "continue" | "recent";
  defaultFavorite?: boolean;
  titleKey?: string;
  lockView?: boolean;
}

const TITLE_KEYS = {
  all: "library",
  continue: "continue",
  recent: "recent",
  favorites: "favorites",
} as const;

export function BooksBrowsePage({
  defaultView = "all",
  defaultFavorite,
  titleKey,
  lockView = false,
}: BooksBrowsePageProps) {
  const { t } = useTranslation("books");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const {
    books,
    loading,
    loadingMore,
    error,
    nextCursor,
    filters,
    rawQ,
    loadMore,
    reload,
    setFilter,
    clearFilters,
    setSearchInput,
    hasActiveFilters,
  } = useBooksQuery({
    defaultView,
    defaultFavorite,
    debounceSearch: true,
  });

  const pageTitleKey =
    titleKey ??
    (defaultFavorite
      ? "favorites"
      : defaultView === "continue"
        ? "continue"
        : defaultView === "recent"
          ? "recent"
          : "library");

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const showEmptyLibrary =
    !loading && books.length === 0 && !hasActiveFilters && defaultView === "all" && !defaultFavorite;

  return (
    <div>
      <h1 className={styles.pageTitle}>{t(TITLE_KEYS[pageTitleKey as keyof typeof TITLE_KEYS] ?? pageTitleKey)}</h1>

      <BooksFilterBar
        rawQ={rawQ}
        filters={filters}
        onSearchChange={setSearchInput}
        onFilterChange={setFilter}
        onClearFilters={clearFilters}
        layout={layout}
        onLayoutChange={setLayout}
        selectionMode={selectionMode}
        onToggleSelectionMode={() => {
          setSelectionMode((m) => !m);
          setSelected(new Set());
        }}
        lockView={lockView}
      />

      {error && (
        <div className={styles.errorBanner} role="alert">
          <span>{t("loadError")}</span>
          <Button type="button" onClick={reload}>
            {t("retry")}
          </Button>
        </div>
      )}

      {loading ? (
        <BookGridSkeleton />
      ) : books.length === 0 ? (
        <div className={styles.emptyInline}>
          <h2 className={styles.emptyInlineTitle}>
            {showEmptyLibrary ? t("noBooks") : t("noResults")}
          </h2>
          <p className={styles.emptyInlineDetail}>
            {showEmptyLibrary ? t("noBooksDetail") : t("noResultsDetail")}
          </p>
          <div className={styles.emptyInlineActions}>
            {hasActiveFilters && (
              <Button type="button" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            )}
            <Link to="/books/import">
              <Button type="button" variant="primary">
                {t("import")}
              </Button>
            </Link>
            {showEmptyLibrary && (
              <Link to="/books/new">
                <Button type="button">{t("newBook")}</Button>
              </Link>
            )}
          </div>
        </div>
      ) : layout === "grid" ? (
        <BookGrid>
          {books.map((book) =>
            selectionMode ? (
              <BookCard
                key={book.id}
                book={book}
                selectionMode
                selected={selected.has(book.id)}
                onToggleSelect={toggleSelect}
              />
            ) : (
              <DraggableBookCard key={book.id} book={book} />
            ),
          )}
        </BookGrid>
      ) : (
        <div className={styles.list}>
          {books.map((book) =>
            selectionMode ? (
              <BookListRow
                key={book.id}
                book={book}
                selectionMode
                selected={selected.has(book.id)}
                onToggleSelect={toggleSelect}
              />
            ) : (
              <DraggableBookListRow key={book.id} book={book} />
            ),
          )}
        </div>
      )}

      {nextCursor !== null && (
        <div className={styles.loadMore}>
          <Button type="button" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? t("loadingMore") : t("loadMore")}
          </Button>
        </div>
      )}

      {selectionMode && selected.size > 0 && (
        <BooksSelectionBar
          bookIds={[...selected]}
          onCancel={() => {
            setSelected(new Set());
            setSelectionMode(false);
          }}
          onDone={() => {
            setSelected(new Set());
            setSelectionMode(false);
          }}
        />
      )}
    </div>
  );
}
