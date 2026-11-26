import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ActivityEventPublic } from "@shared/activity";
import { PERMISSIONS } from "@shared/permissions";
import {
  activityEventLabel,
  activityEventLink,
} from "../../components/home/activity-display";
import { api } from "../api";
import { usePermission } from "../auth-context";
import { Button } from "../../components/primitives";
import styles from "./pages.module.css";

function formatDay(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function ActivityPage() {
  const { t } = useTranslation("activity");
  const canViewIngestActivity = usePermission(PERMISSIONS.INGEST_READ);
  const [events, setEvents] = useState<ActivityEventPublic[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (append = false, pageCursor?: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (pageCursor) params.set("cursor", pageCursor);
        const res = await api<{
          data: ActivityEventPublic[];
          page: { nextCursor: string | null };
        }>(`/activity?${params.toString()}`);
        setEvents((prev) =>
          append ? [...prev, ...res.data] : res.data,
        );
        setNextCursor(res.page.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEventPublic[]>();
    for (const event of events) {
      const day = formatDay(event.createdAt);
      const list = map.get(day) ?? [];
      list.push(event);
      map.set(day, list);
    }
    return [...map.entries()];
  }, [events]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1>{t("title")}</h1>
        {canViewIngestActivity ? (
          <Link to="/activity/ingest">{t("ingestLink")}</Link>
        ) : null}
      </div>

      {grouped.length === 0 && !loading && (
        <p className={styles.lead}>{t("empty")}</p>
      )}

      {grouped.map(([day, dayEvents]) => (
        <section key={day} className={styles.activityDay}>
          <h2 className={styles.activityDayTitle}>{day}</h2>
          <ul className={styles.list}>
            {dayEvents.map((event) => {
              const href = activityEventLink(event);
              const label = activityEventLabel(event, t);
              return (
                <li key={event.id} className={styles.listItem}>
                  <time dateTime={event.createdAt}>
                    {new Date(event.createdAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  {" — "}
                  {href ? <Link to={href}>{label}</Link> : label}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {nextCursor && (
        <Button
          type="button"
          disabled={loading}
          onClick={() => {
            void load(true, nextCursor);
          }}
        >
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
