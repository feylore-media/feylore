export const NOTIFICATION_TYPES = {
  SYSTEM_ANNOUNCEMENT: "system.announcement",
  CLUB_MENTION: "club.mention",
  ACHIEVEMENT_EARNED: "achievement.earned",
  CHALLENGE_INVITED: "challenge.invited",
  CHALLENGE_STARTED: "challenge.started",
  CHALLENGE_MILESTONE: "challenge.milestone",
  CHALLENGE_COMPLETED: "challenge.completed",
  CHALLENGE_ENDING_SOON: "challenge.ending_soon",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export type NotificationCategory = "system" | "club" | "library" | "social";

/** Display order for category-grouped settings/type lists. */
export const NOTIFICATION_CATEGORY_ORDER: NotificationCategory[] = [
  "system",
  "club",
  "library",
  "social",
];

export interface NotificationTypeDefinition {
  key: NotificationType;
  /** Compact row label (i18n key under the `notifications` namespace). */
  labelKey: string;
  /** Settings-list name (i18n key under the `notifications` namespace). */
  nameKey: string;
  category: NotificationCategory;
  /** User-facing description shown in settings; also seeded into the DB. */
  description: string;
  /** Used when the user has not expressed a preference for this type. */
  defaultEnabled: boolean;
  /**
   * Reserved for truly critical types. Mandatory types are delivered even
   * while the recipient has notifications paused. Defaults to false; no
   * current type is mandatory.
   */
  mandatory?: boolean;
}

export const NOTIFICATION_TYPE_CATALOG: Record<
  NotificationType,
  NotificationTypeDefinition
> = {
  [NOTIFICATION_TYPES.CLUB_MENTION]: {
    key: NOTIFICATION_TYPES.CLUB_MENTION,
    labelKey: "typeClubMention",
    nameKey: "typeClubMentionName",
    category: "club",
    description: "Someone mentioned you in a club discussion.",
    defaultEnabled: true,
  },
  [NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT]: {
    key: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
    labelKey: "typeSystem",
    nameKey: "typeSystemName",
    category: "system",
    description: "Important announcements from your Feylore administrator.",
    defaultEnabled: true,
  },
  [NOTIFICATION_TYPES.ACHIEVEMENT_EARNED]: {
    key: NOTIFICATION_TYPES.ACHIEVEMENT_EARNED,
    labelKey: "typeAchievementEarned",
    nameKey: "typeAchievementEarnedName",
    category: "social",
    description: "You earned a new achievement.",
    defaultEnabled: true,
  },
  [NOTIFICATION_TYPES.CHALLENGE_INVITED]: {
    key: NOTIFICATION_TYPES.CHALLENGE_INVITED,
    labelKey: "typeChallengeInvited",
    nameKey: "typeChallengeInvitedName",
    category: "social",
    description: "Someone invited you to a challenge.",
    defaultEnabled: true,
  },
  [NOTIFICATION_TYPES.CHALLENGE_STARTED]: {
    key: NOTIFICATION_TYPES.CHALLENGE_STARTED,
    labelKey: "typeChallengeStarted",
    nameKey: "typeChallengeStartedName",
    category: "social",
    description: "A challenge you joined has started.",
    defaultEnabled: true,
  },
  [NOTIFICATION_TYPES.CHALLENGE_MILESTONE]: {
    key: NOTIFICATION_TYPES.CHALLENGE_MILESTONE,
    labelKey: "typeChallengeMilestone",
    nameKey: "typeChallengeMilestoneName",
    category: "social",
    description: "Milestones in challenges you joined.",
    defaultEnabled: true,
  },
  [NOTIFICATION_TYPES.CHALLENGE_COMPLETED]: {
    key: NOTIFICATION_TYPES.CHALLENGE_COMPLETED,
    labelKey: "typeChallengeCompleted",
    nameKey: "typeChallengeCompletedName",
    category: "social",
    description: "You completed a challenge.",
    defaultEnabled: true,
  },
  [NOTIFICATION_TYPES.CHALLENGE_ENDING_SOON]: {
    key: NOTIFICATION_TYPES.CHALLENGE_ENDING_SOON,
    labelKey: "typeChallengeEndingSoon",
    nameKey: "typeChallengeEndingSoonName",
    category: "social",
    description: "A challenge you joined ends soon.",
    defaultEnabled: true,
  },
};

export const NOTIFICATION_TYPE_LIST: NotificationTypeDefinition[] =
  Object.values(NOTIFICATION_TYPE_CATALOG);

/** Stable guard for runtime values that should be a known notification type. */
export function isNotificationType(value: string): value is NotificationType {
  return value in NOTIFICATION_TYPE_CATALOG;
}

export interface NotificationPublic {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  subjectType: string | null;
  subjectId: string | null;
  /** 1 when the notification stands alone; >1 when it aggregates. */
  aggregatedCount: number;
  readAt: string | null;
  seenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsListResponse {
  items: NotificationPublic[];
  nextCursor: string | null;
}

export interface NotificationsPreviewResponse {
  notifications: NotificationPublic[];
  unreadCount: number;
  hasMore: boolean;
}

export interface NotificationPreferencePublic {
  type: NotificationType;
  category: NotificationCategory;
  /** In-app toggle. Defaults to the catalog default when unset. */
  enabled: boolean;
  /**
   * Email toggle. Defaults to false when unset. Only meaningful when the
   * server has a delivery channel configured (see `emailAvailable`).
   */
  emailEnabled: boolean;
}

/**
 * Per-type change. Both fields are optional so a single PATCH can toggle the
 * In-app channel without touching the email channel and vice-versa.
 */
export interface NotificationPreferenceUpdate {
  type: NotificationType;
  enabled?: boolean;
  emailEnabled?: boolean;
}

/** User state and persistence-ready fields for a user's settings. */
export interface NotificationSettingsBase {
  preferences: NotificationPreferencePublic[];
  paused: boolean;
}

/**
 * Full per-user delivery settings: channel-agnostic type toggles plus pause.
 * `emailAvailable` is server capability (SMTP configured), not user state.
 */
export interface NotificationSettingsPublic extends NotificationSettingsBase {
  emailAvailable: boolean;
}

/** Partial update; at least one field is required. */
export interface NotificationSettingsUpdate {
  preferences?: NotificationPreferenceUpdate[];
  paused?: boolean;
}
