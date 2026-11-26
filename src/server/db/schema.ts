import type {
  CandidateSnapshot,
  MediaLocation,
} from "../../shared/club-reads.js";
import type { ProfileCosmetics } from "../../shared/profile-cosmetics.js";
import { DEFAULT_PROFILE_COSMETICS } from "../../shared/profile-cosmetics.js";
import { sql, isNull } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  boolean,
  bigint,
  integer,
  jsonb,
  date,
  doublePrecision,
  uniqueIndex,
  index,
  pgEnum,
  primaryKey,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const storageKindEnum = pgEnum("storage_kind", [
  "managed",
  "external",
  "read_only",
]);
export const shelfKindEnum = pgEnum("shelf_kind", ["basic", "rules"]);
export const shelfVisibilityEnum = pgEnum("shelf_visibility", [
  "private",
  "shared",
  "collaborative",
]);
export const clubVisibilityEnum = pgEnum("club_visibility", [
  "private",
  "public",
]);
export const clubContextEnum = pgEnum("club_context", [
  "general",
  "book",
  "video",
  "ttrpg",
]);
export const clubMemberRoleEnum = pgEnum("club_member_role", [
  "owner",
  "moderator",
  "member",
]);
export const clubInviteStatusEnum = pgEnum("club_invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);
export const clubTopicKindEnum = pgEnum("club_topic_kind", [
  "discussion",
  "announcement",
]);
export const clubPostReactionEnum = pgEnum("club_post_reaction", ["like"]);
export const clubPostBodyFormatEnum = pgEnum("club_post_body_format", [
  "plain",
  "structured",
]);
export const clubPollStatusEnum = pgEnum("club_poll_status", [
  "draft",
  "active",
  "closed",
  "applied",
]);
export const clubPollDiscoverySourceEnum = pgEnum(
  "club_poll_discovery_source",
  ["tbr", "club_queued", "manual", "library"],
);
export const clubWorkStatusEnum = pgEnum("club_work_status", [
  "current",
  "queued",
  "completed",
  "associated",
]);
export const clubScheduleFrequencyEnum = pgEnum("club_schedule_frequency", [
  "once",
  "daily",
  "weekly",
  "monthly",
]);
export const clubScheduleTopicTimingEnum = pgEnum(
  "club_schedule_topic_timing",
  ["at_scheduled_time", "immediate", "hours_before"],
);
export const clubScheduleStatusEnum = pgEnum("club_schedule_status", [
  "active",
  "paused",
  "completed",
]);
export const clubScheduleOccurrenceStatusEnum = pgEnum(
  "club_schedule_occurrence_status",
  ["upcoming", "open", "completed", "skipped"],
);
export const downloadStatusEnum = pgEnum("download_status", [
  "queued",
  "in_progress",
  "available",
  "failed",
  "removed",
]);
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const libraryContentTypeEnum = pgEnum("library_content_type", [
  "book",
  "audiobook",
  "music",
  "movies",
  "tv",
]);

export const organizationPolicyModeEnum = pgEnum("organization_policy_mode", [
  "in_place",
  "managed",
]);

export const ingestSourceKindEnum = pgEnum("ingest_source_kind", [
  "filesystem",
  "upload",
]);

export const ingestPipelineStatusEnum = pgEnum("ingest_pipeline_status", [
  "discovered",
  "queued",
  "analyzing",
  "identifying",
  "metadata_resolved",
  "normalizing",
  "organizing",
  "completed",
]);

export const ingestTerminalStateEnum = pgEnum("ingest_terminal_state", [
  "failed",
  "needs_attention",
  "duplicate",
  "unsupported",
]);

export const ingestFileLifecycleEnum = pgEnum("ingest_file_lifecycle", [
  "incoming",
  "discovered",
  "claimed",
  "processing",
  "destination_prepared",
  "destination_verified",
  "source_retired",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash"),
  locale: text("locale").notNull().default("en"),
  theme: text("theme").notNull().default("system"),
  bio: text("bio"),
  avatarFileId: uuid("avatar_file_id").references(() => files.id, {
    onDelete: "set null",
  }),
  profileVisibility: text("profile_visibility").notNull().default("public"),
  profileJson: jsonb("profile_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  usernameChangedAt: timestamp("username_changed_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  disabledByUserId: uuid("disabled_by_user_id").references(
    (): AnyPgColumn => users.id,
    {
      onDelete: "set null",
    },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userOidcIdentities = pgTable(
  "user_oidc_identities",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerKey: text("provider_key").notNull().default("default"),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("user_oidc_identities_provider_issuer_subject_idx").on(
      t.providerKey,
      t.issuer,
      t.subject,
    ),
    uniqueIndex("user_oidc_identities_user_provider_idx").on(
      t.userId,
      t.providerKey,
    ),
    index("user_oidc_identities_user_id_idx").on(t.userId),
  ],
);

export const oidcAuthStates = pgTable(
  "oidc_auth_states",
  {
    id: uuid("id").primaryKey(),
    state: text("state").notNull().unique(),
    nonce: text("nonce").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    mode: text("mode").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    returnTo: text("return_to"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("oidc_auth_states_state_idx").on(t.state),
    index("oidc_auth_states_expires_idx").on(t.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("password_reset_tokens_expires_idx").on(t.expiresAt)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    deviceId: uuid("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("role_permission_unique").on(t.roleId, t.permissionId)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("user_role_unique").on(t.userId, t.roleId)],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  progressSyncEnabled: boolean("progress_sync_enabled").notNull().default(true),
  notificationsPaused: boolean("notifications_paused").notNull().default(false),
  libraryView: text("library_view").default("grid"),
  librarySort: text("library_sort").default("title"),
  privacyActivity: text("privacy_activity").default("private"),
  settingsJson: jsonb("settings_json")
    .$type<Record<string, unknown>>()
    .default({}),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  userAgent: text("user_agent"),
  settingsJson: jsonb("settings_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  stateJson: jsonb("state_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OrganizationPolicy = {
  mode: "in_place" | "managed";
  template?: string;
};

export type NormalizationPolicy = {
  epub?: { enabled: boolean; target: "epub-3.3" };
};

export type LibraryStatsCached = {
  fileCount?: number;
  totalBytes?: number;
  lastScanAt?: string;
};

export const libraries = pgTable("libraries", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  intendedDomain: text("intended_domain"),
  contentType: libraryContentTypeEnum("content_type").default("book"),
  enabled: boolean("enabled").notNull().default(true),
  storageLocationId: uuid("storage_location_id").references(
    () => storageLocations.id,
    { onDelete: "set null" },
  ),
  organizationPolicy: jsonb("organization_policy")
    .$type<OrganizationPolicy>()
    .default({ mode: "managed", template: "{author}/{series}/{title}" }),
  normalizationPolicy: jsonb("normalization_policy")
    .$type<NormalizationPolicy>()
    .default({ epub: { enabled: true, target: "epub-3.3" } }),
  supportedFormats: text("supported_formats")
    .array()
    .default(sql`ARRAY['epub','pdf','mobi','azw3','cbz']::text[]`),
  statsCached: jsonb("stats_cached").$type<LibraryStatsCached>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ingestRoots = pgTable("ingest_roots", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  storageLocationId: uuid("storage_location_id")
    .notNull()
    .references(() => storageLocations.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  recursive: boolean("recursive").notNull().default(true),
  contentTypeHint: text("content_type_hint"),
  defaultLibraryId: uuid("default_library_id").references(() => libraries.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const storageLocations = pgTable("storage_locations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  kind: storageKindEnum("kind").notNull().default("managed"),
  rootPath: text("root_path").notNull(),
  watchEnabled: boolean("watch_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const libraryStorageLocations = pgTable(
  "library_storage_locations",
  {
    libraryId: uuid("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    storageLocationId: uuid("storage_location_id")
      .notNull()
      .references(() => storageLocations.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("library_storage_unique").on(t.libraryId, t.storageLocationId),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey(),
    storageLocationId: uuid("storage_location_id")
      .notNull()
      .references(() => storageLocations.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    size: bigint("size", { mode: "number" }).notNull().default(0),
    mediaType: text("media_type"),
    checksum: text("checksum"),
    mtime: timestamp("mtime", { withTimezone: true }),
    missingAt: timestamp("missing_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("file_location_path_unique").on(
      t.storageLocationId,
      t.relativePath,
    ),
    index("files_checksum_idx").on(t.checksum),
    index("files_missing_idx").on(t.missingAt),
  ],
);

export type IngestStageLogEntry = {
  stage: string;
  at: string;
  message: string;
};

export const ingestItems = pgTable(
  "ingest_items",
  {
    id: uuid("id").primaryKey(),
    status: ingestPipelineStatusEnum("status").notNull().default("discovered"),
    terminalState: ingestTerminalStateEnum("terminal_state"),
    fileLifecycle: ingestFileLifecycleEnum("file_lifecycle")
      .notNull()
      .default("incoming"),
    sourceKind: ingestSourceKindEnum("source_kind").notNull(),
    sourceIdentity: text("source_identity").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceStorageLocationId: uuid("source_storage_location_id")
      .notNull()
      .references(() => storageLocations.id, { onDelete: "cascade" }),
    sourceChecksum: text("source_checksum"),
    sourceSize: bigint("source_size", { mode: "number" }),
    sourceMtime: timestamp("source_mtime", { withTimezone: true }),
    sourceIngestRootId: uuid("source_ingest_root_id").references(
      () => ingestRoots.id,
      { onDelete: "set null" },
    ),
    originalFilename: text("original_filename").notNull(),
    detectedContentType: text("detected_content_type"),
    detectedDomain: text("detected_domain"),
    targetLibraryId: uuid("target_library_id").references(() => libraries.id, {
      onDelete: "set null",
    }),
    destinationRelativePath: text("destination_relative_path"),
    duplicateOfWorkType: text("duplicate_of_work_type"),
    duplicateOfWorkId: text("duplicate_of_work_id"),
    workType: text("work_type"),
    workId: text("work_id"),
    fileId: uuid("file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedByWorker: text("claimed_by_worker"),
    error: text("error"),
    warnings: jsonb("warnings").$type<string[]>().default([]),
    stageLog: jsonb("stage_log").$type<IngestStageLogEntry[]>().default([]),
    progress: integer("progress").notNull().default(0),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("ingest_items_source_identity_unique").on(t.sourceIdentity),
    index("ingest_items_status_idx").on(t.status),
    index("ingest_items_terminal_idx").on(t.terminalState),
    index("ingest_items_created_idx").on(t.createdAt),
  ],
);

export const fileTechnicalMetadata = pgTable("file_technical_metadata", {
  id: uuid("id").primaryKey(),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  extractor: text("extractor").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  extractedAt: timestamp("extracted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const metadataProviders = pgTable("metadata_providers", {
  id: uuid("id").primaryKey(),
  key: text("key").notNull().unique(),
  contractVersion: text("contract_version").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  configEncrypted: text("config_encrypted"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const metadataRecords = pgTable("metadata_records", {
  id: uuid("id").primaryKey(),
  providerKey: text("provider_key").notNull(),
  externalId: text("external_id"),
  subjectType: text("subject_type"),
  subjectId: text("subject_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const metadataPolicies = pgTable(
  "metadata_policies",
  {
    mediaModule: text("media_module").notNull(),
    fieldId: text("field_id").notNull(),
    providerSourceOrder: jsonb("provider_source_order")
      .$type<string[]>()
      .notNull(),
    importSourceOrder: jsonb("import_source_order").$type<string[]>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mediaModule, t.fieldId] })],
);

export const metadataFieldProvenance = pgTable(
  "metadata_field_provenance",
  {
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    field: text("field").notNull(),
    sourceKey: text("source_key").notNull(),
    sourceCategory: text("source_category").notNull(),
    origin: text("origin").notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.subjectType, t.subjectId, t.field] })],
);

export const metadataMatchingRules = pgTable("metadata_matching_rules", {
  mediaModule: text("media_module").primaryKey(),
  rules: jsonb("rules").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const metadataCustomFields = pgTable(
  "metadata_custom_fields",
  {
    id: uuid("id").primaryKey(),
    mediaModule: text("media_module").notNull(),
    entityType: text("entity_type").notNull(),
    fieldKey: text("field_key").notNull(),
    displayName: text("display_name").notNull(),
    fieldType: text("field_type").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("metadata_custom_fields_scope_key_unique").on(
      t.mediaModule,
      t.entityType,
      t.fieldKey,
    ),
    index("metadata_custom_fields_scope_idx").on(t.mediaModule, t.entityType),
  ],
);

export const metadataCustomFieldOptions = pgTable(
  "metadata_custom_field_options",
  {
    id: uuid("id").primaryKey(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => metadataCustomFields.id, { onDelete: "cascade" }),
    optionKey: text("option_key").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("metadata_custom_field_options_field_key_unique").on(
      t.fieldId,
      t.optionKey,
    ),
  ],
);

export const customFieldValues = pgTable(
  "custom_field_values",
  {
    id: uuid("id").primaryKey(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => metadataCustomFields.id, { onDelete: "cascade" }),
    subjectId: text("subject_id").notNull(),
    value: jsonb("value").notNull(),
    setByUserId: uuid("set_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("custom_field_values_field_subject_unique").on(
      t.fieldId,
      t.subjectId,
    ),
    index("custom_field_values_subject_idx").on(t.subjectId),
  ],
);

export const fieldOverrides = pgTable(
  "field_overrides",
  {
    id: uuid("id").primaryKey(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    field: text("field").notNull(),
    value: jsonb("value").notNull(),
    setByUserId: uuid("set_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("override_unique").on(t.subjectType, t.subjectId, t.field),
  ],
);

export const userRatings = pgTable(
  "user_ratings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    rating: bigint("rating", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_rating_unique").on(t.userId, t.subjectType, t.subjectId),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey(),
    bossJobId: text("boss_job_id"),
    type: text("type").notNull(),
    taskKey: text("task_key").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    attempts: bigint("attempts", { mode: "number" }).notNull().default(1),
    progress: bigint("progress", { mode: "number" }),
    error: text("error"),
    logExcerpt: text("log_excerpt"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("job_runs_type_task_key_created_idx").on(
      t.type,
      t.taskKey,
      t.createdAt,
    ),
  ],
);

export const downloads = pgTable("downloads", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devices.id, {
    onDelete: "set null",
  }),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  status: downloadStatusEnum("status").notNull().default("queued"),
  bytesTotal: bigint("bytes_total", { mode: "number" }),
  bytesDownloaded: bigint("bytes_downloaded", { mode: "number" }).default(0),
  preparePayload: jsonb("prepare_payload").$type<{
    representationId?: string;
    urls: string[];
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const activityEvents = pgTable("activity_events", {
  id: uuid("id").primaryKey(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  subjectType: text("subject_type"),
  subjectId: text("subject_id"),
  visibility: text("visibility").notNull().default("private"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  ipAddress: text("ip_address"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  icon: text("icon"),
  visibility: text("visibility").notNull().default("private"),
  metric: text("metric").notNull(),
  aggregation: jsonb("aggregation")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({ kind: "count" }),
  target: integer("target").notNull(),
  activity: text("activity").notNull().default("finish"),
  basis: text("basis").notNull().default("completed"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  domains: jsonb("domains").$type<string[]>().notNull().default([]),
  rule: jsonb("rule").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const achievementDefinitions = pgTable(
  "achievement_definitions",
  {
    id: uuid("id").primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    presentation: jsonb("presentation").$type<Record<string, unknown>>(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceLabel: text("source_label"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    state: text("state").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("achievement_definition_source_key_unique").on(
      t.sourceType,
      t.sourceId,
      t.key,
    ),
    index("achievement_definition_source_idx").on(t.sourceType, t.sourceId),
    index("achievement_definition_state_idx").on(t.state),
  ],
);

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementDefinitionId: uuid("achievement_definition_id")
      .notNull()
      .references(() => achievementDefinitions.id, { onDelete: "restrict" }),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceLabel: text("source_label"),
    reasonType: text("reason_type"),
    reasonId: text("reason_id"),
    reasonLabel: text("reason_label"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_achievement_definition_unique").on(
      t.userId,
      t.achievementDefinitionId,
    ),
    index("user_achievement_user_earned_idx").on(t.userId, t.earnedAt),
    index("user_achievement_definition_idx").on(t.achievementDefinitionId),
    index("user_achievement_source_idx").on(t.sourceType, t.sourceId),
  ],
);

export const shelves = pgTable("shelves", {
  id: uuid("id").primaryKey(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  kind: shelfKindEnum("kind").notNull().default("basic"),
  scope: text("scope").notNull().default("global"),
  icon: text("icon").notNull().default("books"),
  visibility: shelfVisibilityEnum("visibility").notNull().default("private"),
  rules: jsonb("rules").$type<Record<string, unknown>>(),
  membershipExpression: jsonb("membership_expression").$type<
    Record<string, unknown>
  >(),
  sortLevels: jsonb("sort_levels")
    .$type<Array<{ field: string; order: "asc" | "desc" }>>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const shelfItems = pgTable(
  "shelf_items",
  {
    shelfId: uuid("shelf_id")
      .notNull()
      .references(() => shelves.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("shelf_item_unique").on(t.shelfId, t.subjectType, t.subjectId),
  ],
);

export const shelfGrants = pgTable(
  "shelf_grants",
  {
    shelfId: uuid("shelf_id")
      .notNull()
      .references(() => shelves.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canEdit: boolean("can_edit").notNull().default(false),
  },
  (t) => [uniqueIndex("shelf_grant_unique").on(t.shelfId, t.userId)],
);

export const shelfExcludedItems = pgTable(
  "shelf_excluded_items",
  {
    shelfId: uuid("shelf_id")
      .notNull()
      .references(() => shelves.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    excludedAt: timestamp("excluded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("shelf_excluded_item_unique").on(
      t.shelfId,
      t.subjectType,
      t.subjectId,
    ),
  ],
);

export const clubs = pgTable("clubs", {
  id: uuid("id").primaryKey(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  coverFileId: uuid("cover_file_id").references(() => files.id, {
    onDelete: "set null",
  }),
  visibility: clubVisibilityEnum("visibility").notNull().default("private"),
  context: clubContextEnum("context").notNull().default("general"),
  selectionDefaults: jsonb("selection_defaults")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  readDefaults: jsonb("read_defaults")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clubMembers = pgTable(
  "club_members",
  {
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: clubMemberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.clubId, t.userId] }),
    index("club_members_user_idx").on(t.userId),
  ],
);

export const clubInvites = pgTable(
  "club_invites",
  {
    id: uuid("id").primaryKey(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    inviterUserId: uuid("inviter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteeUserId: uuid("invitee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    status: clubInviteStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("club_invites_club_idx").on(t.clubId),
    index("club_invites_invitee_idx").on(t.inviteeUserId),
  ],
);

export const clubWorks = pgTable(
  "club_works",
  {
    id: uuid("id").primaryKey(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    workSubjectType: text("work_subject_type").notNull(),
    workSubjectId: text("work_subject_id").notNull(),
    status: clubWorkStatusEnum("status").notNull().default("associated"),
    sortOrder: integer("sort_order").notNull().default(0),
    addedByUserId: uuid("added_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("club_work_unique").on(
      t.clubId,
      t.workSubjectType,
      t.workSubjectId,
    ),
    index("club_works_club_status_idx").on(t.clubId, t.status),
    uniqueIndex("club_works_one_current")
      .on(t.clubId)
      .where(sql`${t.status} = 'current'`),
  ],
);

export const clubReadStatusEnum = pgEnum("club_read_status", [
  "scheduled",
  "active",
  "completed",
  "cancelled",
]);
export const clubSelectionPhaseEnum = pgEnum("club_selection_phase", [
  "draft",
  "nominations_open",
  "nominations_closed",
  "voting_open",
  "completed",
  "cancelled",
]);
export const clubSelectionMethodEnum = pgEnum("club_selection_method", [
  "simple_poll",
  "ranked_choice",
  "random_draw",
]);

export const clubSelectionRounds = pgTable(
  "club_selection_rounds",
  {
    id: uuid("id").primaryKey(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    phase: clubSelectionPhaseEnum("phase").notNull().default("draft"),
    method: clubSelectionMethodEnum("method").notNull().default("simple_poll"),
    nominationStartsAt: timestamp("nomination_starts_at", {
      withTimezone: true,
    }),
    nominationEndsAt: timestamp("nomination_ends_at", { withTimezone: true }),
    votingStartsAt: timestamp("voting_starts_at", { withTimezone: true }),
    votingEndsAt: timestamp("voting_ends_at", { withTimezone: true }),
    nextReadStartsAt: timestamp("next_read_starts_at", { withTimezone: true }),
    nominationLimit: integer("nomination_limit").notNull().default(2),
    configuration: jsonb("configuration")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    legacyPollId: uuid("legacy_poll_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("club_selection_rounds_club_idx").on(t.clubId, t.createdAt),
    check("club_selection_nomination_limit", sql`${t.nominationLimit} > 0`),
  ],
);

export const clubSelectionCandidates = pgTable(
  "club_selection_candidates",
  {
    id: uuid("id").primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => clubSelectionRounds.id, { onDelete: "cascade" }),
    workSubjectType: text("work_subject_type").notNull(),
    workSubjectId: text("work_subject_id"),
    snapshot: jsonb("snapshot").$type<CandidateSnapshot>().notNull(),
    eligible: boolean("eligible").notNull().default(true),
    legacyOptionId: uuid("legacy_option_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("club_selection_candidates_round_idx").on(t.roundId),
    index("club_selection_candidates_page_idx").on(t.roundId, t.id),
  ],
);

export const clubSelectionNominations = pgTable(
  "club_selection_nominations",
  {
    id: uuid("id").primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => clubSelectionRounds.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => clubSelectionCandidates.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("club_selection_nomination_unique").on(
      t.roundId,
      t.candidateId,
      t.userId,
    ),
    index("club_selection_nominations_user_idx").on(t.roundId, t.userId),
    index("club_selection_nominations_candidate_created_idx").on(
      t.candidateId,
      t.createdAt,
      t.id,
    ),
  ],
);

export const clubSelectionBallots = pgTable(
  "club_selection_ballots",
  {
    roundId: uuid("round_id")
      .notNull()
      .references(() => clubSelectionRounds.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ranking: jsonb("ranking").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.userId] })],
);

export const clubReads = pgTable(
  "club_reads",
  {
    id: uuid("id").primaryKey(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    workSubjectType: text("work_subject_type").notNull(),
    workSubjectId: text("work_subject_id"),
    candidateSnapshot: jsonb("candidate_snapshot").$type<CandidateSnapshot>(),
    status: clubReadStatusEnum("status").notNull().default("scheduled"),
    startDate: timestamp("start_date", { withTimezone: true }),
    targetEndDate: timestamp("target_end_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    selectionRoundId: uuid("selection_round_id").references(
      () => clubSelectionRounds.id,
      { onDelete: "set null" },
    ),
    legacyClubWorkId: uuid("legacy_club_work_id").references(
      () => clubWorks.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("club_reads_club_date_idx").on(t.clubId, t.createdAt),
    index("club_reads_completed_history_idx")
      .on(
        t.clubId,
        sql`COALESCE(${t.completedAt},${t.targetEndDate},${t.startDate},'-infinity'::timestamptz) DESC`,
        t.id.desc(),
      )
      .where(sql`${t.status}='completed'`),
    uniqueIndex("club_reads_one_active")
      .on(t.clubId)
      .where(sql`${t.status} = 'active'`),
    uniqueIndex("club_reads_one_scheduled")
      .on(t.clubId)
      .where(sql`${t.status} = 'scheduled'`),
    check(
      "club_reads_content_reference",
      sql`${t.workSubjectId} IS NOT NULL OR ${t.candidateSnapshot} IS NOT NULL`,
    ),
    check(
      "club_reads_date_order",
      sql`${t.targetEndDate} IS NULL OR ${t.startDate} IS NULL OR ${t.targetEndDate} >= ${t.startDate}`,
    ),
  ],
);

export const clubSchedules = pgTable(
  "club_schedules",
  {
    id: uuid("id").primaryKey(),
    clubReadId: uuid("club_read_id").references(() => clubReads.id, {
      onDelete: "restrict",
    }),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    clubWorkId: uuid("club_work_id").references(() => clubWorks.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    eventKind: text("event_kind")
      .$type<"checkin" | "final_discussion">()
      .notNull()
      .default("checkin"),
    frequency: clubScheduleFrequencyEnum("frequency").notNull(),
    interval: integer("interval").notNull().default(1),
    dayOfWeek: integer("day_of_week"),
    dayOfMonth: integer("day_of_month"),
    timeOfDay: text("time_of_day").notNull().default("19:00"),
    timezone: text("timezone").notNull().default("UTC"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    maxOccurrences: integer("max_occurrences"),
    consumption: jsonb("consumption")
      .$type<Record<string, unknown>>()
      .notNull(),
    topicTitleTemplate: text("topic_title_template")
      .notNull()
      .default("{{date}} — {{consumptionLabel}}"),
    topicBodyTemplate: text("topic_body_template")
      .notNull()
      .default("Discussion for {{consumptionLabel}}."),
    topicTiming: clubScheduleTopicTimingEnum("topic_timing")
      .notNull()
      .default("at_scheduled_time"),
    hoursBefore: integer("hours_before"),
    autoCreateTopic: boolean("auto_create_topic").notNull().default(true),
    status: clubScheduleStatusEnum("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("club_schedules_club_status_idx").on(t.clubId, t.status),
    index("club_schedules_read_idx").on(t.clubReadId),
  ],
);

export const clubScheduleOccurrences = pgTable(
  "club_schedule_occurrences",
  {
    id: uuid("id").primaryKey(),
    scheduleId: uuid("schedule_id").references(() => clubSchedules.id, {
      onDelete: "cascade",
    }),
    clubReadId: uuid("club_read_id").references(() => clubReads.id, {
      onDelete: "restrict",
    }),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    workSubjectType: text("work_subject_type"),
    workSubjectId: text("work_subject_id"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    consumption: jsonb("consumption")
      .$type<Record<string, unknown>>()
      .notNull(),
    title: text("title").notNull(),
    topicId: uuid("topic_id"),
    status: clubScheduleOccurrenceStatusEnum("status")
      .notNull()
      .default("upcoming"),
    sequenceNumber: integer("sequence_number").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("club_schedule_occurrences_club_scheduled_idx").on(
      t.clubId,
      t.scheduledAt,
    ),
    index("club_schedule_occurrences_schedule_idx").on(
      t.scheduleId,
      t.sequenceNumber,
    ),
    index("club_schedule_occurrences_opens_idx").on(t.opensAt, t.status),
    index("club_schedule_occurrences_read_idx").on(t.clubReadId),
  ],
);

export const clubTopicReadState = pgTable(
  "club_topic_read_state",
  {
    topicId: uuid("topic_id")
      .notNull()
      .references(() => clubTopics.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.topicId, t.userId] }),
    index("club_topic_read_state_user_idx").on(t.userId),
  ],
);

export const clubTopics = pgTable(
  "club_topics",
  {
    sharedQuoteId: uuid("shared_quote_id").references(() => clubQuotes.id, {
      onDelete: "set null",
    }),
    id: uuid("id").primaryKey(),
    mediaLocation: jsonb("media_location").$type<MediaLocation>(),
    spoilerBoundary: jsonb("spoiler_boundary").$type<MediaLocation>(),
    clubReadId: uuid("club_read_id").references(() => clubReads.id, {
      onDelete: "restrict",
    }),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: clubTopicKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    bodyFormat: clubPostBodyFormatEnum("body_format")
      .notNull()
      .default("plain"),
    workSubjectType: text("work_subject_type"),
    workSubjectId: text("work_subject_id"),
    scheduleOccurrenceId: uuid("schedule_occurrence_id").references(
      () => clubScheduleOccurrences.id,
      { onDelete: "set null" },
    ),
    pinned: boolean("pinned").notNull().default(false),
    closed: boolean("closed").notNull().default(false),
    replyCount: integer("reply_count").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("club_topics_club_activity_idx").on(
      t.clubId,
      t.pinned,
      t.lastActivityAt,
    ),
    index("club_topics_read_idx").on(t.clubReadId),
    index("club_topics_read_activity_idx").on(
      t.clubReadId,
      t.lastActivityAt.desc(),
      t.id.desc(),
    ),
  ],
);

export const clubPosts = pgTable(
  "club_posts",
  {
    id: uuid("id").primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => clubTopics.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    bodyFormat: clubPostBodyFormatEnum("body_format")
      .notNull()
      .default("plain"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("club_posts_topic_created_idx").on(t.topicId, t.createdAt)],
);

export const clubPostReactions = pgTable(
  "club_post_reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => clubPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reaction: clubPostReactionEnum("reaction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index("club_post_reactions_post_idx").on(t.postId),
  ],
);

export const clubContentMentions = pgTable(
  "club_content_mentions",
  {
    id: uuid("id").primaryKey(),
    topicId: uuid("topic_id").references(() => clubTopics.id, {
      onDelete: "cascade",
    }),
    postId: uuid("post_id").references(() => clubPosts.id, {
      onDelete: "cascade",
    }),
    mentionedUserId: uuid("mentioned_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("club_content_mentions_topic_idx").on(t.topicId),
    index("club_content_mentions_post_idx").on(t.postId),
  ],
);

export const clubOccurrenceCheckIns = pgTable(
  "club_occurrence_check_ins",
  {
    id: uuid("id").primaryKey(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => clubScheduleOccurrences.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("club_occurrence_check_ins_occurrence_user_unique").on(
      t.occurrenceId,
      t.userId,
    ),
    index("club_occurrence_check_ins_club_idx").on(t.clubId),
    index("club_occurrence_check_ins_occurrence_idx").on(t.occurrenceId),
  ],
);

export const clubPolls = pgTable(
  "club_polls",
  {
    id: uuid("id").primaryKey(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: clubPollStatusEnum("status").notNull().default("draft"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    winningOptionId: uuid("winning_option_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("club_polls_club_status_idx").on(t.clubId, t.status)],
);

export const clubPollOptions = pgTable(
  "club_poll_options",
  {
    id: uuid("id").primaryKey(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => clubPolls.id, { onDelete: "cascade" }),
    workSubjectType: text("work_subject_type").notNull(),
    workSubjectId: text("work_subject_id").notNull(),
    discoverySource: clubPollDiscoverySourceEnum("discovery_source")
      .notNull()
      .default("manual"),
    tbrMemberCount: integer("tbr_member_count"),
    sortOrder: integer("sort_order").notNull().default(0),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("club_poll_options_poll_idx").on(t.pollId, t.sortOrder)],
);

export const clubPollVotes = pgTable(
  "club_poll_votes",
  {
    pollId: uuid("poll_id")
      .notNull()
      .references(() => clubPolls.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => clubPollOptions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.pollId, t.userId] }),
    index("club_poll_votes_option_idx").on(t.optionId),
  ],
);

export const clubQuotes = pgTable(
  "club_quotes",
  {
    id: uuid("id").primaryKey(),
    mediaLocation: jsonb("media_location").$type<MediaLocation>(),
    spoilerBoundary: jsonb("spoiler_boundary").$type<MediaLocation>(),
    clubReadId: uuid("club_read_id").references(() => clubReads.id, {
      onDelete: "restrict",
    }),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workSubjectType: text("work_subject_type").notNull(),
    workSubjectId: text("work_subject_id").notNull(),
    text: text("text").notNull(),
    sourceAnnotationId: uuid("source_annotation_id").references(
      () => userAnnotations.id,
      { onDelete: "set null" },
    ),
    locatorJson: jsonb("locator_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("club_quotes_club_created_idx").on(t.clubId, t.createdAt),
    index("club_quotes_read_idx").on(t.clubReadId),
    index("club_quotes_read_created_idx").on(
      t.clubReadId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    uniqueIndex("club_quotes_club_annotation_unique")
      .on(t.clubId, t.sourceAnnotationId)
      .where(sql`${t.sourceAnnotationId} IS NOT NULL`),
  ],
);

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey(),
  key: text("key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  configEncrypted: text("config_encrypted"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const searchDocuments = pgTable(
  "search_documents",
  {
    id: uuid("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    tsv: text("tsv"),
  },
  (t) => [uniqueIndex("search_doc_unique").on(t.entityType, t.entityId)],
);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Bibliographic identity layer (WEM) + application layer ---

export const creativeWorkExpressions = pgTable(
  "creative_work_expressions",
  {
    id: uuid("id").primaryKey(),
    workType: text("work_type").notNull(),
    workId: text("work_id").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("expressions_work_idx").on(t.workType, t.workId)],
);

export const creativeWorkManifestations = pgTable(
  "creative_work_manifestations",
  {
    id: uuid("id").primaryKey(),
    expressionId: uuid("expression_id")
      .notNull()
      .references(() => creativeWorkExpressions.id, { onDelete: "cascade" }),
    label: text("label"),
    externalIdType: text("external_id_type"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("manifestations_expression_idx").on(t.expressionId),
    index("manifestations_external_idx").on(t.externalIdType, t.externalId),
  ],
);

export const representations = pgTable(
  "representations",
  {
    id: uuid("id").primaryKey(),
    manifestationId: uuid("manifestation_id").references(
      () => creativeWorkManifestations.id,
      { onDelete: "set null" },
    ),
    format: text("format").notNull(),
    domainModule: text("domain_module").notNull(),
    unavailableAt: timestamp("unavailable_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("representations_manifestation_idx").on(t.manifestationId),
    index("representations_domain_idx").on(t.domainModule),
  ],
);

export const representationFiles = pgTable(
  "representation_files",
  {
    representationId: uuid("representation_id")
      .notNull()
      .references(() => representations.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    role: text("role"),
    sortOrder: integer("sort_order").notNull().default(0),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("representation_file_unique").on(t.representationId, t.fileId),
    index("representation_files_file_idx").on(t.fileId),
    index("representation_files_sort_idx").on(t.representationId, t.sortOrder),
  ],
);

export const libraryMemberships = pgTable(
  "library_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("library_membership_unique").on(
      t.userId,
      t.targetType,
      t.targetId,
    ),
    index("library_memberships_target_idx").on(t.targetType, t.targetId),
  ],
);

// --- Physical holdings (user-scoped physical book ownership) ---
//
// A holding records that a user owns a physical copy of a Work. A null
// manifestationId means "physical copy owned, edition unknown". Ownership is
// user-specific; Works and manifestations remain shared library entities. No
// Representation/file rows are created for physical copies.
//
// Single-copy: one holding per (user, work). Repeated ownership requests and
// ISBN scans are idempotent. A future `physical_copies` layer can reference
// the holding id to support multiple copies without changing this meaning.

export const physicalHoldings = pgTable(
  "physical_holdings",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workType: text("work_type").notNull().default("book"),
    workId: varchar("work_id", { length: 6 })
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    manifestationId: uuid("manifestation_id").references(
      () => creativeWorkManifestations.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("physical_holding_user_work_unique").on(
      t.userId,
      t.workType,
      t.workId,
    ),
    index("physical_holdings_user_idx").on(t.userId, t.workType, t.workId),
    index("physical_holdings_work_idx").on(t.workType, t.workId),
    index("physical_holdings_manifestation_idx").on(t.manifestationId),
    check("physical_holdings_work_type_check", sql`${t.workType} IN ('book')`),
  ],
);

// --- Books domain (Work) ---

export const books = pgTable(
  "books",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    slugStatus: text("slug_status").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    coverFileId: uuid("cover_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("books_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    check(
      "books_slug_status_check",
      sql`${t.slugStatus} IN ('pending', 'canonical')`,
    ),
  ],
);

export const bookAuthors = pgTable(
  "book_authors",
  {
    id: uuid("id").primaryKey(),
    bookId: varchar("book_id", { length: 6 })
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    peopleId: varchar("people_id", { length: 6 }).references(() => people.id, {
      onDelete: "set null",
    }),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    index("book_authors_book_idx").on(t.bookId),
    index("book_authors_people_idx").on(t.peopleId),
  ],
);

export const bookSeries = pgTable("book_series", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bookSeriesMembers = pgTable(
  "book_series_members",
  {
    id: uuid("id").primaryKey(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => bookSeries.id, { onDelete: "cascade" }),
    bookId: varchar("book_id", { length: 6 })
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    position: bigint("position", { mode: "number" }),
  },
  (t) => [
    uniqueIndex("book_series_member_unique").on(t.seriesId, t.bookId),
    index("book_series_members_book_idx").on(t.bookId),
  ],
);

export const bookGenres = pgTable(
  "book_genres",
  {
    id: uuid("id").primaryKey(),
    bookId: varchar("book_id", { length: 6 })
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("book_genre_unique").on(t.bookId, t.name),
    index("book_genres_book_idx").on(t.bookId),
  ],
);

export const bookContributors = pgTable(
  "book_contributors",
  {
    id: uuid("id").primaryKey(),
    bookId: varchar("book_id", { length: 6 })
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [index("book_contributors_book_idx").on(t.bookId)],
);

export const bookTags = pgTable(
  "book_tags",
  {
    id: uuid("id").primaryKey(),
    bookId: varchar("book_id", { length: 6 })
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("book_tag_unique").on(t.bookId, t.name),
    index("book_tags_book_idx").on(t.bookId),
  ],
);

// --- Audiobooks domain (Work) ---

export const audiobooks = pgTable(
  "audiobooks",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    slugStatus: text("slug_status").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    coverFileId: uuid("cover_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("audiobooks_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    check(
      "audiobooks_slug_status_check",
      sql`${t.slugStatus} IN ('pending', 'canonical')`,
    ),
  ],
);

export const audiobookAuthors = pgTable(
  "audiobook_authors",
  {
    id: uuid("id").primaryKey(),
    audiobookId: varchar("audiobook_id", { length: 6 })
      .notNull()
      .references(() => audiobooks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    peopleId: varchar("people_id", { length: 6 }).references(() => people.id, {
      onDelete: "set null",
    }),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    index("audiobook_authors_audiobook_idx").on(t.audiobookId),
    index("audiobook_authors_people_idx").on(t.peopleId),
  ],
);

export const audiobookNarrators = pgTable(
  "audiobook_narrators",
  {
    id: uuid("id").primaryKey(),
    audiobookId: varchar("audiobook_id", { length: 6 })
      .notNull()
      .references(() => audiobooks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    peopleId: varchar("people_id", { length: 6 }).references(() => people.id, {
      onDelete: "set null",
    }),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    index("audiobook_narrators_audiobook_idx").on(t.audiobookId),
    index("audiobook_narrators_people_idx").on(t.peopleId),
  ],
);

export const audiobookSeries = pgTable("audiobook_series", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const audiobookSeriesMembers = pgTable(
  "audiobook_series_members",
  {
    id: uuid("id").primaryKey(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => audiobookSeries.id, { onDelete: "cascade" }),
    audiobookId: varchar("audiobook_id", { length: 6 })
      .notNull()
      .references(() => audiobooks.id, { onDelete: "cascade" }),
    position: bigint("position", { mode: "number" }),
  },
  (t) => [
    uniqueIndex("audiobook_series_member_unique").on(t.seriesId, t.audiobookId),
    index("audiobook_series_members_audiobook_idx").on(t.audiobookId),
  ],
);

export const audiobookGenres = pgTable(
  "audiobook_genres",
  {
    id: uuid("id").primaryKey(),
    audiobookId: varchar("audiobook_id", { length: 6 })
      .notNull()
      .references(() => audiobooks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("audiobook_genre_unique").on(t.audiobookId, t.name),
    index("audiobook_genres_audiobook_idx").on(t.audiobookId),
  ],
);

// --- Podcasts domain ---

export const podcastShows = pgTable(
  "podcast_shows",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    slugStatus: text("slug_status").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    author: text("author"),
    coverFileId: uuid("cover_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("podcast_shows_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    check(
      "podcast_shows_slug_status_check",
      sql`${t.slugStatus} IN ('pending', 'canonical')`,
    ),
  ],
);

export const podcastFeeds = pgTable(
  "podcast_feeds",
  {
    id: uuid("id").primaryKey(),
    showId: varchar("show_id", { length: 6 })
      .notNull()
      .references(() => podcastShows.id, { onDelete: "cascade" }),
    feedUrl: text("feed_url").notNull().unique(),
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    lastError: text("last_error"),
    syncInProgress: boolean("sync_in_progress").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("podcast_feeds_show_idx").on(t.showId)],
);

export const podcastEpisodes = pgTable(
  "podcast_episodes",
  {
    id: uuid("id").primaryKey(),
    showId: varchar("show_id", { length: 6 })
      .notNull()
      .references(() => podcastShows.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    guid: text("guid").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    episodeNumber: integer("episode_number"),
    seasonNumber: integer("season_number"),
    enclosureUrl: text("enclosure_url"),
    enclosureMime: text("enclosure_mime"),
    enclosureBytes: bigint("enclosure_bytes", { mode: "number" }),
    representationId: uuid("representation_id").references(
      () => representations.id,
      { onDelete: "set null" },
    ),
    prepareStatus: text("prepare_status").notNull().default("none"),
    prepareError: text("prepare_error"),
    unavailableAt: timestamp("unavailable_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("podcast_episodes_show_guid_unique").on(t.showId, t.guid),
    uniqueIndex("podcast_episodes_show_slug_unique").on(t.showId, t.slug),
    index("podcast_episodes_show_idx").on(t.showId),
    index("podcast_episodes_published_idx").on(t.showId, t.publishedAt),
    check(
      "podcast_episodes_prepare_status_check",
      sql`${t.prepareStatus} IN ('none', 'pending', 'ready', 'failed')`,
    ),
  ],
);

export const podcastSubscriptions = pgTable(
  "podcast_subscriptions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    showId: varchar("show_id", { length: 6 })
      .notNull()
      .references(() => podcastShows.id, { onDelete: "cascade" }),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("podcast_subscriptions_pkey").on(t.userId, t.showId),
    index("podcast_subscriptions_show_idx").on(t.showId),
  ],
);

// --- Music domain ---

export const albums = pgTable(
  "albums",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    slugStatus: text("slug_status").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    releaseDate: text("release_date"),
    coverFileId: uuid("cover_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("albums_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    check(
      "albums_slug_status_check",
      sql`${t.slugStatus} IN ('pending', 'canonical')`,
    ),
  ],
);

export const musicArtists = pgTable(
  "music_artists",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    slugStatus: text("slug_status").notNull(),
    name: text("name").notNull(),
    sortName: text("sort_name"),
    peopleId: varchar("people_id", { length: 6 }).references(() => people.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("music_artists_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    check(
      "music_artists_slug_status_check",
      sql`${t.slugStatus} IN ('pending', 'canonical')`,
    ),
    index("music_artists_people_idx").on(t.peopleId),
  ],
);

export const albumArtists = pgTable(
  "album_artists",
  {
    id: uuid("id").primaryKey(),
    albumId: varchar("album_id", { length: 6 })
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    artistId: varchar("artist_id", { length: 6 })
      .notNull()
      .references(() => musicArtists.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("primary"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    uniqueIndex("album_artist_unique").on(t.albumId, t.artistId, t.role),
    index("album_artists_album_idx").on(t.albumId),
    index("album_artists_artist_idx").on(t.artistId),
  ],
);

export const albumGenres = pgTable(
  "album_genres",
  {
    id: uuid("id").primaryKey(),
    albumId: varchar("album_id", { length: 6 })
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("album_genre_unique").on(t.albumId, t.name),
    index("album_genres_album_idx").on(t.albumId),
  ],
);

export const musicTracks = pgTable(
  "music_tracks",
  {
    id: uuid("id").primaryKey(),
    albumId: varchar("album_id", { length: 6 })
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    discNumber: integer("disc_number"),
    trackNumber: integer("track_number"),
    durationSeconds: integer("duration_seconds"),
    representationId: uuid("representation_id").references(
      () => representations.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("music_tracks_album_slug_unique").on(t.albumId, t.slug),
    index("music_tracks_album_idx").on(t.albumId),
    index("music_tracks_album_order_idx").on(
      t.albumId,
      t.discNumber,
      t.trackNumber,
    ),
  ],
);

export const trackArtists = pgTable(
  "track_artists",
  {
    id: uuid("id").primaryKey(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => musicTracks.id, { onDelete: "cascade" }),
    artistId: varchar("artist_id", { length: 6 })
      .notNull()
      .references(() => musicArtists.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("primary"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    uniqueIndex("track_artist_unique").on(t.trackId, t.artistId, t.role),
    index("track_artists_track_idx").on(t.trackId),
  ],
);

export const musicPlaylists = pgTable(
  "music_playlists",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("music_playlists_user_slug_unique").on(t.userId, t.slug),
    index("music_playlists_user_idx").on(t.userId),
  ],
);

export const musicPlaylistTracks = pgTable(
  "music_playlist_tracks",
  {
    id: uuid("id").primaryKey(),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => musicPlaylists.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => musicTracks.id, { onDelete: "cascade" }),
    position: bigint("position", { mode: "number" }).notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("music_playlist_track_unique").on(t.playlistId, t.trackId),
    index("music_playlist_tracks_playlist_idx").on(t.playlistId),
  ],
);

// --- Movies domain ---

export const movies = pgTable(
  "movies",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    slugStatus: text("slug_status").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    releaseDate: text("release_date"),
    runtimeSeconds: integer("runtime_seconds"),
    studio: text("studio"),
    contentRating: text("content_rating"),
    coverFileId: uuid("cover_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("movies_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    check(
      "movies_slug_status_check",
      sql`${t.slugStatus} IN ('pending', 'canonical')`,
    ),
  ],
);

export const movieGenres = pgTable(
  "movie_genres",
  {
    id: uuid("id").primaryKey(),
    movieId: varchar("movie_id", { length: 6 })
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("movie_genre_unique").on(t.movieId, t.name),
    index("movie_genres_movie_idx").on(t.movieId),
  ],
);

export const moviePeople = pgTable(
  "movie_people",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    slugStatus: text("slug_status").notNull(),
    name: text("name").notNull(),
    sortName: text("sort_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("movie_people_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    check(
      "movie_people_slug_status_check",
      sql`${t.slugStatus} IN ('pending', 'canonical')`,
    ),
  ],
);

export const movieCredits = pgTable(
  "movie_credits",
  {
    id: uuid("id").primaryKey(),
    movieId: varchar("movie_id", { length: 6 })
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    personId: varchar("person_id", { length: 6 })
      .notNull()
      .references(() => moviePeople.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    character: text("character"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    uniqueIndex("movie_credit_unique").on(t.movieId, t.personId, t.role),
    index("movie_credits_movie_idx").on(t.movieId),
    index("movie_credits_person_idx").on(t.personId),
  ],
);

export const movieCollections = pgTable(
  "movie_collections",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    slugStatus: text("slug_status").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    coverFileId: uuid("cover_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("movie_collections_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    check(
      "movie_collections_slug_status_check",
      sql`${t.slugStatus} IN ('pending', 'canonical')`,
    ),
  ],
);

export const movieCollectionItems = pgTable(
  "movie_collection_items",
  {
    id: uuid("id").primaryKey(),
    collectionId: varchar("collection_id", { length: 6 })
      .notNull()
      .references(() => movieCollections.id, { onDelete: "cascade" }),
    movieId: varchar("movie_id", { length: 6 })
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    uniqueIndex("movie_collection_item_unique").on(t.collectionId, t.movieId),
    index("movie_collection_items_collection_idx").on(t.collectionId),
    index("movie_collection_items_movie_idx").on(t.movieId),
  ],
);

// --- TV domain ---

export const tvShows = pgTable(
  "tv_shows",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    slugStatus: text("slug_status").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    premiereDate: text("premiere_date"),
    studio: text("studio"),
    contentRating: text("content_rating"),
    coverFileId: uuid("cover_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("tv_shows_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    check(
      "tv_shows_slug_status_check",
      sql`${t.slugStatus} IN ('pending', 'canonical')`,
    ),
  ],
);

export const tvSeasons = pgTable(
  "tv_seasons",
  {
    id: uuid("id").primaryKey(),
    showId: varchar("show_id", { length: 6 })
      .notNull()
      .references(() => tvShows.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    title: text("title"),
    description: text("description"),
    coverFileId: uuid("cover_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tv_season_unique").on(t.showId, t.seasonNumber),
    index("tv_seasons_show_idx").on(t.showId),
  ],
);

export const tvEpisodes = pgTable(
  "tv_episodes",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    showId: varchar("show_id", { length: 6 })
      .notNull()
      .references(() => tvShows.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => tvSeasons.id, { onDelete: "cascade" }),
    episodeNumber: integer("episode_number").notNull(),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    title: text("title").notNull(),
    description: text("description"),
    airDate: text("air_date"),
    runtimeSeconds: integer("runtime_seconds"),
    coverFileId: uuid("cover_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("tv_episodes_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    uniqueIndex("tv_episode_order_unique").on(
      t.seasonId,
      t.episodeNumber,
      t.sortOrder,
    ),
    index("tv_episodes_show_idx").on(t.showId),
    index("tv_episodes_season_idx").on(t.seasonId),
    index("tv_episodes_season_order_idx").on(
      t.seasonId,
      t.episodeNumber,
      t.sortOrder,
    ),
  ],
);

export const tvGenres = pgTable(
  "tv_genres",
  {
    id: uuid("id").primaryKey(),
    showId: varchar("show_id", { length: 6 })
      .notNull()
      .references(() => tvShows.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("tv_genre_unique").on(t.showId, t.name),
    index("tv_genres_show_idx").on(t.showId),
  ],
);

export const tvPeople = pgTable(
  "tv_people",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    slugStatus: text("slug_status").notNull(),
    name: text("name").notNull(),
    sortName: text("sort_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("tv_people_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    check(
      "tv_people_slug_status_check",
      sql`${t.slugStatus} IN ('pending', 'canonical')`,
    ),
  ],
);

export const tvCredits = pgTable(
  "tv_credits",
  {
    id: uuid("id").primaryKey(),
    showId: varchar("show_id", { length: 6 })
      .notNull()
      .references(() => tvShows.id, { onDelete: "cascade" }),
    personId: varchar("person_id", { length: 6 })
      .notNull()
      .references(() => tvPeople.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    character: text("character"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    uniqueIndex("tv_credit_unique").on(t.showId, t.personId, t.role),
    index("tv_credits_show_idx").on(t.showId),
    index("tv_credits_person_idx").on(t.personId),
  ],
);

export const liveTvPlaylists = pgTable(
  "live_tv_playlists",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceUrl: text("source_url"),
    epgUrl: text("epg_url"),
    sourceConfig: jsonb("source_config").$type<Record<string, unknown>>(),
    credentialsEncrypted: text("credentials_encrypted"),
    syncInProgress: boolean("sync_in_progress").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "live_tv_playlists_source_kind_check",
      sql`${t.sourceKind} IN ('m3u', 'manual')`,
    ),
  ],
);

export const liveTvChannels = pgTable(
  "live_tv_channels",
  {
    id: uuid("id").primaryKey(),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => liveTvPlaylists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    groupTitle: text("group_title"),
    logoUrl: text("logo_url"),
    streamUrl: text("stream_url").notNull(),
    tvgId: text("tvg_id"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("live_tv_channels_playlist_idx").on(t.playlistId),
    index("live_tv_channels_playlist_sort_idx").on(t.playlistId, t.sortOrder),
  ],
);

export const liveTvPrograms = pgTable(
  "live_tv_programs",
  {
    id: uuid("id").primaryKey(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => liveTvChannels.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("live_tv_programs_channel_idx").on(t.channelId),
    index("live_tv_programs_channel_starts_idx").on(t.channelId, t.startsAt),
  ],
);

export const creativeWorkRelationships = pgTable(
  "creative_work_relationships",
  {
    id: uuid("id").primaryKey(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    relationshipType: text("relationship_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("creative_work_rel_unique").on(
      t.sourceType,
      t.sourceId,
      t.targetType,
      t.targetId,
      t.relationshipType,
    ),
    index("creative_work_rel_source_idx").on(t.sourceType, t.sourceId),
    index("creative_work_rel_target_idx").on(t.targetType, t.targetId),
  ],
);

// --- User state ---

export const userFavorites = pgTable(
  "user_favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_favorite_unique").on(
      t.userId,
      t.subjectType,
      t.subjectId,
    ),
  ],
);

export const userProgress = pgTable(
  "user_progress",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    locatorJson: jsonb("locator_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    representationId: uuid("representation_id").references(
      () => representations.id,
      { onDelete: "set null" },
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_progress_unique").on(
      t.userId,
      t.subjectType,
      t.subjectId,
    ),
  ],
);

export const userHistory = pgTable(
  "user_history",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_history_user_idx").on(t.userId, t.occurredAt),
    index("user_history_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

export const userBookmarks = pgTable(
  "user_bookmarks",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    representationId: uuid("representation_id").references(
      () => representations.id,
      { onDelete: "set null" },
    ),
    label: text("label"),
    locatorJson: jsonb("locator_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_bookmarks_user_idx").on(t.userId, t.subjectType, t.subjectId),
  ],
);

export const userAnnotations = pgTable(
  "user_annotations",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    representationId: uuid("representation_id").references(
      () => representations.id,
      { onDelete: "set null" },
    ),
    locatorJson: jsonb("locator_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    highlightText: text("highlight_text"),
    note: text("note"),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_annotations_user_idx").on(t.userId, t.subjectType, t.subjectId),
  ],
);

// --- Metadata formatting (vocabulary normalization) ---

export const metadataVocabularyTerms = pgTable(
  "metadata_vocabulary_terms",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    slug: text("slug").notNull(),
    parentId: uuid("parent_id").references(
      (): AnyPgColumn => metadataVocabularyTerms.id,
      {
        onDelete: "restrict",
      },
    ),
    mediaTypes: jsonb("media_types").$type<string[]>().notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: bigint("sort_order", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "metadata_vocabulary_terms_kind_check",
      sql`${t.kind} IN ('genre', 'tag')`,
    ),
    index("metadata_vocabulary_terms_kind_parent_idx").on(t.kind, t.parentId),
    uniqueIndex("metadata_vocabulary_terms_unique_name").on(
      t.kind,
      sql`COALESCE(${t.parentId}::text, '')`,
      t.normalizedName,
    ),
    uniqueIndex("metadata_vocabulary_terms_kind_slug_unique").on(
      t.kind,
      t.slug,
    ),
  ],
);

export const metadataVocabularyAliases = pgTable(
  "metadata_vocabulary_aliases",
  {
    id: uuid("id").primaryKey(),
    termId: uuid("term_id")
      .notNull()
      .references(() => metadataVocabularyTerms.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "metadata_vocabulary_aliases_kind_check",
      sql`${t.kind} IN ('genre', 'tag')`,
    ),
    uniqueIndex("metadata_vocabulary_aliases_kind_normalized").on(
      t.kind,
      t.normalizedAlias,
    ),
    index("metadata_vocabulary_aliases_term_idx").on(t.termId),
  ],
);

export const metadataFormattingSuggestions = pgTable(
  "metadata_formatting_suggestions",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").notNull(),
    rawValue: text("raw_value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    status: text("status").notNull().default("open"),
    suggestedTermId: uuid("suggested_term_id").references(
      () => metadataVocabularyTerms.id,
      { onDelete: "set null" },
    ),
    suggestionType: text("suggestion_type").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "metadata_formatting_suggestions_kind_check",
      sql`${t.kind} IN ('genre', 'tag')`,
    ),
    check(
      "metadata_formatting_suggestions_status_check",
      sql`${t.status} IN ('open', 'resolved', 'ignored')`,
    ),
    check(
      "metadata_formatting_suggestions_type_check",
      sql`${t.suggestionType} IN ('similar_name', 'suggest_alias', 'placement')`,
    ),
    index("metadata_formatting_suggestions_kind_status_idx").on(
      t.kind,
      t.status,
    ),
    uniqueIndex("metadata_formatting_suggestions_open_unique")
      .on(t.kind, t.normalizedValue)
      .where(sql`${t.status} = 'open'`),
  ],
);

export const readingProgress = pgTable(
  "reading_progress",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    representationId: uuid("representation_id")
      .notNull()
      .references(() => representations.id, { onDelete: "cascade" }),
    workType: text("work_type").notNull(),
    workId: text("work_id").notNull(),
    locatorJson: jsonb("locator_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completionSource: text("completion_source"),
    version: integer("version").notNull().default(1),
    lastDeviceId: uuid("last_device_id").references(() => devices.id, {
      onDelete: "set null",
    }),
    lastClientId: text("last_client_id"),
    lastIdempotencyKey: text("last_idempotency_key"),
  },
  (t) => [
    uniqueIndex("reading_progress_user_rep_unique").on(
      t.userId,
      t.representationId,
    ),
    index("reading_progress_user_work_idx").on(t.userId, t.workType, t.workId),
    index("reading_progress_rep_idx").on(t.representationId),
    index("reading_progress_user_updated_idx").on(t.userId, t.updatedAt),
  ],
);

export const readingProgressEvents = pgTable(
  "reading_progress_events",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    representationId: uuid("representation_id")
      .notNull()
      .references(() => representations.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    previousLocatorJson: jsonb("previous_locator_json").$type<
      Record<string, unknown>
    >(),
    locatorJson: jsonb("locator_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }),
    deviceId: uuid("device_id").references(() => devices.id, {
      onDelete: "set null",
    }),
    clientId: text("client_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reading_progress_events_user_rep_occurred_idx").on(
      t.userId,
      t.representationId,
      t.occurredAt,
    ),
  ],
);

export const readingSessions = pgTable(
  "reading_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    representationId: uuid("representation_id")
      .notNull()
      .references(() => representations.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    activeDuration: integer("active_duration").notNull().default(0),
    startingLocatorJson: jsonb("starting_locator_json").$type<
      Record<string, unknown>
    >(),
    endingLocatorJson: jsonb("ending_locator_json").$type<
      Record<string, unknown>
    >(),
    deviceId: uuid("device_id").references(() => devices.id, {
      onDelete: "set null",
    }),
    clientId: text("client_id"),
    status: text("status").notNull().default("pending"),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastHeartbeatIdempotencyKey: text("last_heartbeat_idempotency_key"),
  },
  (t) => [
    index("reading_sessions_user_started_idx").on(t.userId, t.startedAt),
    index("reading_sessions_user_rep_started_idx").on(
      t.userId,
      t.representationId,
      t.startedAt,
    ),
    index("reading_sessions_rep_started_idx").on(
      t.representationId,
      t.startedAt,
    ),
  ],
);

export const readingActivity = pgTable(
  "reading_activity",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    representationId: uuid("representation_id")
      .notNull()
      .references(() => representations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => readingSessions.id, {
      onDelete: "set null",
    }),
    locatorJson: jsonb("locator_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    duration: integer("duration").notNull().default(0),
    deviceId: uuid("device_id").references(() => devices.id, {
      onDelete: "set null",
    }),
    clientId: text("client_id"),
    idempotencyKey: text("idempotency_key"),
  },
  (t) => [
    index("reading_activity_user_started_idx").on(t.userId, t.startedAt),
    index("reading_activity_user_rep_started_idx").on(
      t.userId,
      t.representationId,
      t.startedAt,
    ),
    index("reading_activity_rep_started_idx").on(
      t.representationId,
      t.startedAt,
    ),
    index("reading_activity_session_idx").on(t.sessionId),
    uniqueIndex("reading_activity_user_idempotency_unique")
      .on(t.userId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);

// --- Stats: user_stat_facts (see docs/STATS.md) ---

export const userStatFacts = pgTable(
  "user_stat_facts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    mediaType: text("media_type").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    value: doublePrecision("value").notNull().default(0),
    unit: text("unit").notNull().default("count"),
    ratingScale: integer("rating_scale"),
    snapshot: jsonb("snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    visibility: text("visibility").notNull().default("private"),
    source: text("source").notNull(),
    sourceKey: text("source_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_stat_facts_source_unique").on(
      t.userId,
      t.kind,
      t.source,
      t.sourceKey,
    ),
    index("user_stat_facts_user_occurred_idx").on(t.userId, t.occurredAt),
    index("user_stat_facts_user_type_occurred_idx").on(
      t.userId,
      t.mediaType,
      t.occurredAt,
    ),
    index("user_stat_facts_user_kind_idx").on(t.userId, t.kind),
    index("user_stat_facts_user_visibility_idx").on(t.userId, t.visibility),
  ],
);

export const representationSyncIdentifiers = pgTable(
  "representation_sync_identifiers",
  {
    id: uuid("id").primaryKey(),
    representationId: uuid("representation_id")
      .notNull()
      .references(() => representations.id, { onDelete: "cascade" }),
    scheme: text("scheme").notNull(),
    identifier: text("identifier").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("representation_sync_identifiers_scheme_id_unique").on(
      t.scheme,
      t.identifier,
    ),
    index("representation_sync_identifiers_rep_idx").on(t.representationId),
  ],
);

// --- People: Creative Identity Graph ---

export const peopleEntityTypeEnum = pgEnum("people_entity_type", [
  "person",
  "group",
  "organization",
]);

export const people = pgTable(
  "people",
  {
    id: varchar("id", { length: 6 }).primaryKey(),
    slug: text("slug").notNull().unique(),
    entityType: peopleEntityTypeEnum("entity_type").notNull().default("person"),
    name: text("name").notNull(),
    sortName: text("sort_name").notNull(),
    alternateNames: text("alternate_names")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    bio: text("bio"),
    pronouns: text("pronouns"),
    personalUrl: text("personal_url"),
    birthDate: date("birth_date"),
    deathDate: date("death_date"),
    birthPlace: text("birth_place"),
    deathPlace: text("death_place"),
    photoFileId: uuid("photo_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("people_id_format", sql`${t.id} ~ '^[a-z0-9]{6}$'`),
    index("people_sort_name_idx").on(t.sortName),
    index("people_entity_type_idx").on(t.entityType),
    index("people_type_sort_idx").on(t.entityType, t.sortName),
  ],
);

export const personCredits = pgTable(
  "person_credits",
  {
    id: uuid("id").primaryKey(),
    peopleId: varchar("people_id", { length: 6 })
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    role: text("role").notNull(),
    character: text("character"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    creditProvenance:
      jsonb("credit_provenance").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("person_credits_people_idx").on(t.peopleId),
    index("person_credits_target_idx").on(t.targetType, t.targetId),
    index("person_credits_target_type_idx").on(t.targetType),
    uniqueIndex("person_credit_unique").on(
      t.peopleId,
      t.targetType,
      t.targetId,
      t.role,
    ),
    index("person_credits_target_sort_idx").on(
      t.targetType,
      t.targetId,
      t.sortOrder,
    ),
  ],
);

export const personProviderIdentifiers = pgTable(
  "person_provider_identifiers",
  {
    id: uuid("id").primaryKey(),
    peopleId: varchar("people_id", { length: 6 })
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    identifier: text("identifier").notNull(),
    provenance: jsonb("provenance").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("person_provider_identifier_unique").on(
      t.provider,
      t.identifier,
    ),
    index("person_provider_people_idx").on(t.peopleId),
  ],
);

export const personLinks = pgTable(
  "person_links",
  {
    id: uuid("id").primaryKey(),
    peopleId: varchar("people_id", { length: 6 })
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    label: text("label"),
    url: text("url").notNull(),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    provenance: jsonb("provenance").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("person_links_people_idx").on(t.peopleId),
    index("person_links_kind_idx").on(t.kind),
  ],
);

export const personRelationships = pgTable(
  "person_relationships",
  {
    id: uuid("id").primaryKey(),
    peopleId: varchar("people_id", { length: 6 })
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    relatedPeopleId: varchar("related_people_id", { length: 6 })
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").notNull(),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("person_rel_people_idx").on(t.peopleId),
    index("person_rel_related_idx").on(t.relatedPeopleId),
    uniqueIndex("person_rel_unique").on(
      t.peopleId,
      t.relatedPeopleId,
      t.relationshipType,
    ),
  ],
);

// --- Ratings & Reviews (user-scoped) ---
//
// Rating system configuration lives in `system_settings` under the "ratings"
// key. These tables persist the rating *definitions* (dimensions the user can
// rate against) and the user's own rating/review records. All review data is
// user scoped; nothing here describes the shared book record itself.

export const bookRatingScopeEnum = pgEnum("book_rating_scope", [
  "core",
  "genre",
]);

export const bookRatingRecommendationEnum = pgEnum(
  "book_rating_recommendation",
  ["yes", "no"],
);

export const bookReviewStatusEnum = pgEnum("book_review_status", [
  "draft",
  "completed",
]);

export const bookRatingGenreDefinitions = pgTable(
  "book_rating_genre_definitions",
  {
    id: uuid("id").primaryKey(),
    genreTermId: uuid("genre_term_id")
      .notNull()
      .references(() => metadataVocabularyTerms.id, { onDelete: "restrict" }),
    mediaType: text("media_type").notNull().default("books"),
    inheritanceMode: text("inheritance_mode").notNull().default("custom"),
    enabled: boolean("enabled").notNull().default(true),
    displayOrder: bigint("display_order", { mode: "number" })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("book_rating_genre_definitions_term_idx").on(t.genreTermId),
    uniqueIndex("book_rating_genre_definitions_term_media_unique").on(
      t.genreTermId,
      t.mediaType,
    ),
    check(
      "book_rating_genre_definitions_inheritance_check",
      sql`${t.inheritanceMode} IN ('inherit', 'custom')`,
    ),
  ],
);

export const bookRatingDimensions = pgTable(
  "book_rating_dimensions",
  {
    id: uuid("id").primaryKey(),
    key: text("key").notNull(),
    scope: bookRatingScopeEnum("scope").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    displayOrder: bigint("display_order", { mode: "number" })
      .notNull()
      .default(0),
    required: boolean("required").notNull().default(false),
    contributesToRating: boolean("contributes_to_rating")
      .notNull()
      .default(true),
    weight: doublePrecision("weight").notNull().default(1),
    genreDefinitionId: uuid("genre_definition_id").references(
      () => bookRatingGenreDefinitions.id,
      { onDelete: "cascade" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("book_rating_core_dimension_key_unique")
      .on(t.key)
      .where(sql`${t.scope} = 'core'`),
    uniqueIndex("book_rating_genre_dimension_key_unique")
      .on(t.genreDefinitionId, t.key)
      .where(sql`${t.scope} = 'genre'`),
    index("book_rating_dimensions_genre_def_idx").on(t.genreDefinitionId),
    check(
      "book_rating_dimensions_scope_def_check",
      sql`(${t.scope} = 'core' AND ${t.genreDefinitionId} IS NULL) OR (${t.scope} = 'genre' AND ${t.genreDefinitionId} IS NOT NULL)`,
    ),
  ],
);

export const bookReviews = pgTable(
  "book_reviews",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookId: varchar("book_id", { length: 6 })
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    status: bookReviewStatusEnum("status").notNull().default("draft"),
    recommendation: bookRatingRecommendationEnum("recommendation"),
    suggestedRating: doublePrecision("suggested_rating"),
    finalRating: doublePrecision("final_rating"),
    coreValues: jsonb("core_values").$type<Record<string, number>>(),
    genreValues:
      jsonb("genre_values").$type<Record<string, Record<string, number>>>(),
    trajectory:
      jsonb("trajectory").$type<Array<{ progress: number; rating: number }>>(),
    summary: text("summary"),
    review: text("review"),
    reviewEdited: boolean("review_edited").notNull().default(false),
    externalPosts: jsonb("external_posts").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("book_reviews_user_book_unique").on(t.userId, t.bookId),
    index("book_reviews_book_idx").on(t.bookId),
    index("book_reviews_user_idx").on(t.userId),
  ],
);

export const userExternalPostCredentials = pgTable(
  "user_external_post_credentials",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerKey: text("provider_key").notNull(),
    tokenEncrypted: text("token_encrypted").notNull(),
    status: text("status").notNull().default("authorized"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("user_external_post_credentials_user_provider_unique").on(
      t.userId,
      t.providerKey,
    ),
    index("user_external_post_credentials_provider_idx").on(t.providerKey),
  ],
);

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  pronouns: text("pronouns"),
  bannerFileId: uuid("banner_file_id").references(() => files.id, {
    onDelete: "set null",
  }),
  accent: text("accent"),
  cardStyle: text("card_style"),
  heroTreatment: text("hero_treatment"),
  surfaceTreatment: text("surface_treatment"),
  customCss: text("custom_css"),
  cosmetics: jsonb("cosmetics")
    .$type<ProfileCosmetics>()
    .notNull()
    .default(DEFAULT_PROFILE_COSMETICS),
  guestbookEnabled: boolean("guestbook_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userProfileLinks = pgTable(
  "user_profile_links",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_profile_links_user_sort_idx").on(t.userId, t.sortOrder),
    index("user_profile_links_user_idx").on(t.userId),
  ],
);

export const userFollows = pgTable(
  "user_follows",
  {
    followerUserId: uuid("follower_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followedUserId: uuid("followed_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerUserId, t.followedUserId] }),
    uniqueIndex("user_follows_unique").on(t.followerUserId, t.followedUserId),
    index("user_follows_follower_idx").on(t.followerUserId),
    index("user_follows_followed_idx").on(t.followedUserId),
  ],
);

export const profileObsessions = pgTable(
  "profile_obsessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    pinnedAt: timestamp("pinned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("profile_obsessions_user_sort_idx").on(t.userId, t.sortOrder),
    index("profile_obsessions_user_idx").on(t.userId),
  ],
);

export const userProfileArtifacts = pgTable(
  "user_profile_artifacts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    artifactType: text("artifact_type").notNull(),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    size: text("size").notNull().default("medium"),
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_profile_artifacts_user_sort_idx").on(t.userId, t.sortOrder),
    index("user_profile_artifacts_user_idx").on(t.userId),
  ],
);

export const profileGuestbookEntries = pgTable(
  "profile_guestbook_entries",
  {
    id: uuid("id").primaryKey(),
    profileUserId: uuid("profile_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("profile_guestbook_profile_created_idx").on(
      t.profileUserId,
      t.createdAt,
    ),
    index("profile_guestbook_author_idx").on(t.authorUserId),
  ],
);

// --- Presence 1.0 (native reader/player liveness) ---
//
// Presence sessions are domain primitives, distinct from activity history and
// reading_status. A user may hold multiple live/recent sessions; the Presence
// resolver selects the single displayed presence. Work title/cover are never
// duplicated here — the view layer resolves them from the library.

export const presenceKindEnum = pgEnum("presence_kind", [
  "reading",
  "listening",
  "watching",
]);

export const presenceSourceEnum = pgEnum("presence_source", [
  "feylore-reader",
  "feylore-player",
  "integration",
]);

export const presenceSessions = pgTable(
  "presence_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: presenceKindEnum("kind").notNull(),
    workType: text("work_type").notNull(),
    workId: text("work_id").notNull(),
    expressionId: uuid("expression_id").references(
      () => creativeWorkExpressions.id,
      { onDelete: "set null" },
    ),
    manifestationId: uuid("manifestation_id").references(
      () => creativeWorkManifestations.id,
      { onDelete: "set null" },
    ),
    representationId: uuid("representation_id").references(
      () => representations.id,
      { onDelete: "set null" },
    ),
    source: presenceSourceEnum("source").notNull(),
    sourceInstance: text("source_instance"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastEngagedAt: timestamp("last_engaged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("presence_sessions_user_idx").on(t.userId, t.lastEngagedAt),
    index("presence_sessions_user_kind_idx").on(t.userId, t.kind),
    index("presence_sessions_user_work_idx").on(t.userId, t.workType, t.workId),
    index("presence_sessions_source_idx").on(t.source, t.sourceInstance),
    check(
      "presence_sessions_kind_check",
      sql`${t.workType} <> '' AND ${t.workId} <> ''`,
    ),
  ],
);

export const notificationTypes = pgTable("notification_types", {
  key: text("key").primaryKey(),
  labelKey: text("label_key").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  defaultEnabled: boolean("default_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userNotificationPreferences = pgTable(
  "user_notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    typeKey: text("type_key")
      .notNull()
      .references(() => notificationTypes.key, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.typeKey] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type")
      .notNull()
      .references(() => notificationTypes.key, { onDelete: "restrict" }),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    dedupeKey: text("dedupe_key"),
    aggregateKey: text("aggregate_key"),
    aggregatedCount: integer("aggregated_count").notNull().default(1),
    readAt: timestamp("read_at", { withTimezone: true }),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_recipient_dedupe_idx").on(
      t.recipientUserId,
      t.dedupeKey,
    ),
    index("notifications_recipient_created_idx").on(
      t.recipientUserId,
      t.createdAt,
    ),
    index("notifications_recipient_unread_idx")
      .on(t.recipientUserId)
      .where(isNull(t.readAt)),
  ],
);

// --- Challenges 1.0 (Foundation + Simple) ---
//
// Core challenge/objective tables are format-agnostic: many objectives per
// challenge are permitted at the database level so Bingo squares and Quest
// nodes can compose rule-backed objectives later. Simple enforces exactly
// one objective at the service layer, not here.

export const challengeFormatEnum = pgEnum("challenge_format", [
  "simple",
  "bingo",
  "quest",
]);

export const challengeVisibilityEnum = pgEnum("challenge_visibility", [
  "public",
  "private",
  "club",
]);

export const challengeJoinPolicyEnum = pgEnum("challenge_join_policy", [
  "open",
  "invite_only",
  "club_members",
]);

export const challengeStateEnum = pgEnum("challenge_state", [
  "draft",
  "upcoming",
  "active",
  "completed",
  "ended",
  "cancelled",
]);

export const challengeParticipantStateEnum = pgEnum(
  "challenge_participant_state",
  ["joined", "left", "completed"],
);

export const challenges = pgTable(
  "challenges",
  {
    id: uuid("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    format: challengeFormatEnum("format").notNull().default("simple"),
    creatorUserId: uuid("creator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clubId: uuid("club_id").references(() => clubs.id, {
      onDelete: "cascade",
    }),
    visibility: challengeVisibilityEnum("visibility")
      .notNull()
      .default("public"),
    joinPolicy: challengeJoinPolicyEnum("join_policy")
      .notNull()
      .default("open"),
    state: challengeStateEnum("state").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("challenges_creator_idx").on(t.creatorUserId),
    index("challenges_club_idx").on(t.clubId),
    index("challenges_state_idx").on(t.state),
    index("challenges_visibility_idx").on(t.visibility),
    check("challenges_date_order", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const challengeObjectives = pgTable(
  "challenge_objectives",
  {
    id: uuid("id").primaryKey(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    aggregation: jsonb("aggregation")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({ kind: "count" }),
    target: integer("target").notNull(),
    activity: text("activity").notNull().default("finish"),
    basis: text("basis").notNull().default("completed"),
    domains: jsonb("domains").$type<string[]>().notNull().default([]),
    rule: jsonb("rule").$type<Record<string, unknown>>(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("challenge_objectives_challenge_idx").on(t.challengeId),
    check("challenge_objectives_target", sql`${t.target} > 0`),
  ],
);

export const challengeParticipants = pgTable(
  "challenge_participants",
  {
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    state: challengeParticipantStateEnum("state").notNull().default("joined"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.challengeId, t.userId] }),
    index("challenge_participants_user_idx").on(t.userId),
    index("challenge_participants_challenge_state_idx").on(
      t.challengeId,
      t.state,
    ),
  ],
);

// --- Bingo 1.1 (board layer referencing objectives) ---
//
// One board per Bingo challenge, identical for every participant.
// Normal squares reference challenge_objectives rows; free spaces are a
// square type with a null objective — never fake auto-completed objectives.

export const bingoBoards = pgTable(
  "bingo_boards",
  {
    id: uuid("id").primaryKey(),
    challengeId: uuid("challenge_id")
      .notNull()
      .unique()
      .references(() => challenges.id, { onDelete: "cascade" }),
    size: integer("size").notNull(),
    victory: text("victory").notNull().default("line"),
    victoryLines: integer("victory_lines"),
    styleKey: text("style_key").notNull().default("default"),
    presentation: jsonb("presentation").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("bingo_boards_challenge_idx").on(t.challengeId),
    check("bingo_boards_size", sql`${t.size} IN (3, 4, 5)`),
    check(
      "bingo_boards_victory",
      sql`${t.victory} IN ('line', 'n_lines', 'blackout')`,
    ),
  ],
);

export const bingoSquares = pgTable(
  "bingo_squares",
  {
    id: uuid("id").primaryKey(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => bingoBoards.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    objectiveId: uuid("objective_id").references(() => challengeObjectives.id, {
      onDelete: "cascade",
    }),
    freeSpace: boolean("free_space").notNull().default(false),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bingo_squares_board_position_unique").on(
      t.boardId,
      t.position,
    ),
    uniqueIndex("bingo_squares_board_objective_unique")
      .on(t.boardId, t.objectiveId)
      .where(sql`${t.objectiveId} IS NOT NULL`),
    index("bingo_squares_board_idx").on(t.boardId),
    check(
      "bingo_squares_position",
      sql`${t.position} >= 0 AND ${t.position} < 25`,
    ),
  ],
);

// --- Quest 1.2 (graph layer referencing objectives) ---
//
// One graph per Quest challenge, identical for every participant.
// Objective nodes reference challenge_objectives rows; start / junction /
// finish nodes carry a null objective. Edges are prerequisite
// relationships inside one graph. Node position (x/y) is presentation
// only and never participates in progression rules.

export const questGraphs = pgTable(
  "quest_graphs",
  {
    id: uuid("id").primaryKey(),
    challengeId: uuid("challenge_id")
      .notNull()
      .unique()
      .references(() => challenges.id, { onDelete: "cascade" }),
    styleKey: text("style_key").notNull().default("default"),
    presentation: jsonb("presentation").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("quest_graphs_challenge_idx").on(t.challengeId)],
);

export const questNodes = pgTable(
  "quest_nodes",
  {
    id: uuid("id").primaryKey(),
    graphId: uuid("graph_id")
      .notNull()
      .references(() => questGraphs.id, { onDelete: "cascade" }),
    key: text("node_key").notNull(),
    kind: text("kind").notNull().default("objective"),
    label: text("label").notNull(),
    optional: boolean("optional").notNull().default(false),
    join: text("join").notNull().default("any"),
    posX: doublePrecision("pos_x").notNull().default(0),
    posY: doublePrecision("pos_y").notNull().default(0),
    objectiveId: uuid("objective_id").references(() => challengeObjectives.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("quest_nodes_graph_key_unique").on(t.graphId, t.key),
    uniqueIndex("quest_nodes_graph_objective_unique")
      .on(t.graphId, t.objectiveId)
      .where(sql`${t.objectiveId} IS NOT NULL`),
    index("quest_nodes_graph_idx").on(t.graphId),
    check(
      "quest_nodes_kind",
      sql`${t.kind} IN ('start', 'objective', 'junction', 'finish')`,
    ),
    check("quest_nodes_join", sql`${t.join} IN ('any', 'all')`),
  ],
);

export const questEdges = pgTable(
  "quest_edges",
  {
    id: uuid("id").primaryKey(),
    graphId: uuid("graph_id")
      .notNull()
      .references(() => questGraphs.id, { onDelete: "cascade" }),
    fromNodeId: uuid("from_node_id")
      .notNull()
      .references(() => questNodes.id, { onDelete: "cascade" }),
    toNodeId: uuid("to_node_id")
      .notNull()
      .references(() => questNodes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("quest_edges_graph_pair_unique").on(
      t.graphId,
      t.fromNodeId,
      t.toNodeId,
    ),
    index("quest_edges_graph_idx").on(t.graphId),
    index("quest_edges_from_idx").on(t.fromNodeId),
    index("quest_edges_to_idx").on(t.toNodeId),
    check("quest_edges_no_self", sql`${t.fromNodeId} <> ${t.toNodeId}`),
  ],
);

// --- Challenges 1.3 (invites) ---
//
// Challenge creators can invite specific users. Invite-only challenges
// gain an accept/decline flow; invited users can view and join. One row
// per (challenge, invitee) — a declined invite returns to pending when
// re-invited rather than manufacturing history.

export const challengeInvites = pgTable(
  "challenge_invites",
  {
    id: uuid("id").primaryKey(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    inviterUserId: uuid("inviter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteeUserId: uuid("invitee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("challenge_invites_challenge_invitee_unique").on(
      t.challengeId,
      t.inviteeUserId,
    ),
    index("challenge_invites_invitee_idx").on(t.inviteeUserId),
    index("challenge_invites_challenge_idx").on(t.challengeId),
    check(
      "challenge_invites_state",
      sql`${t.state} IN ('pending', 'accepted', 'declined')`,
    ),
    check(
      "challenge_invites_no_self",
      sql`${t.inviterUserId} <> ${t.inviteeUserId}`,
    ),
  ],
);
