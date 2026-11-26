import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ActivityEventPublic } from "@shared/activity";
import { activityEventLabel, activityEventLink } from "./activity-display";
import styles from "./home.module.css";

interface HomeActivityPreviewProps {
  events: ActivityEventPublic[];
}

export function HomeActivityPreview({ events }: HomeActivityPreviewProps) {
  const { t } = useTranslation("activity");
  const { t: tHome } = useTranslation("home");

  if (events.length === 0) return null;

  return (
    <section className={styles.shelfRow} aria-label={tHome("recentActivity")}>
      <div className={styles.shelfRowHeader}>
        <h2 className={styles.shelfRowTitle}>{tHome("recentActivity")}</h2>
        <Link to="/activity" className={styles.shelfRowSeeAll}>
          {tHome("seeAll")}
        </Link>
      </div>
      <ul className={styles.activityPreview}>
        {events.map((event) => {
          const href = activityEventLink(event);
          const label = activityEventLabel(event, t);
          return (
            <li key={event.id} className={styles.activityItem}>
              <time dateTime={event.createdAt}>
                {new Date(event.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </time>
              {" — "}
              {href ? <Link to={href}>{label}</Link> : label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
