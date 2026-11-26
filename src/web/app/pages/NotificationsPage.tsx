import { useTranslation } from "react-i18next";
import { useNotificationsList } from "../../hooks/useNotificationsList";
import { NotificationItem } from "../../components/account/NotificationItem";
import { groupNotificationsByDay } from "../../components/account/notification-display";
import { Button } from "../../components/primitives";
import { EmptyState, LoadingState, ErrorState } from "../../components/states";
import styles from "./notifications.module.css";

export function NotificationsPage() {
  const { t } = useTranslation(["notifications", "common"]);
  const {
    items,
    nextCursor,
    loading,
    loadingMore,
    error,
    hasUnread,
    reload,
    loadMore,
    markRead,
    markAllRead,
  } = useNotificationsList();

  const empty = items.length === 0 && !loading && !error;
  const groups = groupNotificationsByDay(items);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.lead}>{t("pageSubtitle")}</p>
        </div>
        <Button
          type="button"
          variant="primary"
          disabled={!hasUnread}
          onClick={() => markAllRead()}
        >
          {t("markAllRead")}
        </Button>
      </div>

      {loading && <LoadingState />}

      {error && !loading && (
        <ErrorState
          message={t("common:error")}
          onRetry={() => void reload()}
        />
      )}

      {empty && (
        <EmptyState
          titleKey="emptyTitle"
          detailKey="emptyDetail"
          ns="notifications"
        />
      )}

      {!loading && !error && items.length > 0 && (
        <>
          {groups.map(([day, dayItems]) => (
            <section key={day} className={styles.day} aria-label={day}>
              <h2 className={styles.dayTitle}>{day}</h2>
              <ul className={styles.list}>
                {dayItems.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    variant="full"
                    onActivate={(n) => markRead(n.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {nextCursor && (
            <div className={styles.loadMore}>
              <Button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {t("loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}