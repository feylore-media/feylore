import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import {
  NOTIFICATION_CATEGORY_ORDER,
  NOTIFICATION_TYPE_LIST,
  type NotificationSettingsPublic,
} from "@shared/notifications";
import {
  groupNotificationTypesByCategory,
  hasNotificationSettingsChanges,
  notificationCategoryLabel,
  notificationSettingsChanges,
  notificationTypeName,
} from "../src/web/components/account/notification-display";

const t = ((key: string) =>
  ({
    "notifications:typeClubMentionName": "Mentions",
    "notifications:typeSystemName": "Announcements",
    "notifications:categorySystem": "System",
    "notifications:categoryClub": "Clubs",
    "notifications:categoryLibrary": "Library",
    "notifications:categorySocial": "Social",
  })[key] ?? key) as unknown as TFunction<"notifications">;

function settings(
  overrides: Partial<NotificationSettingsPublic> = {},
): NotificationSettingsPublic {
  return {
    preferences: [
      {
        type: "system.announcement",
        category: "system",
        enabled: true,
        emailEnabled: false,
      },
      {
        type: "club.mention",
        category: "club",
        enabled: true,
        emailEnabled: false,
      },
    ],
    paused: false,
    emailAvailable: true,
    ...overrides,
  };
}

describe("groupNotificationTypesByCategory", () => {
  it("orders groups by the category catalog, omitting empty categories", () => {
    const groups = groupNotificationTypesByCategory(NOTIFICATION_TYPE_LIST);
    const categories = groups.map(([category]) => category);
    expect(categories).toEqual(["system", "club", "social"]);
    const system = groups[0]![1].map((d) => d.key);
    expect(system).toContain("system.announcement");
    const social = groups[2]![1].map((d) => d.key);
    expect(social).toContain("achievement.earned");
  });

  it("keeps a stable catalog order for each category", () => {
    const groups = new Map(
      groupNotificationTypesByCategory(NOTIFICATION_TYPE_LIST),
    );
    expect(groups.get("club")!.map((d) => d.key)).toEqual(["club.mention"]);
  });

  it("defines display ordering for every category the registry may use", () => {
    expect(NOTIFICATION_CATEGORY_ORDER).toContain("system");
    expect(NOTIFICATION_CATEGORY_ORDER).toContain("club");
  });
});

describe("settings labels", () => {
  it("uses user-facing names, not registry keys", () => {
    expect(notificationTypeName("club.mention", t)).toBe("Mentions");
    expect(notificationTypeName("system.announcement", t)).toBe(
      "Announcements",
    );
  });

  it("labels categories", () => {
    expect(notificationCategoryLabel("club", t)).toBe("Clubs");
    expect(notificationCategoryLabel("system", t)).toBe("System");
  });

  it("looks names up under the notifications namespace", () => {
    const keys: string[] = [];
    const watcher = ((key: string) => {
      keys.push(key);
      return key;
    }) as unknown as TFunction<"notifications">;
    notificationTypeName("club.mention", watcher);
    notificationCategoryLabel("club", watcher);
    expect(keys).toEqual([
      "notifications:typeClubMentionName",
      "notifications:categoryClub",
    ]);
  });
});

describe("notificationSettingsChanges", () => {
  it("returns only changed preferences and the pause flag", () => {
    const loaded = settings();
    const draft = settings();
    draft.preferences[0]!.enabled = false;
    draft.paused = true;
    const changes = notificationSettingsChanges(loaded, draft);
    expect(changes.paused).toBe(true);
    expect(changes.preferences).toEqual([
      { type: "system.announcement", enabled: false },
    ]);
  });

  it("returns no update when nothing changed", () => {
    const loaded = settings();
    expect(notificationSettingsChanges(loaded, settings())).toEqual({});
    expect(hasNotificationSettingsChanges(loaded, settings())).toBe(false);
  });

  it("pauses as the only change", () => {
    const loaded = settings();
    const draft = settings({ paused: true });
    const changes = notificationSettingsChanges(loaded, draft);
    expect(changes.preferences).toBeUndefined();
    expect(changes.paused).toBe(true);
    expect(hasNotificationSettingsChanges(loaded, draft)).toBe(true);
  });

  it("emits only emailEnabled when only the email toggle changed", () => {
    const loaded = settings();
    const draft = settings();
    draft.preferences[0]!.emailEnabled = true;
    const changes = notificationSettingsChanges(loaded, draft);
    expect(changes.preferences).toEqual([
      { type: "system.announcement", emailEnabled: true },
    ]);
    expect(
      (changes.preferences![0] as { enabled?: boolean }).enabled,
    ).toBeUndefined();
    expect(hasNotificationSettingsChanges(loaded, draft)).toBe(true);
  });

  it("emits both fields when both channels change", () => {
    const loaded = settings();
    const draft = settings();
    draft.preferences[0]!.enabled = false;
    draft.preferences[0]!.emailEnabled = true;
    const changes = notificationSettingsChanges(loaded, draft);
    expect(changes.preferences).toEqual([
      { type: "system.announcement", enabled: false, emailEnabled: true },
    ]);
  });
});
