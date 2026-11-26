import { useTranslation } from "react-i18next";
import type { AlbumsQueryFilters } from "../../hooks/music/useAlbumsQuery";
import styles from "./music.module.css";

interface MusicFilterBarProps {
  rawQ: string;
  filters: AlbumsQueryFilters;
  onSearchChange: (q: string) => void;
  onFilterChange: (patch: Partial<AlbumsQueryFilters>) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export function MusicFilterBar({
  rawQ,
  filters,
  onSearchChange,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
}: MusicFilterBarProps) {
  const { t } = useTranslation("music");

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
            sort: e.target.value as AlbumsQueryFilters["sort"],
          })
        }
        aria-label={t("sortLabel")}
      >
        <option value="title">{t("sortTitle")}</option>
        <option value="artist">{t("sortArtist")}</option>
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
      {hasActiveFilters && (
        <button type="button" className={styles.playButton} onClick={onClearFilters}>
          {t("clearFilters")}
        </button>
      )}
    </div>
  );
}
