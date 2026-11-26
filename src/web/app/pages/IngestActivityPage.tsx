import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { IngestItemSummary } from "@shared/ingest";
import { api } from "../api";
import { Button } from "../../components/primitives";
import styles from "../../components/ingest/ingest.module.css";

type Tab = "processing" | "completed" | "failed" | "needs_attention" | "duplicate" | "unsupported";

export function IngestActivityPage() {
  const { t } = useTranslation("ingest");
  const [tab, setTab] = useState<Tab>("processing");
  const [items, setItems] = useState<IngestItemSummary[]>([]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (tab === "processing") {
      params.set("processing", "true");
    } else if (tab === "completed") {
      params.set("status", "completed");
    } else {
      params.set("terminalState", tab);
    }
    const res = await api<{ data: IngestItemSummary[] }>(
      `/ingest/items?${params.toString()}`,
    );
    setItems(res.data);
  }, [tab]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [load]);

  const tabs: Tab[] = [
    "processing",
    "completed",
    "failed",
    "needs_attention",
    "duplicate",
    "unsupported",
  ];

  return (
    <div>
      <h1>{t("activityTitle")}</h1>
      <p className={styles.hint}>{t("activityDescription")}</p>

      <div className={styles.tabs} role="tablist">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? styles.tabActive : styles.tab}
            onClick={() => setTab(key)}
          >
            {t(`tab_${key}`)}
          </button>
        ))}
      </div>

      <ul className={styles.activityList}>
        {items.map((item) => (
          <li key={item.id} className={styles.activityItem}>
            <div className={styles.activityItemHeader}>
              <span className={styles.activityFilename}>
                {item.originalFilename}
              </span>
              <span className={styles.activityMeta}>
                {item.terminalState ?? item.status}
              </span>
            </div>
            <p className={styles.activityMeta}>
              {item.detectedDomain ?? t("detecting")}
              {item.error ? ` — ${item.error}` : ""}
            </p>
            {!item.terminalState && (
              <div className={styles.progressBar} aria-hidden>
                <div
                  className={styles.progressFill}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            )}
            {(item.terminalState === "failed" ||
              item.terminalState === "needs_attention") && (
              <Button
                type="button"
                onClick={() =>
                  void api(`/ingest/items/${item.id}/retry`, { method: "POST" }).then(
                    () => load(),
                  )
                }
              >
                {t("retry")}
              </Button>
            )}
            {item.workType === "book" && item.workId && item.terminalState === null && item.status === "completed" && (
              <Link to={`/books/${item.workId}`}>{t("viewBook")}</Link>
            )}
          </li>
        ))}
      </ul>

      {items.length === 0 && <p className={styles.hint}>{t("noItems")}</p>}
    </div>
  );
}
