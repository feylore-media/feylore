import type {
  NotificationPublic,
  NotificationSettingsPublic,
  NotificationSettingsUpdate,
} from "@shared/notifications";
import { api } from "./api";

export interface NotificationsListResult {
  data: NotificationPublic[];
  page: { nextCursor: string | null };
}

/** Fetch the authenticated user's notifications, most recent first. */
export async function fetchNotificationsList(
  options: { limit?: number; cursor?: string; type?: string } = {},
): Promise<NotificationsListResult> {
  const params = new URLSearchParams();
  if (options.limit != null) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.type) params.set("type", options.type);
  const qs = params.toString();
  return api<NotificationsListResult>(
    qs ? `/notifications?${qs}` : `/notifications`,
  );
}

/** Fetch the unread notification count for the header badge. */
export async function fetchUnreadNotificationCount(): Promise<{
  data: { count: number };
}> {
  return api("/notifications/unread-count");
}

/** Mark a notification read (and seen). */
export async function markNotificationRead(id: string): Promise<void> {
  await api(`/notifications/${id}/read`, { method: "POST" });
}

/** Mark a notification seen without marking it read. */
export async function markNotificationSeen(id: string): Promise<void> {
  await api(`/notifications/${id}/seen`, { method: "POST" });
}

/** Mark all notifications read. Resolves to the number that were updated. */
export async function markAllNotificationsRead(): Promise<number> {
  const res = await api<{ data: { updated: number } }>(
    "/notifications/read-all",
    { method: "POST" },
  );
  return res.data.updated;
}

/** Read full notification settings (per-type toggles + pause state). */
export async function fetchNotificationSettings(): Promise<NotificationSettingsPublic> {
  const res = await api<{ data: NotificationSettingsPublic }>(
    "/settings/notifications",
  );
  return res.data;
}

/** Persist partial notification settings; returns the refreshed settings. */
export async function updateNotificationSettings(
  updates: NotificationSettingsUpdate,
): Promise<NotificationSettingsPublic> {
  const res = await api<{ data: NotificationSettingsPublic }>(
    "/settings/notifications",
    { method: "PATCH", body: JSON.stringify(updates) },
  );
  return res.data;
}