import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api";
import type { AudiobooksQueryFilters } from "../../hooks/audiobooks/useAudiobooksQuery";
import { Button } from "../primitives";
import styles from "./audiobooks.module.css";

interface SeriesOption {
  id: string;
  name: string;
}

interface AudiobooksFilterBarProps {
  rawQ: string;
  filters: AudiobooksQueryFilters;
  onSearchChange: (q: string) => void;
  onFilterChange: (patch: Partial<AudiobooksQueryFilters>) => void;
  onClearFilters: () => void;
  layout: "grid" | "list";
  onLayoutChange: (layout: "grid" | "list") => void;
  lockView?: boolean;
}

export function AudiobooksFilterBar({
  rawQ,
  filters,
  onSearchChange,
  onFilterChange,
  onClearFilters,
  layout,
  onLayoutChange,
  lockView = false,
}: AudiobooksFilterBarProps) {
  const { t } = useTranslation("audiobooks");
  const [moreOpen, setMoreOpen] = useState(false);
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);

  useEffect(() => {
    if (moreOpen) {
      void api<{ data: SeriesOption[] }>("/audiobooks/series").then((r) =>
        setSeriesList(r.data),
      );
    }
  }, [moreOpen]);

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
            sort: e.target.value as AudiobooksQueryFilters["sort"],
          })
        }
        aria-label={t("sortLabel")}
      >
        <option value="title">{t("sortTitle")}</option>
        <option value="author">{t("sortAuthor")}</option>
        <option value="addedAt">{t("sortAdded")}</option>
        <option value="updatedAt">{t("sortUpdated")}</option>
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
      <Button
        type="button"
        onClick={() => onLayoutChange(layout === "grid" ? "list" : "grid")}
      >
        {layout === "grid" ? t("listView") : t("gridView")}
      </Button>
      <button
        type="button"
        className={styles.filterToggle}
        onClick={() => setMoreOpen((o) => !o)}
        aria-expanded={moreOpen}
      >
        {moreOpen ? t("fewerFilters") : t("moreFilters")}
      </button>
      {moreOpen && (
        <div className={styles.filterMore}>
          <input
            className={styles.filterInput}
            placeholder={t("filterAuthor")}
            value={filters.author ?? ""}
            onChange={(e) =>
              onFilterChange({ author: e.target.value || undefined })
            }
            aria-label={t("filterAuthor")}
          />
          <input
            className={styles.filterInput}
            placeholder={t("filterNarrator")}
            value={filters.narrator ?? ""}
            onChange={(e) =>
              onFilterChange({ narrator: e.target.value || undefined })
            }
            aria-label={t("filterNarrator")}
          />
          <select
            className={styles.filterInput}
            value={filters.series ?? ""}
            onChange={(e) =>
              onFilterChange({ series: e.target.value || undefined })
            }
            aria-label={t("filterSeries")}
          >
            <option value="">{t("filterSeriesAny")}</option>
            {seriesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            className={styles.filterInput}
            placeholder={t("filterGenre")}
            value={filters.genre ?? ""}
            onChange={(e) =>
              onFilterChange({ genre: e.target.value || undefined })
            }
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
                  view: e.target.value as AudiobooksQueryFilters["view"],
                })
              }
              aria-label={t("filterListeningState")}
            >
              <option value="all">{t("listeningStateAll")}</option>
              <option value="continue">{t("listeningStateInProgress")}</option>
            </select>
          )}
          <Button type="button" onClick={onClearFilters}>
            {t("clearFilters")}
          </Button>
        </div>
      )}
    </div>
  );
}
