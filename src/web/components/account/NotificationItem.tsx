import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { NotificationPublic } from "@shared/notifications";
import { UserAvatar } from "../users";
import { Icon } from "../icons/Icon";
import { UiClubsIcon, UiInfoIcon } from "../icons/ui-icons";
import {
  formatNotificationDateTime,
  formatRelativeTime,
  notificationTypeLabel,
} from "./notification-display";
import styles from "./NotificationItem.module.css";

interface NotificationItemProps {
  notification: NotificationPublic;
  variant?: "compact" | "full";
  /**
   * Runs when the user activates the row (click / keyboard). The row links
   * when `href` is present; this callback is where read state is recorded,
   * so both surfaces keep the same behavior.
   */
  onActivate?: (notification: NotificationPublic) => void;
}

function NotificationTypeTile({
  notification,
}: {
  notification: NotificationPublic;
}) {
  if (notification.actorUserId && notification.actorAvatarUrl) {
    return (
      <UserAvatar
        displayName={notification.actorDisplayName}
        avatarUrl={notification.actorAvatarUrl}
        size="sm"
      />
    );
  }
  const icon =
    notification.type === "club.mention" ? UiClubsIcon : UiInfoIcon;
  return (
    <span className={styles.typeTile} aria-hidden>
      <Icon icon={icon} size="sm" />
    </span>
  );
}

export function NotificationItem({
  notification,
  variant = "compact",
  onActivate,
}: NotificationItemProps) {
  const { t } = useTranslation("notifications");
  const isUnread = notification.readAt === null;
  const typeLabel = notificationTypeLabel(notification.type, t);
  const timeLabel = formatRelativeTime(notification.createdAt);
  const fullTime = formatNotificationDateTime(notification.createdAt);
  const extra =
    notification.aggregatedCount > 1
      ? `+${notification.aggregatedCount - 1}`
      : null;

  const rowClass = `${styles.row} ${variant === "full" ? styles.rowFull : ""} ${
    isUnread ? styles.rowUnread : ""
  }`;
  const activate = () => onActivate?.(notification);

  const content = (
    <>
      <NotificationTypeTile notification={notification} />
      <span className={styles.body}>
        <span className={styles.meta}>
          <span className={styles.typeLabel}>{typeLabel}</span>
          <span className={styles.time}>{timeLabel}</span>
          {extra && (
            <span className={styles.extra} aria-hidden>
              {extra}
            </span>
          )}
          {extra && (
            <span className={styles.visuallyHidden}>
              {t("aggregatedCount", {
                count: notification.aggregatedCount,
              })}
            </span>
          )}
        </span>
        <span
          className={`${styles.title} ${isUnread ? styles.titleUnread : ""}`}
        >
          {notification.title}
        </span>
        {notification.body && (
          <span className={styles.bodyText}>{notification.body}</span>
        )}
      </span>
    </>
  );

  return (
    <li className={styles.item}>
      {notification.href ? (
        <Link
          to={notification.href}
          className={rowClass}
          onClick={activate}
          aria-label={`${notification.title} (${fullTime})`}
          title={fullTime}
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          className={`${rowClass} ${styles.rowButton}`}
          onClick={activate}
          aria-label={`${notification.title} (${fullTime})`}
          title={fullTime}
        >
          {content}
        </button>
      )}
    </li>
  );
}