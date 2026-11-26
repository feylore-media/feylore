import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV_GROUPS,
  filterAdminNavGroups,
  filterAdminSections,
  getFirstAdminPath,
} from "../src/shared/admin-sections";
import { PERMISSIONS } from "../src/shared/permissions";

describe("admin sections", () => {
  it("filters sidebar sections by permission", () => {
    const visible = filterAdminSections([PERMISSIONS.SYSTEM_SETTINGS_READ]);
    const ids = visible.map((section) => section.id);

    expect(ids).toContain("modules");
    expect(ids).toContain("status");
    expect(ids).toContain("dashboard");
    expect(ids).not.toContain("users");
    expect(ids).not.toContain("jobs");
  });

  it("resolves first admin path to the dashboard", () => {
    expect(getFirstAdminPath([PERMISSIONS.SYSTEM_SETTINGS_READ])).toBe("/admin");
    expect(getFirstAdminPath([PERMISSIONS.AUDIT_READ])).toBe("/admin");
    expect(getFirstAdminPath([])).toBe("/admin");
  });

  it("always includes status and dashboard in filtered navigation", () => {
    const visible = filterAdminSections([]);
    expect(visible.some((section) => section.id === "status")).toBe(true);
    expect(visible.some((section) => section.id === "dashboard")).toBe(true);
  });

  it("filters nav groups and omits empty groups", () => {
    const groups = filterAdminNavGroups([PERMISSIONS.USERS_READ]);
    const groupIds = groups.map((group) => group.id);
    const itemIds = groups.flatMap((group) =>
      group.items.map((item) => item.id),
    );

    expect(groupIds).toContain("access");
    expect(groupIds).not.toContain("library");
    expect(itemIds).toContain("users");
    expect(itemIds).not.toContain("permissions");
  });

  it("keeps permissions out of sidebar nav groups", () => {
    const sidebarIds = ADMIN_NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => item.id),
    );
    expect(sidebarIds).not.toContain("permissions");
  });
});
