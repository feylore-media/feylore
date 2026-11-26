import { useTranslation } from "react-i18next";
import type { MoviesQueryFilters } from "../../hooks/movies/useMoviesQuery";
import styles from "./movies.module.css";

interface MoviesFilterBarProps {
  rawQ: string;
  filters: MoviesQueryFilters;
  onSearchChange: (q: string) => void;
  onFilterChange: (patch: Partial<MoviesQueryFilters>) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  lockView?: boolean;
}

export function MoviesFilterBar({
  rawQ,
  filters,
  onSearchChange,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
  lockView = false,
}: MoviesFilterBarProps) {
  const { t } = useTranslation("movies");

  return (
    <div className={styles.filterBar}>
      <input
        className={styles.filterInput}
        placeholder={t("searchPlaceholder")}
        value={rawQ}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label={t("searchPlaceholder")}
      />
      <select
        className={styles.filterInput}
        value={filters.sort ?? "title"}
        onChange={(e) =>
          onFilterChange({
            sort: e.target.value as MoviesQueryFilters["sort"],
          })
        }
        aria-label={t("sortLabel")}
      >
        <option value="title">{t("sortTitle")}</option>
        <option value="addedAt">{t("sortAdded")}</option>
        <option value="updatedAt">{t("sortUpdated")}</option>
        <option value="releaseDate">{t("sortRelease")}</option>
      </select>
      <select
        className={styles.filterInput}
        value={filters.order ?? "asc"}
        onChange={(e) =>
          onFilterChange({
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
        placeholder={t("filterDirector")}
        value={filters.director ?? ""}
        onChange={(e) =>
          onFilterChange({ director: e.target.value || undefined })
        }
        aria-label={t("filterDirector")}
      />
      <input
        className={styles.filterInput}
        placeholder={t("filterGenre")}
        value={filters.genre ?? ""}
        onChange={(e) => onFilterChange({ genre: e.target.value || undefined })}
        aria-label={t("filterGenre")}
      />
      <label>
        <input
          type="checkbox"
          checked={filters.favorite === true}
          onChange={(e) =>
            onFilterChange({
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
            onFilterChange({
              view: e.target.value as MoviesQueryFilters["view"],
            })
          }
          aria-label={t("watchStateAll")}
        >
          <option value="all">{t("watchStateAll")}</option>
          <option value="continue">{t("watchStateInProgress")}</option>
        </select>
      )}
      {hasActiveFilters && (
        <button type="button" className={styles.expandBtn} onClick={onClearFilters}>
          {t("clearFilters")}
        </button>
      )}
    </div>
  );
}
