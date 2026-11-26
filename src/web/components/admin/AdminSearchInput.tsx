import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  buildAdminSearchIndex,
  filterAdminSearchIndex,
  searchAdminDestinations,
} from "@shared/admin-search";
import { ADMIN_NAV_GROUPS } from "@shared/admin-sections";
import { useAuth } from "../../app/auth-context";
import styles from "./admin-search.module.css";

export function AdminSearchInput() {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchIndex = useMemo(() => {
    const groupLabels = new Map(
      ADMIN_NAV_GROUPS.map((g) => [g.labelKey, t(g.labelKey)]),
    );
    return buildAdminSearchIndex((navKey, groupLabelKey) => {
      if (groupLabelKey) {
        const groupLabel = groupLabels.get(groupLabelKey) ?? groupLabelKey;
        return `${groupLabel} → ${t(navKey)}`;
      }
      return t(navKey);
    });
  }, [t]);

  const permittedIndex = useMemo(
    () => filterAdminSearchIndex(searchIndex, user?.permissions ?? []),
    [searchIndex, user?.permissions],
  );

  const results = useMemo(
    () => searchAdminDestinations(permittedIndex, query),
    [permittedIndex, query],
  );

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function navigateTo(path: string) {
    navigate(path);
    setQuery("");
    setOpen(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = results[highlightIndex] ?? results[0];
    if (target) navigateTo(target.path);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <form className={styles.form} onSubmit={onSubmit}>
        <input
          className={styles.input}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          aria-expanded={open && results.length > 0}
          aria-controls="admin-search-results"
          aria-autocomplete="list"
          role="combobox"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </form>
      {open && query.trim() && results.length > 0 && (
        <ul
          id="admin-search-results"
          className={styles.results}
          role="listbox"
        >
          {results.map((result, index) => (
            <li key={result.id} role="option" aria-selected={index === highlightIndex}>
              <button
                type="button"
                className={
                  index === highlightIndex
                    ? `${styles.resultButton} ${styles.resultHighlighted}`
                    : styles.resultButton
                }
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => navigateTo(result.path)}
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && results.length === 0 && (
        <div className={styles.noResults}>{t("searchNoResults")}</div>
      )}
    </div>
  );
}
