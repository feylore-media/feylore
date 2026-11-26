import { describe, expect, it } from "vitest";
import {
  buildAdminSearchIndex,
  filterAdminSearchIndex,
  searchAdminDestinations,
} from "../src/shared/admin-search";
import { PERMISSIONS } from "../src/shared/permissions";

const labelResolver = (navKey: string, groupLabelKey?: string) => {
  if (groupLabelKey) {
    return `${groupLabelKey} → ${navKey}`;
  }
  return navKey;
};

describe("admin search", () => {
  const index = buildAdminSearchIndex(labelResolver);

  it("filters search index by permission", () => {
    const filtered = filterAdminSearchIndex(index, [PERMISSIONS.STORAGE_READ]);
    const paths = filtered.map((entry) => entry.path);

    expect(paths).toContain("/admin/library/storage");
    expect(paths).not.toContain("/admin/access/users");
  });

  it("includes dashboard and status for users without gated permissions", () => {
    const filtered = filterAdminSearchIndex(index, []);
    const paths = filtered.map((entry) => entry.path);

    expect(paths).toContain("/admin");
    expect(paths).toContain("/admin/status");
  });

  it("matches nested metadata formatting destinations by keyword", () => {
    const filtered = filterAdminSearchIndex(index, [
      PERMISSIONS.METADATA_FORMATTING_READ,
    ]);
    const results = searchAdminDestinations(filtered, "genre");

    expect(results.some((entry) => entry.id === "formatting-genres")).toBe(true);

    const tagResults = searchAdminDestinations(filtered, "tag");
    expect(tagResults.some((entry) => entry.id === "formatting-tags")).toBe(true);
  });

  it("matches nav labels and keywords", () => {
    const filtered = filterAdminSearchIndex(index, [PERMISSIONS.JOBS_READ]);
    const results = searchAdminDestinations(filtered, "scan");

    expect(results.some((entry) => entry.id === "jobs")).toBe(true);
  });
});
