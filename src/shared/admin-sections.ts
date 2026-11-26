import { PERMISSIONS, type Permission } from "./permissions.js";

export type AdminNavIconName =
  | "dashboard"
  | "status"
  | "modules"
  | "storage"
  | "processing"
  | "jobs"
  | "metadataProviders"
  | "metadataAggregation"
  | "metadataFormatting"
  | "conversion"
  | "users"
  | "roles"
  | "integrations"
  | "appearance"
  | "configuration"
  | "ratings"
  | "audit";

export type AdminSection = {
  id: string;
  path: string;
  navKey: string;
  icon: AdminNavIconName;
  permission: Permission | null;
  searchKeywords?: string[];
};

export type AdminNavGroup = {
  id: string;
  labelKey: string;
  items: AdminSection[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "overview",
    labelKey: "navGroups.overview",
    items: [
      {
        id: "dashboard",
        path: "/admin",
        navKey: "dashboard",
        icon: "dashboard",
        permission: null,
        searchKeywords: ["overview", "home"],
      },
      {
        id: "status",
        path: "/admin/status",
        navKey: "status",
        icon: "status",
        permission: null,
        searchKeywords: ["health", "system"],
      },
    ],
  },
  {
    id: "library",
    labelKey: "navGroups.library",
    items: [
      {
        id: "modules",
        path: "/admin/library/modules",
        navKey: "modules",
        icon: "modules",
        permission: PERMISSIONS.SYSTEM_SETTINGS_READ,
        searchKeywords: ["media modules", "enable"],
      },
      {
        id: "storage",
        path: "/admin/library/storage",
        navKey: "storage",
        icon: "storage",
        permission: PERMISSIONS.STORAGE_READ,
        searchKeywords: [
          "mounted storage",
          "ingest sources",
          "docker",
          "locations",
        ],
      },
    ],
  },
  {
    id: "operations",
    labelKey: "navGroups.operations",
    items: [
      {
        id: "processing",
        path: "/admin/processing",
        navKey: "processing",
        icon: "processing",
        permission: PERMISSIONS.SYSTEM_SETTINGS_READ,
        searchKeywords: ["ingest", "policy", "templates", "organize"],
      },
      {
        id: "jobs",
        path: "/admin/jobs",
        navKey: "jobs",
        icon: "jobs",
        permission: PERMISSIONS.JOBS_READ,
        searchKeywords: ["queue", "background", "workers", "scan"],
      },
    ],
  },
  {
    id: "metadata",
    labelKey: "navGroups.metadata",
    items: [
      {
        id: "metadata-providers",
        path: "/admin/metadata/providers",
        navKey: "metadataProviders",
        icon: "metadataProviders",
        permission: PERMISSIONS.METADATA_PROVIDERS_READ,
        searchKeywords: ["sources", "api", "credentials"],
      },
      {
        id: "metadata-aggregation",
        path: "/admin/metadata/aggregation",
        navKey: "metadataAggregation",
        icon: "metadataAggregation",
        permission: PERMISSIONS.METADATA_PROVIDERS_READ,
        searchKeywords: ["priority", "fields", "merge", "fallback"],
      },
      {
        id: "metadata-formatting",
        path: "/admin/metadata/formatting",
        navKey: "metadataFormatting",
        icon: "metadataFormatting",
        permission: PERMISSIONS.METADATA_FORMATTING_READ,
        searchKeywords: [
          "language",
          "genres",
          "tags",
          "aliases",
          "normalization",
          "vocabulary",
        ],
      },
      {
        id: "ratings",
        path: "/admin/metadata/ratings",
        navKey: "ratings",
        icon: "ratings",
        permission: PERMISSIONS.RATINGS_READ,
        searchKeywords: [
          "review",
          "stars",
          "scale",
          "dimensions",
          "cores",
          "genres",
          "trajectory",
        ],
      },
    ],
  },
  {
    id: "conversion",
    labelKey: "navGroups.conversion",
    items: [
      {
        id: "conversion",
        path: "/admin/conversion",
        navKey: "conversion",
        icon: "conversion",
        permission: PERMISSIONS.SYSTEM_SETTINGS_READ,
        searchKeywords: ["epub", "book conversion"],
      },
    ],
  },
  {
    id: "access",
    labelKey: "navGroups.access",
    items: [
      {
        id: "users",
        path: "/admin/access/users",
        navKey: "users",
        icon: "users",
        permission: PERMISSIONS.USERS_READ,
      },
      {
        id: "roles",
        path: "/admin/access/roles",
        navKey: "roles",
        icon: "roles",
        permission: PERMISSIONS.ROLES_READ,
        searchKeywords: ["permissions", "rbac"],
      },
    ],
  },
  {
    id: "integrations",
    labelKey: "navGroups.integrations",
    items: [
      {
        id: "integrations",
        path: "/admin/integrations",
        navKey: "integrations",
        icon: "integrations",
        permission: PERMISSIONS.INTEGRATIONS_READ,
        searchKeywords: ["external", "api", "services"],
      },
    ],
  },
  {
    id: "system",
    labelKey: "navGroups.system",
    items: [
      {
        id: "configuration",
        path: "/admin/system/configuration",
        navKey: "configuration",
        icon: "configuration",
        permission: PERMISSIONS.SYSTEM_SETTINGS_READ,
        searchKeywords: ["general", "defaults", "installation", "locale", "display name"],
      },
      {
        id: "appearance",
        path: "/admin/system/appearance",
        navKey: "appearance",
        icon: "appearance",
        permission: PERMISSIONS.SYSTEM_SETTINGS_READ,
        searchKeywords: ["branding", "logo", "theme", "favicon"],
      },
      {
        id: "audit",
        path: "/admin/system/audit",
        navKey: "audit",
        icon: "audit",
        permission: PERMISSIONS.AUDIT_READ,
        searchKeywords: ["log", "history"],
      },
    ],
  },
];

/** Hidden from sidebar but routable (linked from Roles). */
export const ADMIN_HIDDEN_SECTIONS: AdminSection[] = [
  {
    id: "permissions",
    path: "/admin/access/permissions",
    navKey: "permissions",
    icon: "roles",
    permission: PERMISSIONS.ROLES_READ,
    searchKeywords: ["reference", "catalog"],
  },
];

export const ADMIN_SECTIONS: AdminSection[] = [
  ...ADMIN_NAV_GROUPS.flatMap((group) => group.items),
  ...ADMIN_HIDDEN_SECTIONS,
];

/** @deprecated Use section.path directly. */
export function adminPath(segment: string): string {
  return `/admin/${segment}`;
}

function canAccessSection(
  section: AdminSection,
  userPermissions: readonly string[],
): boolean {
  if (section.permission === null) return true;
  return userPermissions.includes(section.permission);
}

export function filterAdminSections(
  userPermissions: readonly string[],
): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) =>
    canAccessSection(section, userPermissions),
  );
}

export function filterAdminNavGroups(
  userPermissions: readonly string[],
): AdminNavGroup[] {
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      canAccessSection(item, userPermissions),
    ),
  })).filter((group) => group.items.length > 0);
}

export function getFirstAdminPath(_userPermissions?: readonly string[]): string {
  return "/admin";
}

export function getAdminSection(id: string): AdminSection | undefined {
  return ADMIN_SECTIONS.find((section) => section.id === id);
}
