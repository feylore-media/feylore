import { useTranslation } from "react-i18next";
import { useAlbumsQuery } from "../../../hooks/music/useAlbumsQuery";
import { AlbumCard } from "../../../components/music/AlbumCard";
import { AlbumGrid, AlbumGridSkeleton } from "../../../components/music/AlbumGrid";
import { MusicFilterBar } from "../../../components/music/MusicFilterBar";
import { Button } from "../../../components/primitives";
import styles from "../../../components/music/music.module.css";

interface MusicBrowsePageProps {
  defaultView?: "all" | "recent";
  defaultFavorite?: boolean;
  titleKey?: string;
}

export function MusicBrowsePage({
  defaultView = "all",
  defaultFavorite,
  titleKey,
}: MusicBrowsePageProps) {
  const { t } = useTranslation("music");

  const {
    albums,
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
  } = useAlbumsQuery({
    defaultView,
    defaultFavorite,
    debounceSearch: true,
  });

  const pageTitleKey =
    titleKey ??
    (defaultFavorite
      ? "favorites"
      : defaultView === "recent"
        ? "recent"
        : "albums");

  const showEmptyLibrary =
    !loading &&
    albums.length === 0 &&
    !hasActiveFilters &&
    defaultView === "all" &&
    !defaultFavorite;

  return (
    <div>
      <h1 className={styles.pageTitle}>{t(pageTitleKey)}</h1>

      <MusicFilterBar
        rawQ={rawQ}
        filters={filters}
        onSearchChange={setSearchInput}
        onFilterChange={setFilter}
        onClearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
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
        <AlbumGridSkeleton />
      ) : albums.length === 0 ? (
        <div className={styles.emptyInline}>
          <h2 className={styles.emptyInlineTitle}>
            {showEmptyLibrary ? t("noAlbums") : t("noResults")}
          </h2>
          <p className={styles.emptyInlineDetail}>
            {showEmptyLibrary ? t("noAlbumsDetail") : t("noResultsDetail")}
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
        <AlbumGrid>
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </AlbumGrid>
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
