import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { MovieListItem } from "@shared/movies";
import type { ShelfPublic, ShelfDetail } from "@shared/shelves";
import { fetchMovies } from "../../../hooks/movies/useMoviesQuery";
import { MovieCard } from "../../../components/movies/MovieCard";
import { MovieGridSkeleton } from "../../../components/movies/MovieGrid";
import { ShelfRow } from "../../../components/home/ShelfRow";
import { ShelfPreviewCard } from "../../../components/books/ShelfPreviewCard";
import { Button } from "../../../components/primitives";
import { api } from "../../api";
import styles from "../../../components/movies/movies.module.css";

interface ShelfPreviewData {
  shelf: ShelfPublic;
  covers: (string | null)[];
  itemCount: number;
}

export function MoviesHomePage() {
  const { t } = useTranslation(["movies", "shelves"]);

  const [continueMovies, setContinueMovies] = useState<MovieListItem[]>([]);
  const [continueLoading, setContinueLoading] = useState(true);
  const [continueError, setContinueError] = useState(false);

  const [recentMovies, setRecentMovies] = useState<MovieListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);

  const [shelfPreviews, setShelfPreviews] = useState<ShelfPreviewData[]>([]);
  const [shelvesLoading, setShelvesLoading] = useState(true);

  useEffect(() => {
    void fetchMovies({ view: "continue", limit: 12 })
      .then(setContinueMovies)
      .catch(() => setContinueError(true))
      .finally(() => setContinueLoading(false));
  }, []);

  useEffect(() => {
    void fetchMovies({ view: "recent", limit: 12 })
      .then(setRecentMovies)
      .catch(() => setRecentError(true))
      .finally(() => setRecentLoading(false));
  }, []);

  useEffect(() => {
    void api<{ data: ShelfPublic[] }>("/shelves?scope=movies")
      .then(async (r) => {
        const top = r.data.slice(0, 6);
        const previews = await Promise.all(
          top.map(async (shelf) => {
            try {
              const detail = await api<{ data: ShelfDetail }>(
                `/shelves/${shelf.id}`,
              );
              const movies = detail.data.items
                .map((i) => i.work)
                .filter(
                  (w): w is MovieListItem =>
                    w != null && "directors" in w,
                );
              return {
                shelf,
                covers: movies.slice(0, 4).map((m) => m.coverFileId),
                itemCount: detail.data.items.length,
              };
            } catch {
              return { shelf, covers: [], itemCount: 0 };
            }
          }),
        );
        setShelfPreviews(previews);
      })
      .finally(() => setShelvesLoading(false));
  }, []);

  return (
    <div className={styles.homePage}>
      {continueLoading ? (
        <MovieGridSkeleton count={6} />
      ) : !continueError && continueMovies.length > 0 ? (
        <ShelfRow
          title={t("homeContinue")}
          seeAllHref="/movies/continue"
          seeAllLabel={t("seeAll")}
        >
          {continueMovies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </ShelfRow>
      ) : null}

      {recentLoading ? (
        <MovieGridSkeleton count={6} />
      ) : !recentError && recentMovies.length > 0 ? (
        <ShelfRow
          title={t("homeRecent")}
          seeAllHref="/movies/recent"
          seeAllLabel={t("seeAll")}
        >
          {recentMovies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </ShelfRow>
      ) : null}

      {!shelvesLoading && shelfPreviews.length > 0 && (
        <ShelfRow title={t("shelves", { ns: "shelves" })} seeAllHref="/shelves">
          {shelfPreviews.map((preview) => (
            <ShelfPreviewCard
              key={preview.shelf.id}
              shelf={preview.shelf}
              coverFileIds={preview.covers}
              itemCount={preview.itemCount}
            />
          ))}
        </ShelfRow>
      )}

      <section className={styles.homeOverview}>
        <p className={styles.homeOverviewText}>{t("homeOverview")}</p>
        <div className={styles.emptyInlineActions}>
          <Link to="/movies/browse">
            <Button type="button" variant="primary">
              {t("browseMovies")}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
