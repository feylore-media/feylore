import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { NotificationPublic } from "@shared/notifications";
import { NotificationItem } from "./NotificationItem";
import styles from "./AccountNotificationPreview.module.css";

interface AccountNotificationPreviewProps {
  notifications: NotificationPublic[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onActivate?: (notification: NotificationPublic) => void;
}

export function AccountNotificationPreview({
  notifications,
  hasMore,
  loading,
  error,
  onRetry,
  onActivate,
}: AccountNotificationPreviewProps) {
  const { t } = useTranslation(["notifications", "common"]);

  let content;
  if (loading) {
    content = <p className={styles.empty}>{t("common:loading")}</p>;
  } else if (error) {
    content = (
      <div className={styles.empty} role="alert">
        <p className={styles.errorText}>{t("common:error")}</p>
        {onRetry && (
          <button type="button" className={styles.retry} onClick={onRetry}>
            {t("common:retry")}
          </button>
        )}
      </div>
    );
  } else if (notifications.length === 0) {
    content = <p className={styles.empty}>{t("empty")}</p>;
  } else {
    content = (
      <ul className={styles.list}>
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onActivate={onActivate}
          />
        ))}
      </ul>
    );
  }

  return (
    <section className={styles.section} aria-label={t("title")}>
      <h3 className={styles.heading}>{t("title")}</h3>
      {content}
      {!loading && !error && hasMore && (
        <Link to="/notifications" className={styles.viewAll}>
          {t("viewAll")}
        </Link>
      )}
    </section>
  );
}