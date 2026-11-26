import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { Button } from "../../components/primitives";
import styles from "./pages.module.css";

interface SearchResultRow {
  type: string;
  id: string;
  title: string;
  snippet?: string;
  slug?: string;
  href?: string;
}

export function SearchPage() {
  const { t } = useTranslation("search");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [query, setQuery] = useState(q);
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(
    async (term: string, cursor?: string | null, append = false) => {
      if (!term.trim()) {
        setResults([]);
        setNextCursor(null);
        return;
      }
      setLoading(true);
      try {
        const searchParams = new URLSearchParams({ q: term.trim() });
        if (cursor) searchParams.set("cursor", cursor);
        const res = await api<{
          data: SearchResultRow[];
          page: { nextCursor: string | null };
        }>(`/search?${searchParams.toString()}`);
        setResults((prev) => (append ? [...prev, ...res.data] : res.data));
        setNextCursor(res.page.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setQuery(q);
    void runSearch(q);
  }, [q, runSearch]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    setParams(trimmed ? { q: trimmed } : {});
  }

  return (
    <div>
      <h1>{t("title")}</h1>
      <form className={styles.searchForm} onSubmit={submit}>
        <input
          className={styles.searchInputWide}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("title")}
        />
        <Button type="submit" variant="primary" disabled={loading}>
          {t("title")}
        </Button>
      </form>

      {!q.trim() && <p className={styles.lead}>{t("emptyQuery")}</p>}

      {q.trim() && !loading && results.length === 0 && (
        <p className={styles.lead}>{t("noResults", { query: q })}</p>
      )}

      {results.length > 0 && (
        <ul className={styles.list}>
          {results.map((row) => (
            <li key={`${row.type}-${row.id}`} className={styles.listItem}>
              <span className={styles.searchType}>
                {t(`type_${row.type}`, { defaultValue: row.type })}
              </span>
              {" — "}
              {row.href ? (
                <Link to={row.href}>{row.title}</Link>
              ) : (
                row.title
              )}
              {row.snippet && (
                <p className={styles.searchSnippet}>{row.snippet}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <Button
          type="button"
          disabled={loading}
          onClick={() => void runSearch(q, nextCursor, true)}
        >
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
