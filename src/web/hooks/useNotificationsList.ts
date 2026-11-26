import { useCallback, useEffect, useState } from "react";
import type { NotificationPublic } from "@shared/notifications";
import {
  fetchNotificationsList,
  markAllNotificationsRead,
  markNotificationRead,
} from "../app/notifications-api";

export interface NotificationsListState {
  items: NotificationPublic[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasUnread: boolean;
  reload(): Promise<void>;
  loadMore(): Promise<void>;
  /** Optimistically mark one notification read and persist it. */
  markRead(id: string): void;
  /** Mark every unread notification read. */
  markAllRead(): number;
}

const PAGE_SIZE = 20;

/** Paginated notification list backing the full /notifications page. */
export function useNotificationsList(): NotificationsListState {
  const [items, setItems] = useState<NotificationPublic[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNotificationsList({ limit: PAGE_SIZE });
      setItems(res.data);
      setNextCursor(res.page.nextCursor);
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetchNotificationsList({
        limit: PAGE_SIZE,
        cursor: nextCursor,
      });
      setItems((prev) => [...prev, ...res.data]);
      setNextCursor(res.page.nextCursor);
    } catch {
      setError("Request failed");
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  const markRead = useCallback((id: string) => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: now, seenAt: now } : n,
      ),
    );
    void markNotificationRead(id).catch(() => {
      // Optimistic; a reload on next visit reconciles the real state.
    });
  }, []);

  const markAllRead = useCallback((): number => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) =>
        n.readAt === null ? { ...n, readAt: now, seenAt: now } : n,
      ),
    );
    void markAllNotificationsRead().catch(() => {
      // Optimistic; the header badge poll reconciles the real count.
    });
    return 0;
  }, []);

  return {
    items,
    nextCursor,
    loading,
    loadingMore,
    error,
    hasUnread: items.some((n) => n.readAt === null),
    reload,
    loadMore,
    markRead,
    markAllRead,
  };
}