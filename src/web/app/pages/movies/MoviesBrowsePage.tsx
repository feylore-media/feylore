import { useTranslation } from "react-i18next";
import { useMoviesQuery } from "../../../hooks/movies/useMoviesQuery";
import { MovieCard } from "../../../components/movies/MovieCard";
import { MovieGrid, MovieGridSkeleton } from "../../../components/movies/MovieGrid";
import { MoviesFilterBar } from "../../../components/movies/MoviesFilterBar";
import { Button } from "../../../components/primitives";
import styles from "../../../components/movies/movies.module.css";

interface MoviesBrowsePageProps {
  defaultView?: "all" | "continue" | "recent";
  defaultFavorite?: boolean;
  titleKey?: string;
  lockView?: boolean;
}

export function MoviesBrowsePage({
  defaultView = "all",
  defaultFavorite,
  titleKey,
  lockView = false,
}: MoviesBrowsePageProps) {
  const { t } = useTranslation("movies");

  const {
    movies,
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
  } = useMoviesQuery({
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
          : "browse");

  const showEmptyLibrary =
    !loading &&
    movies.length === 0 &&
    !hasActiveFilters &&
    defaultView === "all" &&
    !defaultFavorite;

  return (
    <div>
      <h1 className={styles.pageTitle}>{t(pageTitleKey)}</h1>

      <MoviesFilterBar
        rawQ={rawQ}
        filters={filters}
        onSearchChange={setSearchInput}
        onFilterChange={setFilter}
        onClearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
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
        <MovieGridSkeleton />
      ) : movies.length === 0 ? (
        <div className={styles.emptyInline}>
          <h2 className={styles.emptyInlineTitle}>
            {showEmptyLibrary ? t("noMovies") : t("noResults")}
          </h2>
          <p className={styles.emptyInlineDetail}>
            {showEmptyLibrary ? t("noMoviesDetail") : t("noResultsDetail")}
          </p>
          {hasActiveFilters && (
            <div className={styles.emptyInlineActions}>
              <Button type="button" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <MovieGrid>
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </MovieGrid>
      )}

      {nextCursor !== null && (
        <div className={styles.loadMore}>
          <Button type="button" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? t("loadingMore") : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
