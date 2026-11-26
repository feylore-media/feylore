import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useAudiobooksQuery } from "../../../hooks/audiobooks/useAudiobooksQuery";
import { AudiobookCard } from "../../../components/audiobooks/AudiobookCard";
import { AudiobookListRow } from "../../../components/audiobooks/AudiobookListRow";
import {
  AudiobookGrid,
  AudiobookGridSkeleton,
} from "../../../components/audiobooks/AudiobookGrid";
import { AudiobooksFilterBar } from "../../../components/audiobooks/AudiobooksFilterBar";
import { Button } from "../../../components/primitives";
import styles from "../../../components/audiobooks/audiobooks.module.css";

interface AudiobooksBrowsePageProps {
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

export function AudiobooksBrowsePage({
  defaultView = "all",
  defaultFavorite,
  titleKey,
  lockView = false,
}: AudiobooksBrowsePageProps) {
  const { t } = useTranslation("audiobooks");
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  const {
    audiobooks,
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
  } = useAudiobooksQuery({
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

  const showEmptyLibrary =
    !loading &&
    audiobooks.length === 0 &&
    !hasActiveFilters &&
    defaultView === "all" &&
    !defaultFavorite;

  return (
    <div>
      <h1 className={styles.pageTitle}>
        {t(TITLE_KEYS[pageTitleKey as keyof typeof TITLE_KEYS] ?? pageTitleKey)}
      </h1>

      <AudiobooksFilterBar
        rawQ={rawQ}
        filters={filters}
        onSearchChange={setSearchInput}
        onFilterChange={setFilter}
        onClearFilters={clearFilters}
        layout={layout}
        onLayoutChange={setLayout}
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
        <AudiobookGridSkeleton />
      ) : audiobooks.length === 0 ? (
        <div className={styles.emptyInline}>
          <h2 className={styles.emptyInlineTitle}>
            {showEmptyLibrary ? t("noAudiobooks") : t("noResults")}
          </h2>
          <p className={styles.emptyInlineDetail}>
            {showEmptyLibrary
              ? t("noAudiobooksDetail")
              : t("noResultsDetail")}
          </p>
          <div className={styles.emptyInlineActions}>
            {hasActiveFilters && (
              <Button type="button" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            )}
            {showEmptyLibrary && (
              <Link to="/audiobooks/new">
                <Button type="button" variant="primary">
                  {t("newAudiobook")}
                </Button>
              </Link>
            )}
          </div>
        </div>
      ) : layout === "grid" ? (
        <AudiobookGrid>
          {audiobooks.map((audiobook) => (
            <AudiobookCard key={audiobook.id} audiobook={audiobook} />
          ))}
        </AudiobookGrid>
      ) : (
        <div className={styles.list}>
          {audiobooks.map((audiobook) => (
            <AudiobookListRow key={audiobook.id} audiobook={audiobook} />
          ))}
        </div>
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
