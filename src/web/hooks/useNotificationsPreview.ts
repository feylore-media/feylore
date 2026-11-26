import { useCallback, useEffect, useState } from "react";
import type { NotificationPublic } from "@shared/notifications";
import {
  fetchNotificationsList,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationSeen,
} from "../app/notifications-api";

export interface NotificationsPreviewState {
  notifications: NotificationPublic[];
  unreadCount: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  /** Refetch the preview list and unread count. */
  reload(): Promise<void>;
  /**
   * Mark a notification read (and seen) and update the local unread count.
   * Fire-and-forget: the header badge reflects the optimistic value.
   */
  markRead(notification: NotificationPublic): void;
  /** Mark every displayed notification seen (not read). Safe to call on open. */
  markSeenDisplayed(): void;
  /** Mark all notifications read. */
  markAllRead(): void;
}

const PREVIEW_LIMIT = 5;
const UNREAD_POLL_MS = 30_000;

/**
 * Drives the account-popover notification preview and the header unread badge.
 * The full /notifications page owns its own paginated list; this hook stays
 * scoped to the preview surface (latest items + badge count).
 */
export function useNotificationsPreview(): NotificationsPreviewState {
  const [notifications, setNotifications] = useState<NotificationPublic[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, count] = await Promise.all([
        fetchNotificationsList({ limit: PREVIEW_LIMIT }),
        fetchUnreadNotificationCount(),
      ]);
      setNotifications(list.data);
      setHasMore(list.page.nextCursor !== null);
      setUnreadCount(count.data.count);
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void reload();
    const timer = setInterval(() => {
      if (!active) return;
      fetchUnreadNotificationCount()
        .then((res) => {
          if (active) setUnreadCount(res.data.count);
        })
        .catch(() => {
          // Keep the last known badge value; polling retries shortly.
        });
    }, UNREAD_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [reload]);

  const markRead = useCallback((notification: NotificationPublic) => {
    if (notification.readAt !== null) return;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notification.id ? { ...n, readAt: now, seenAt: now } : n,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    void markNotificationRead(notification.id).catch(() => {
      setUnreadCount((prev) => prev + 1);
    });
  }, []);

  const markSeenDisplayed = useCallback(() => {
    const now = new Date().toISOString();
    setNotifications((prev) => {
      const unseen = prev.filter((n) => n.seenAt === null);
      if (unseen.length === 0) return prev;
      for (const n of unseen) {
        void markNotificationSeen(n.id).catch(() => {
          // Seen is a lightweight hint; failures never block the interaction.
        });
      }
      return prev.map((n) =>
        n.seenAt === null ? { ...n, seenAt: now } : n,
      );
    });
  }, []);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) =>
        n.readAt === null ? { ...n, readAt: now, seenAt: now } : n,
      ),
    );
    setUnreadCount(0);
    void markAllNotificationsRead().catch(() => {
      // Optimistic; the poll will restore the real count if this failed.
    });
  }, []);

  return {
    notifications,
    unreadCount,
    hasMore,
    loading,
    error,
    reload,
    markRead,
    markSeenDisplayed,
    markAllRead,
  };
}