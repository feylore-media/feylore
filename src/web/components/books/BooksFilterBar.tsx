import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api";
import type { BooksQueryFilters } from "../../hooks/books/useBooksQuery";
import { Button } from "../primitives";
import styles from "./books.module.css";

interface SeriesOption {
  id: string;
  name: string;
}

interface BooksFilterBarProps {
  rawQ: string;
  filters: BooksQueryFilters;
  onSearchChange: (q: string) => void;
  onFilterChange: (patch: Partial<BooksQueryFilters>) => void;
  onClearFilters: () => void;
  layout: "grid" | "list";
  onLayoutChange: (layout: "grid" | "list") => void;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  lockView?: boolean;
}

export function BooksFilterBar({
  rawQ,
  filters,
  onSearchChange,
  onFilterChange,
  onClearFilters,
  layout,
  onLayoutChange,
  selectionMode,
  onToggleSelectionMode,
  lockView = false,
}: BooksFilterBarProps) {
  const { t } = useTranslation("books");
  const [moreOpen, setMoreOpen] = useState(false);
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);

  useEffect(() => {
    if (moreOpen) {
      void api<{ data: SeriesOption[] }>("/books/series").then((r) =>
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
      <div className={styles.filterSortGroup}>
      <select
        className={styles.filterInput}
        value={filters.sort ?? "title"}
        onChange={(e) =>
          onFilterChange({ sort: e.target.value as BooksQueryFilters["sort"] })
        }
        aria-label={t("sortLabel")}
      >
        <option value="title">{t("sortTitle")}</option>
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
      </div>
      <Button
        type="button"
        onClick={() => onLayoutChange(layout === "grid" ? "list" : "grid")}
      >
        {layout === "grid" ? t("listView") : t("gridView")}
      </Button>
      <Button type="button" onClick={onToggleSelectionMode}>
        {selectionMode ? t("cancelSelection") : t("selectMode")}
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
                  view: e.target.value as BooksQueryFilters["view"],
                })
              }
              aria-label={t("filterReadingState")}
            >
              <option value="all">{t("readingStateAll")}</option>
              <option value="continue">{t("readingStateInProgress")}</option>
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
