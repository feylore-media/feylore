import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import type { NotificationPublic } from "@shared/notifications";
import {
  formatBadgeCount,
  formatNotificationDateTime,
  formatRelativeTime,
  groupNotificationsByDay,
  notificationDayLabel,
  notificationTypeLabel,
} from "../src/web/components/account/notification-display";

function notification(
  overrides: Partial<NotificationPublic> = {},
): NotificationPublic {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type: "club.mention",
    title: "Someone mentioned you",
    body: null,
    href: "/clubs/1/topics/1",
    actorUserId: "00000000-0000-4000-8000-000000000002",
    actorDisplayName: "Ada",
    actorAvatarUrl: null,
    subjectType: "club_topic",
    subjectId: "00000000-0000-4000-8000-000000000003",
    aggregatedCount: 1,
    readAt: null,
    seenAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("formatBadgeCount", () => {
  it("renders nothing for zero unread", () => {
    expect(formatBadgeCount(0)).toBeNull();
    expect(formatBadgeCount(-1)).toBeNull();
  });

  it("shows exact counts below the cap", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(5)).toBe("5");
    expect(formatBadgeCount(9)).toBe("9");
  });

  it("caps at 9+ between ten and ninety-nine", () => {
    expect(formatBadgeCount(10)).toBe("9+");
    expect(formatBadgeCount(50)).toBe("9+");
    expect(formatBadgeCount(99)).toBe("9+");
  });

  it("caps at 99+ from one hundred", () => {
    expect(formatBadgeCount(100)).toBe("99+");
    expect(formatBadgeCount(1000)).toBe("99+");
  });
});

describe("notificationTypeLabel", () => {
  const t = ((key: string) =>
    ({
      "notifications:typeClubMention": "Mention",
      "notifications:typeSystem": "System",
    })[key] ??
    key) as unknown as TFunction<"notifications">;

  it("maps stable type keys to labels", () => {
    expect(notificationTypeLabel("club.mention", t)).toBe("Mention");
    expect(notificationTypeLabel("system.announcement", t)).toBe("System");
  });

  it("looks labels up under the notifications namespace", () => {
    const keys: string[] = [];
    const watcher = ((key: string) => {
      keys.push(key);
      return key;
    }) as unknown as TFunction<"notifications">;
    notificationTypeLabel("system.announcement", watcher);
    expect(keys).toEqual(["notifications:typeSystem"]);
  });
});

describe("formatRelativeTime", () => {
  it("describes recent items relative to now", () => {
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const label = formatRelativeTime(anHourAgo);
    expect(label).toMatch(/hour/i);
  });

  it("handles future timestamps", () => {
    const later = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(later)).toMatch(/minute/i);
  });
});

describe("notificationDayLabel and grouping", () => {
  it("produces a readable day label", () => {
    const iso = new Date("2026-09-18T12:00:00.000Z").toISOString();
    expect(notificationDayLabel(iso)).toMatch(/2026/);
  });

  it("groups items sharing a calendar day", () => {
    const first = notification({
      id: "id-1",
      createdAt: "2026-09-18T09:00:00.000Z",
    });
    const second = notification({
      id: "id-2",
      createdAt: "2026-09-18T15:00:00.000Z",
    });
    const otherDay = notification({
      id: "id-3",
      createdAt: "2026-09-15T09:00:00.000Z",
    });

    const groups = groupNotificationsByDay([first, second, otherDay]);
    expect(groups).toHaveLength(2);
    const [firstDay, firstGroup] = groups[0]!;
    expect(firstDay).toBe(notificationDayLabel(first.createdAt));
    expect(firstGroup.map((n) => n.id)).toEqual(["id-1", "id-2"]);
    expect(groups[1]![1].map((n) => n.id)).toEqual(["id-3"]);
  });

  it("returns empty groups for an empty list", () => {
    expect(groupNotificationsByDay([])).toEqual([]);
  });
});

describe("formatNotificationDateTime", () => {
  it("includes date and time", () => {
    const label = formatNotificationDateTime("2026-09-18T12:00:00.000Z");
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/:/);
  });
});