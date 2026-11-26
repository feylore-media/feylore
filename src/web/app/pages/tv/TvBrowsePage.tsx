import { useTranslation } from "react-i18next";
import { useTvShows } from "../../../hooks/tv/useTvShows";
import { ShowCard } from "../../../components/tv/ShowCard";
import { ShowGrid, ShowGridSkeleton } from "../../../components/tv/ShowGrid";
import { Button } from "../../../components/primitives";
import styles from "../../../components/tv/tv.module.css";

interface TvBrowsePageProps {
  defaultView?: "all" | "continue" | "recent";
  defaultFavorite?: boolean;
  titleKey?: string;
  lockView?: boolean;
}

export function TvBrowsePage({
  defaultView = "all",
  defaultFavorite,
  titleKey,
  lockView = false,
}: TvBrowsePageProps) {
  const { t } = useTranslation("tv");

  const {
    shows,
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
  } = useTvShows({
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
    shows.length === 0 &&
    !hasActiveFilters &&
    defaultView === "all" &&
    !defaultFavorite;

  return (
    <div>
      <h1 className={styles.pageTitle}>{t(pageTitleKey)}</h1>

      <div className={styles.filterBar}>
        <input
          className={styles.filterInput}
          placeholder={t("searchPlaceholder")}
          value={rawQ}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label={t("searchPlaceholder")}
        />
        <select
          className={styles.filterInput}
          value={filters.sort ?? "title"}
          onChange={(e) =>
            setFilter({
              sort: e.target.value as typeof filters.sort,
            })
          }
          aria-label={t("sortLabel")}
        >
          <option value="title">{t("sortTitle")}</option>
          <option value="addedAt">{t("sortAdded")}</option>
          <option value="updatedAt">{t("sortUpdated")}</option>
          <option value="premiereDate">{t("sortPremiere")}</option>
        </select>
        <select
          className={styles.filterInput}
          value={filters.order ?? "asc"}
          onChange={(e) =>
            setFilter({
              order: e.target.value as "asc" | "desc",
            })
          }
          aria-label={t("orderLabel")}
        >
          <option value="asc">{t("orderAsc")}</option>
          <option value="desc">{t("orderDesc")}</option>
        </select>
        <input
          className={styles.filterInput}
          placeholder={t("filterGenre")}
          value={filters.genre ?? ""}
          onChange={(e) => setFilter({ genre: e.target.value || undefined })}
          aria-label={t("filterGenre")}
        />
        <label>
          <input
            type="checkbox"
            checked={filters.favorite === true}
            onChange={(e) =>
              setFilter({
                favorite: e.target.checked ? true : undefined,
              })
            }
          />{" "}
          {t("favoritesOnly")}
        </label>
        {!lockView && (
          <select
            className={styles.filterInput}
            value={filters.view ?? "all"}
            onChange={(e) =>
              setFilter({
                view: e.target.value as typeof filters.view,
              })
            }
            aria-label={t("watchStateAll")}
          >
            <option value="all">{t("watchStateAll")}</option>
            <option value="continue">{t("watchStateInProgress")}</option>
          </select>
        )}
        {hasActiveFilters && (
          <button
            type="button"
            className={styles.expandBtn}
            onClick={clearFilters}
          >
            {t("clearFilters")}
          </button>
        )}
      </div>

      {error && (
        <div className={styles.errorBanner} role="alert">
          <span>{t("loadError")}</span>
          <Button type="button" onClick={reload}>
            {t("retry")}
          </Button>
        </div>
      )}

      {loading ? (
        <ShowGridSkeleton />
      ) : shows.length === 0 ? (
        <div className={styles.emptyInline}>
          <h2 className={styles.emptyInlineTitle}>
            {showEmptyLibrary ? t("noShows") : t("noResults")}
          </h2>
          <p className={styles.emptyInlineDetail}>
            {showEmptyLibrary ? t("noShowsDetail") : t("noResultsDetail")}
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
        <ShowGrid>
          {shows.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </ShowGrid>
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
