import {
  ADMIN_NAV_GROUPS,
  ADMIN_HIDDEN_SECTIONS,
  type AdminSection,
} from "./admin-sections.js";
import type { Permission } from "./permissions.js";

export type AdminSearchEntry = {
  id: string;
  label: string;
  path: string;
  permission: Permission | null;
  keywords: string[];
};

const FORMATTING_SEARCH_ENTRIES: AdminSearchEntry[] = [
  {
    id: "formatting-language",
    label: "Metadata → Language",
    path: "/admin/metadata/formatting",
    permission: "metadata.formatting.read",
    keywords: ["language", "locale", "normalization", "representation"],
  },
  {
    id: "formatting-genres",
    label: "Metadata → Genres",
    path: "/admin/metadata/formatting",
    permission: "metadata.formatting.read",
    keywords: ["genre", "aliases", "hierarchy", "vocabulary"],
  },
  {
    id: "formatting-tags",
    label: "Metadata → Tags",
    path: "/admin/metadata/formatting",
    permission: "metadata.formatting.read",
    keywords: ["tag", "aliases", "vocabulary"],
  },
];

const CONVERSION_SEARCH_ENTRIES: AdminSearchEntry[] = [
  {
    id: "conversion-epub",
    label: "Conversion → EPUB",
    path: "/admin/conversion",
    permission: "system.settings.read",
    keywords: ["epub", "book conversion"],
  },
];

function sectionToSearchEntry(
  section: AdminSection,
  groupLabel?: string,
): AdminSearchEntry {
  const label = groupLabel ? `${groupLabel} → ${section.navKey}` : section.navKey;
  return {
    id: section.id,
    label,
    path: section.path,
    permission: section.permission,
    keywords: section.searchKeywords ?? [],
  };
}

/** Static catalog for admin header search. Labels use navKey placeholders; UI resolves i18n. */
export function buildAdminSearchIndex(
  labelResolver: (navKey: string, groupLabelKey?: string) => string,
): AdminSearchEntry[] {
  const entries: AdminSearchEntry[] = [];

  for (const group of ADMIN_NAV_GROUPS) {
    const groupLabel = labelResolver("title", group.labelKey);
    for (const item of group.items) {
      entries.push({
        id: item.id,
        label: labelResolver(item.navKey, group.labelKey),
        path: item.path,
        permission: item.permission,
        keywords: item.searchKeywords ?? [],
      });
    }
  }

  for (const item of ADMIN_HIDDEN_SECTIONS) {
    entries.push(sectionToSearchEntry(item));
  }

  entries.push(...FORMATTING_SEARCH_ENTRIES, ...CONVERSION_SEARCH_ENTRIES);

  return entries;
}

export function filterAdminSearchIndex(
  entries: AdminSearchEntry[],
  userPermissions: readonly string[],
): AdminSearchEntry[] {
  return entries.filter((entry) => {
    if (entry.permission === null) return true;
    return userPermissions.includes(entry.permission);
  });
}

export function searchAdminDestinations(
  entries: AdminSearchEntry[],
  query: string,
  limit = 8,
): AdminSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored = entries
    .map((entry) => {
      const label = entry.label.toLowerCase();
      const keywordHit = entry.keywords.some(
        (kw) => kw.toLowerCase().includes(q) || q.includes(kw.toLowerCase()),
      );
      const labelHit = label.includes(q);
      const pathHit = entry.path.toLowerCase().includes(q);
      if (!labelHit && !keywordHit && !pathHit) return null;
      const score =
        (label.startsWith(q) ? 4 : 0) +
        (labelHit ? 2 : 0) +
        (keywordHit ? 1 : 0) +
        (pathHit ? 1 : 0);
      return { entry, score };
    })
    .filter((r): r is { entry: AdminSearchEntry; score: number } => r !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((r) => r.entry);
}
