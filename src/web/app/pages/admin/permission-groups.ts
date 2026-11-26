export interface PermissionItem {
  key: string;
  description: string | null;
}

export interface RoleWithPermissions {
  name: string;
  permissions: string[];
}

export const PERMISSION_GROUPS: {
  key: string;
  labelKey: string;
  prefix: string;
}[] = [
  { key: "system", labelKey: "permissionsGroupSystem", prefix: "system." },
  { key: "users", labelKey: "permissionsGroupUsers", prefix: "users." },
  { key: "roles", labelKey: "permissionsGroupRoles", prefix: "roles." },
  { key: "libraries", labelKey: "permissionsGroupLibraries", prefix: "libraries." },
  { key: "storage", labelKey: "permissionsGroupLibraries", prefix: "storage." },
  { key: "files", labelKey: "permissionsGroupFiles", prefix: "files." },
  { key: "jobs", labelKey: "permissionsGroupJobs", prefix: "jobs." },
  { key: "metadata", labelKey: "permissionsGroupMetadata", prefix: "metadata." },
  { key: "integrations", labelKey: "permissionsGroupMetadata", prefix: "integrations." },
  { key: "shelves", labelKey: "permissionsGroupShelves", prefix: "shelves." },
  { key: "shelf", labelKey: "permissionsGroupShelves", prefix: "shelf." },
  { key: "clubs", labelKey: "permissionsGroupClubs", prefix: "clubs." },
  { key: "club", labelKey: "permissionsGroupClubs", prefix: "club." },
  { key: "downloads", labelKey: "permissionsGroupDownloads", prefix: "downloads." },
  { key: "devices", labelKey: "permissionsGroupDownloads", prefix: "devices." },
  { key: "activity", labelKey: "permissionsGroupActivity", prefix: "activity." },
  { key: "audit", labelKey: "permissionsGroupSystem", prefix: "audit." },
  { key: "books", labelKey: "permissionsGroupMedia", prefix: "books." },
  { key: "audiobooks", labelKey: "permissionsGroupMedia", prefix: "audiobooks." },
  { key: "podcasts", labelKey: "permissionsGroupMedia", prefix: "podcasts." },
  { key: "music", labelKey: "permissionsGroupMedia", prefix: "music." },
  { key: "movies", labelKey: "permissionsGroupMedia", prefix: "movies." },
  { key: "tv", labelKey: "permissionsGroupMedia", prefix: "tv." },
  { key: "ingest", labelKey: "permissionsGroupIngest", prefix: "ingest." },
];

export function groupPermissions(permissions: PermissionItem[]) {
  const assigned = new Set<string>();
  const groups: { labelKey: string; items: PermissionItem[] }[] = [];

  for (const group of PERMISSION_GROUPS) {
    const items = permissions.filter(
      (p) => p.key.startsWith(group.prefix) && !assigned.has(p.key),
    );
    if (items.length === 0) continue;
    for (const item of items) assigned.add(item.key);
    const existing = groups.find((g) => g.labelKey === group.labelKey);
    if (existing) {
      existing.items.push(...items);
    } else {
      groups.push({ labelKey: group.labelKey, items });
    }
  }

  const remaining = permissions.filter((p) => !assigned.has(p.key));
  if (remaining.length > 0) {
    groups.push({ labelKey: "permissionsGroupSystem", items: remaining });
  }

  return groups;
}

export function computeEffectivePermissions(
  roleNames: string[],
  roles: RoleWithPermissions[],
): string[] {
  const keys = new Set<string>();
  for (const roleName of roleNames) {
    const role = roles.find((r) => r.name === roleName);
    if (role) {
      for (const key of role.permissions) keys.add(key);
    }
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}
