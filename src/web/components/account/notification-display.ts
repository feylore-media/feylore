import type { TFunction } from "i18next";
import {
  NOTIFICATION_CATEGORY_ORDER,
  NOTIFICATION_TYPE_CATALOG,
  type NotificationCategory,
  type NotificationPreferenceUpdate,
  type NotificationPublic,
  type NotificationSettingsPublic,
  type NotificationSettingsUpdate,
  type NotificationType,
  type NotificationTypeDefinition,
} from "@shared/notifications";

export function notificationTypeLabel(
  type: NotificationType,
  t: TFunction<"notifications">,
): string {
  switch (type) {
    case "club.mention":
      return t("notifications:typeClubMention");
    case "system.announcement":
      return t("notifications:typeSystem");
    default:
      return t("notifications:typeSystem");
  }
}

const CATEGORY_LABEL_KEYS: Record<NotificationCategory, string> = {
  system: "categorySystem",
  club: "categoryClub",
  library: "categoryLibrary",
  social: "categorySocial",
};

/**
 * Settings-list name for a notification type (e.g. "Mentions"). Keys are
 * namespaced explicitly: callers bind multiple namespaces (settings + ...),
 * and bare keys would only resolve against the first one and leak as raw
 * i18n keys.
 */
export function notificationTypeName(
  type: NotificationType,
  t: TFunction<"notifications">,
): string {
  return t(`notifications:${NOTIFICATION_TYPE_CATALOG[type].nameKey}`);
}

/** User-facing label for a notification category (e.g. "Clubs"). */
export function notificationCategoryLabel(
  category: NotificationCategory,
  t: TFunction<"notifications">,
): string {
  return t(`notifications:${CATEGORY_LABEL_KEYS[category]}`);
}

/**
 * Group type definitions by category in catalog display order. Categories
 * with no defined types are omitted, so the UI stays catalog-driven as the
 * registry grows.
 */
export function groupNotificationTypesByCategory(
  definitions: NotificationTypeDefinition[],
): Array<[NotificationCategory, NotificationTypeDefinition[]]> {
  const byCategory = new Map<NotificationCategory, NotificationTypeDefinition[]>();
  for (const def of definitions) {
    const group = byCategory.get(def.category) ?? [];
    group.push(def);
    byCategory.set(def.category, group);
  }
  const groups: Array<[NotificationCategory, NotificationTypeDefinition[]]> = [];
  for (const category of NOTIFICATION_CATEGORY_ORDER) {
    const group = byCategory.get(category);
    if (group) groups.push([category, group]);
  }
  return groups;
}

/**
 * Diff a loaded settings snapshot against the working draft, returning only
 * what actually changed so a Save can send a minimal PATCH. Fields are
 * compared per-channel: toggling only Email emits just `emailEnabled`.
 */
export function notificationSettingsChanges(
  loaded: NotificationSettingsPublic,
  draft: NotificationSettingsPublic,
): NotificationSettingsUpdate {
  const loadedByType = new Map(
    loaded.preferences.map((p) => [p.type, p]),
  );
  const preferences: NotificationPreferenceUpdate[] = [];
  for (const pref of draft.preferences) {
    const current = loadedByType.get(pref.type);
    if (!current) continue;
    const item: NotificationPreferenceUpdate = { type: pref.type };
    if (current.enabled !== pref.enabled) item.enabled = pref.enabled;
    if (current.emailEnabled !== pref.emailEnabled) {
      item.emailEnabled = pref.emailEnabled;
    }
    if (item.enabled !== undefined || item.emailEnabled !== undefined) {
      preferences.push(item);
    }
  }
  const update: NotificationSettingsUpdate = {};
  if (preferences.length > 0) update.preferences = preferences;
  if (draft.paused !== loaded.paused) update.paused = draft.paused;
  return update;
}

/** Whether the draft differs from last-saved settings. */
export function hasNotificationSettingsChanges(
  loaded: NotificationSettingsPublic,
  draft: NotificationSettingsPublic,
): boolean {
  const changes = notificationSettingsChanges(loaded, draft);
  return changes.preferences !== undefined || changes.paused !== undefined;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatRelativeTime(createdAt: string): string {
  const diffMs = new Date(createdAt).getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, "day");
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, "month");
  const diffYear = Math.round(diffMonth / 12);
  return rtf.format(diffYear, "year");
}

/**
 * Compact unread badge text. Exact counts up to 9, then capped at "9+"
 * until the count reaches 100, where it caps at "99+" so the badge never
 * grows unbounded. Returns null when there is nothing to badge.
 */
export function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  if (count < 100) return count < 10 ? String(count) : "9+";
  return "99+";
}

/** Full absolute date+time label (used for the `title`/`aria-label` on rows). */
export function formatNotificationDateTime(createdAt: string): string {
  return new Date(createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Calendar-day label used to group notification rows. */
export function notificationDayLabel(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Group notifications into [dayLabel, items] pairs, oldest label first. */
export function groupNotificationsByDay(
  items: NotificationPublic[],
): Array<[string, NotificationPublic[]]> {
  const byDay = new Map<string, NotificationPublic[]>();
  for (const item of items) {
    const day = notificationDayLabel(item.createdAt);
    const group = byDay.get(day) ?? [];
    group.push(item);
    byDay.set(day, group);
  }
  return [...byDay.entries()];
}