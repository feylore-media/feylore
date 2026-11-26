import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { BookListItem } from "@shared/books";
import type { ShelfPublic } from "@shared/shelves";
import type { ShelfDetail } from "@shared/shelves";
import { api } from "../../api";
import { fetchBooks } from "../../../hooks/books/useBooksQuery";
import { BookCard } from "../../../components/books/BookCard";
import { BookShelfRow } from "../../../components/books/BookShelfRow";
import { ShelfPreviewCard } from "../../../components/books/ShelfPreviewCard";
import { BooksHomeWidgets } from "../../../components/books/BooksHomeWidgets";
import { BookGridSkeleton } from "../../../components/books/BookGrid";
import { Button } from "../../../components/primitives";
import styles from "../../../components/books/books.module.css";

interface ShelfPreviewData {
  shelf: ShelfPublic;
  covers: (string | null)[];
  itemCount: number;
}

export function BooksHomePage() {
  const { t } = useTranslation("books");

  const [continueBooks, setContinueBooks] = useState<BookListItem[]>([]);
  const [continueLoading, setContinueLoading] = useState(true);
  const [continueError, setContinueError] = useState(false);

  const [recentBooks, setRecentBooks] = useState<BookListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);

  const [seriesList, setSeriesList] = useState<
    Array<{ id: string; name: string; description?: string }>
  >([]);
  const [seriesLoading, setSeriesLoading] = useState(true);

  const [shelfPreviews, setShelfPreviews] = useState<ShelfPreviewData[]>([]);
  const [shelvesLoading, setShelvesLoading] = useState(true);
  const [shelvesError, setShelvesError] = useState(false);

  useEffect(() => {
    void fetchBooks({ view: "continue", limit: 12 })
      .then(setContinueBooks)
      .catch(() => setContinueError(true))
      .finally(() => setContinueLoading(false));
  }, []);

  useEffect(() => {
    void fetchBooks({ view: "recent", limit: 12 })
      .then(setRecentBooks)
      .catch(() => setRecentError(true))
      .finally(() => setRecentLoading(false));
  }, []);

  useEffect(() => {
    void api<{ data: Array<{ id: string; name: string; description?: string }> }>(
      "/books/series",
    )
      .then((r) => setSeriesList(r.data))
      .finally(() => setSeriesLoading(false));
  }, []);

  useEffect(() => {
    void api<{ data: ShelfPublic[] }>("/shelves?scope=books")
      .then(async (r) => {
        const top = r.data.slice(0, 6);
        const previews = await Promise.all(
          top.map(async (shelf) => {
            try {
              const detail = await api<{ data: ShelfDetail }>(
                `/shelves/${shelf.id}`,
              );
              const books = detail.data.items
                .map((i) => i.book)
                .filter((b): b is BookListItem => b != null);
              return {
                shelf,
                covers: books.slice(0, 4).map((b) => b.coverFileId),
                itemCount: detail.data.items.length,
              };
            } catch {
              return { shelf, covers: [], itemCount: 0 };
            }
          }),
        );
        setShelfPreviews(previews);
      })
      .catch(() => setShelvesError(true))
      .finally(() => setShelvesLoading(false));
  }, []);

  return (
    <div className={styles.homePage}>
      <BooksHomeWidgets widgets={[]} />

      {continueLoading ? (
        <BookGridSkeleton count={6} />
      ) : !continueError && continueBooks.length > 0 ? (
        <BookShelfRow
          title={t("homeContinue")}
          seeAllHref="/books/continue"
          seeAllLabel={t("seeAll")}
        >
          {continueBooks.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </BookShelfRow>
      ) : null}

      {shelvesLoading ? (
        <div className={styles.shelfRow}>
          <h2 className={styles.shelfRowTitle}>{t("homeShelves")}</h2>
          <BookGridSkeleton count={4} />
        </div>
      ) : !shelvesError && shelfPreviews.length > 0 ? (
        <section className={styles.shelfRow} aria-label={t("homeShelves")}>
          <div className={styles.shelfRowHeader}>
            <h2 className={styles.shelfRowTitle}>{t("homeShelves")}</h2>
            <Link to="/shelves" className={styles.shelfRowSeeAll}>
              {t("allShelves")}
            </Link>
          </div>
          <div className={styles.shelvesPreviewRow}>
            {shelfPreviews.map((p) => (
              <ShelfPreviewCard
                key={p.shelf.id}
                shelf={p.shelf}
                coverFileIds={p.covers}
                itemCount={p.itemCount}
              />
            ))}
          </div>
        </section>
      ) : !shelvesError ? (
        <section className={styles.shelfRow}>
          <h2 className={styles.shelfRowTitle}>{t("homeShelves")}</h2>
          <p className={styles.shelfRowEmpty}>
            {t("homeShelvesEmpty")}{" "}
            <Link to="/shelves">{t("createShelf")}</Link>
          </p>
        </section>
      ) : null}

      {recentLoading ? (
        <BookGridSkeleton count={6} />
      ) : !recentError && recentBooks.length > 0 ? (
        <BookShelfRow
          title={t("homeRecent")}
          seeAllHref="/books/recent"
          seeAllLabel={t("seeAll")}
        >
          {recentBooks.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </BookShelfRow>
      ) : null}

      {!seriesLoading && seriesList.length > 0 ? (
        <BookShelfRow
          title={t("homeSeries")}
          seeAllHref="/books/series"
          seeAllLabel={t("seeAll")}
        >
          {seriesList.slice(0, 8).map((s) => (
            <Link
              key={s.id}
              to={`/books/library?series=${s.id}`}
              className={styles.card}
              style={{ width: "8.5rem" }}
            >
              <div className={styles.seriesCardCover}>
                <span className={styles.seriesCardInitial}>
                  {s.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className={styles.cardTitle}>{s.name}</div>
            </Link>
          ))}
        </BookShelfRow>
      ) : null}

      <section className={styles.homeOverview}>
        <p className={styles.homeOverviewText}>{t("homeOverview")}</p>
        <div className={styles.emptyInlineActions}>
          <Link to="/books/library">
            <Button type="button" variant="primary">
              {t("browseLibrary")}
            </Button>
          </Link>
          <Link to="/books/import">
            <Button type="button">{t("import")}</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
