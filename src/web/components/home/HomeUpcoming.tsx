import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { UpcomingEvent } from "@shared/upcoming";
import { api } from "../../app/api";
import { useTranslation } from "react-i18next";
import styles from "./home.module.css";

export function HomeUpcoming() {
  const { t } = useTranslation("home");
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  useEffect(() => {
    let active = true;
    void api<{ data: UpcomingEvent[] }>("/upcoming")
      .then((response) => {
        if (active) setEvents(response.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!events.length) return null;
  return (
    <section className={styles.shelfRow} aria-label={t("upcoming")}>
      <div className={styles.shelfRowHeader}>
        <h2 className={styles.shelfRowTitle}>{t("upcoming")}</h2>
      </div>
      <ul className={styles.activityPreview}>
        {events.map((event) => (
          <li key={event.id} className={styles.activityItem}>
            {event.startsAt ? (
              <>
                <time dateTime={event.startsAt}>
                  {new Date(event.startsAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
                {" · "}
              </>
            ) : null}
            <Link to={event.href}>{event.label}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
