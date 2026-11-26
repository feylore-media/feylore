import { mediaLocationSchema } from "./media-location.js";
import { z } from "zod";
import type { WorkSubjectType } from "./subject.js";
import type { ProgressLocator } from "./progress-locator.js";
import { readingLocatorSchema, type ReadingLocator } from "./books.js";
import type { ProfileCosmetics } from "./profile-cosmetics.js";
import type {
  ClubPostBodyFormat,
  ClubPostBodySegment,
} from "./club-spoiler.js";

export type ClubVisibility = "private" | "public";
export type ClubContext = "general" | "book" | "video" | "ttrpg";
export type ClubMemberRole = "owner" | "moderator" | "member";
export type ClubInviteStatus = "pending" | "accepted" | "revoked" | "expired";
export type ClubTopicKind = "discussion" | "announcement";
export type ClubPostReaction = "like";
export type ClubWorkStatus = "current" | "queued" | "completed" | "associated";
export type ClubScheduleFrequency = "once" | "daily" | "weekly" | "monthly";
export type ClubScheduleTopicTiming =
  "at_scheduled_time" | "immediate" | "hours_before";
export type ClubScheduleStatus = "active" | "paused" | "completed";
export type ClubScheduleOccurrenceStatus =
  "upcoming" | "open" | "completed" | "skipped";

export type ConsumptionTarget =
  | { kind: "chapter"; start: number; increment?: number; count?: number }
  | {
      kind: "episode";
      start: number;
      end?: number;
      increment?: number;
      count?: number;
    }
  | { kind: "page"; start: number; end?: number; increment?: number }
  | { kind: "custom"; label: string };

export const CLUB_WORK_SUBJECT_TYPES_BY_CONTEXT: Record<
  ClubContext,
  readonly WorkSubjectType[]
> = {
  general: ["book", "show", "movie", "ttrpg"],
  book: ["book"],
  video: ["show", "movie"],
  ttrpg: ["ttrpg"],
};

export type ClubFeedItemType =
  "topic_created" | "post_created" | "member_joined";

export interface ClubPublic {
  id: string;
  name: string;
  description: string | null;
  coverFileId: string | null;
  visibility: ClubVisibility;
  context: ClubContext;
  ownerUserId: string;
  memberCount: number;
  isMember?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClubListItem extends ClubPublic {
  /**
   * Discussion/member activity timestamp; null when no qualifying activity exists.
   * V1: topic discussion activity and non-owner member joins only.
   * Does not yet include reactions, reading progress, or schedule events.
   */
  lastActivityAt: string | null;
  currentWork: Pick<ClubWorkSummary, "title" | "href"> | null;
  canJoin: boolean;
  hasUnreadActivity: boolean;
}

export interface ClubMember {
  userId: string;
  username: string;
  displayName: string;
  role: ClubMemberRole;
  joinedAt: string;
  cosmetics?: ProfileCosmetics | null;
}

export interface ClubInvitePublic {
  id: string;
  clubId: string;
  inviteeUserId: string;
  inviteeUsername: string;
  inviteeDisplayName: string;
  status: ClubInviteStatus;
  expiresAt: string;
  createdAt: string;
  inviteeCosmetics?: ProfileCosmetics | null;
}

export interface ClubDetail {
  club: ClubPublic;
  members: ClubMember[];
  currentWork: ClubWorkSummary | null;
  canEdit: boolean;
  canModerate: boolean;
  canAdmin: boolean;
  isMember: boolean;
  canJoin: boolean;
  selectionDefaults?: import("./club-selection.js").ClubSelectionDefaults;
  readDefaults?: { durationDays: number | null };
}

export interface ClubWorkSummary {
  id: string;
  workSubjectType: WorkSubjectType;
  workSubjectId: string;
  status: ClubWorkStatus;
  sortOrder: number;
  title: string;
  coverFileId: string | null;
  href: string;
  addedAt: string;
}

/** Viewer-scoped current work with optional metadata when reliably available. */
export interface ClubWorkDetail extends ClubWorkSummary {
  subtitle?: string;
  progressLabel?: string;
  progressPercent?: number;
}

export interface ClubCheckInSummary {
  /** Active check-in target; null when between check-in periods. */
  target: ClubScheduleOccurrence | null;
  lastCheckIn: ClubScheduleOccurrence | null;
  nextCheckIn: ClubScheduleOccurrence | null;
  /** Check-in counts for `target`, or `lastCheckIn` when target is null. */
  displayOccurrenceId: string | null;
  checkedInCount: number;
  memberCount: number;
  viewerCheckedIn: boolean;
}

export type ClubDiscussionAnchorEmphasis =
  "current" | "last_check_in" | "recent" | null;

/** Schedule occurrence as a discussion anchor; not the same as a topic. */
export interface ClubDiscussionAnchor {
  /** Stable anchor identity — the schedule occurrence id. */
  id: string;
  occurrenceId: string;
  consumption: ConsumptionTarget;
  label: string;
  topicId: string | null;
  messageCount: number;
  lastActivityAt: string | null;
  emphasis: ClubDiscussionAnchorEmphasis;
}

export interface ClubGeneralDiscussion {
  topicId: string;
  title: string;
  kind: ClubTopicKind;
  messageCount: number;
  lastActivityAt: string;
  pinned: boolean;
}

export interface ClubDiscussionAnchorsPage {
  anchors: ClubDiscussionAnchor[];
}

export interface ClubDiscussionAnchorsAll {
  anchors: ClubDiscussionAnchor[];
  general: ClubGeneralDiscussion[];
}

export interface ClubWork extends ClubWorkSummary {
  addedByUserId: string;
  updatedAt: string;
}

export interface ClubSchedule {
  id: string;
  clubId: string;
  clubWorkId: string | null;
  clubReadId?: string | null;
  title: string;
  frequency: ClubScheduleFrequency;
  interval: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  timezone: string;
  startsAt: string;
  endsAt: string | null;
  maxOccurrences: number | null;
  consumption: ConsumptionTarget;
  topicTitleTemplate: string;
  topicBodyTemplate: string;
  topicTiming: ClubScheduleTopicTiming;
  hoursBefore: number | null;
  autoCreateTopic: boolean;
  status: ClubScheduleStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClubScheduleOccurrence {
  id: string;
  scheduleId: string | null;
  clubReadId?: string | null;
  clubId: string;
  workSubjectType: WorkSubjectType | null;
  workSubjectId: string | null;
  scheduledAt: string;
  opensAt: string;
  consumption: ConsumptionTarget;
  consumptionLabel: string;
  title: string;
  topicId: string | null;
  status: ClubScheduleOccurrenceStatus;
  sequenceNumber: number;
}

export interface ClubScheduleView {
  current: ClubScheduleOccurrence | null;
  upcoming: ClubScheduleOccurrence[];
  past: ClubScheduleOccurrence[];
}

export interface ClubMention {
  userId: string;
  username: string;
  displayName: string;
  cosmetics?: ProfileCosmetics | null;
}

export interface ClubReactionSummary {
  reaction: ClubPostReaction;
  count: number;
  viewerReacted: boolean;
}

export interface ClubTopic {
  clubReadId?: string | null;
  locationLabel?: string;
  locked?: boolean;
  unread?: boolean;
  id: string;
  clubId: string;
  authorUserId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorCosmetics?: ProfileCosmetics | null;
  kind: ClubTopicKind;
  title: string;
  body: string;
  bodyFormat: ClubPostBodyFormat;
  segments?: ClubPostBodySegment[];
  autoHidden?: boolean;
  autoHiddenReason?: string | null;
  workSubjectType: WorkSubjectType | null;
  workSubjectId: string | null;
  scheduleOccurrenceId: string | null;
  pinned: boolean;
  closed: boolean;
  replyCount: number;
  mentions: ClubMention[];
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClubPost {
  id: string;
  topicId: string;
  authorUserId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorCosmetics?: ProfileCosmetics | null;
  body: string;
  bodyFormat: ClubPostBodyFormat;
  segments?: ClubPostBodySegment[];
  autoHidden?: boolean;
  autoHiddenReason?: string | null;
  deleted: boolean;
  mentions: ClubMention[];
  reactions: ClubReactionSummary[];
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClubTopicDetail {
  readTitle?: string | null;
  readerHref?: string | null;
  topic: ClubTopic;
  posts: ClubPost[];
  nextCursor?: string;
  canReply: boolean;
  canModerate: boolean;
  viewerProgress: ProgressLocator | null;
  anchorConsumption: ConsumptionTarget | null;
}

export interface ClubFeedItem {
  id: string;
  type: ClubFeedItemType;
  actorUserId: string;
  actorUsername: string;
  actorDisplayName: string;
  actorCosmetics?: ProfileCosmetics | null;
  summary: string;
  topicId?: string;
  topicTitle?: string;
  topicKind?: ClubTopicKind;
  postId?: string;
  createdAt: string;
}

export interface ClubFeedPage {
  items: ClubFeedItem[];
  nextCursor?: string;
}

export type ClubPollStatus = "draft" | "active" | "closed" | "applied";
export type ClubPollDiscoverySource =
  "tbr" | "club_queued" | "manual" | "library";

export interface ClubPollOptionPublic {
  id: string;
  workSubjectType: WorkSubjectType;
  workSubjectId: string;
  title: string;
  coverFileId: string | null;
  href: string;
  source: ClubPollDiscoverySource;
  tbrMemberCount: number | null;
  voteCount: number;
  sortOrder: number;
  removed: boolean;
  viewerVoted: boolean;
}

export interface ClubPollPublic {
  id: string;
  clubId: string;
  title: string;
  status: ClubPollStatus;
  options: ClubPollOptionPublic[];
  totalVotes: number;
  viewerVoteOptionId: string | null;
  winningOptionId: string | null;
  createdAt: string;
  publishedAt: string | null;
  closedAt: string | null;
  appliedAt: string | null;
}

export interface ClubQuotePublic {
  clubReadId?: string | null;
  locationLabel?: string;
  locked?: boolean;
  canUnshare?: boolean;
  id: string;
  clubId: string;
  authorUserId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorCosmetics?: ProfileCosmetics | null;
  workSubjectType: WorkSubjectType;
  workSubjectId: string;
  text: string;
  sourceAnnotationId: string | null;
  locator: ReadingLocator | null;
  createdAt: string;
}

export interface ClubQuoteShareableAnnotation {
  id: string;
  highlightText: string | null;
  note: string | null;
  locator: ReadingLocator;
  previewText: string;
  alreadyShared: boolean;
}

export interface ClubQuotesPage {
  quotes: ClubQuotePublic[];
}

export interface ClubOverview {
  checkIn: ClubCheckInSummary;
  work: ClubWorkDetail | null;
  discussionAnchors: ClubDiscussionAnchor[];
  activePoll: ClubPollPublic | null;
  quotes: ClubQuotePublic[];
  viewerProgress: ProgressLocator | null;
}

const clubBodySchema = z.string().min(1).max(10_000);

export const createClubSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  visibility: z.enum(["private", "public"]).default("private"),
  context: z.enum(["general", "book", "video", "ttrpg"]).default("general"),
});

export const updateClubSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  visibility: z.enum(["private", "public"]).optional(),
  context: z.enum(["general", "book", "video", "ttrpg"]).optional(),
  coverFileId: z.string().uuid().nullable().optional(),
});
export const clubReadDefaultsSchema = z.object({
  durationDays: z.number().int().min(1).max(365).nullable().default(null),
});
export type ClubReadDefaults = z.infer<typeof clubReadDefaultsSchema>;

export const createClubInviteSchema = z
  .object({
    userId: z.string().uuid().optional(),
    username: z.string().min(2).optional(),
  })
  .refine((data) => data.userId || data.username, {
    message: "userId or username is required",
  });

export const updateClubMemberRoleSchema = z.object({
  role: z.enum(["moderator", "member"]),
});

export const createClubTopicSchema = z.object({
  kind: z.enum(["discussion", "announcement"]),
  title: z.string().min(1).max(300),
  body: clubBodySchema,
  bodyFormat: z.enum(["plain", "structured"]).optional(),
  clubReadId: z.string().uuid().optional(),
  mediaLocation: mediaLocationSchema.optional(),
  sharedQuoteId: z.string().uuid().optional(),
  sourceAnnotationId: z.string().uuid().optional(),
  readerLocator: readingLocatorSchema.optional(),
});

export const updateClubTopicSchema = z
  .object({
    pinned: z.boolean().optional(),
    closed: z.boolean().optional(),
  })
  .refine((data) => data.pinned !== undefined || data.closed !== undefined, {
    message: "At least one of pinned or closed is required",
  });

export const createClubPostSchema = z.object({
  body: clubBodySchema,
  bodyFormat: z.enum(["plain", "structured"]).optional(),
});

export const createClubPollSchema = z.object({
  title: z.string().min(1).max(300).default("What's next?"),
});

export const addClubPollOptionSchema = z.object({
  workSubjectType: z.enum(["book", "show", "movie", "ttrpg"]),
  workSubjectId: z.string().min(1),
});

export const voteClubPollSchema = z.object({
  optionId: z.string().uuid(),
});

export const createClubQuoteSchema = z
  .object({
    text: z.string().min(1).max(5000).optional(),
    sourceAnnotationId: z.string().uuid().optional(),
    clubReadId: z.string().uuid().optional(),
    mediaLocation: mediaLocationSchema.optional(),
    readerLocator: readingLocatorSchema.optional(),
  })
  .refine((data) => data.text || data.sourceAnnotationId, {
    message: "text or sourceAnnotationId is required",
  });

export const setClubReactionSchema = z.object({
  reaction: z.enum(["like"]).default("like"),
});

const consumptionTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chapter"),
    start: z.number().int().min(1),
    increment: z.number().int().min(1).optional(),
    count: z.number().int().min(1).optional(),
  }),
  z.object({
    kind: z.literal("episode"),
    start: z.number().int().min(1),
    end: z.number().int().min(1).optional(),
    increment: z.number().int().min(1).optional(),
    count: z.number().int().min(1).optional(),
  }),
  z.object({
    kind: z.literal("page"),
    start: z.number().int().min(1),
    end: z.number().int().min(1).optional(),
    increment: z.number().int().min(1).optional(),
  }),
  z.object({
    kind: z.literal("custom"),
    label: z.string().min(1).max(500),
  }),
]);

export const createClubWorkSchema = z.object({
  workSubjectType: z.enum(["book", "show", "movie", "ttrpg"]),
  workSubjectId: z.string().min(1),
  status: z
    .enum(["current", "queued", "completed", "associated"])
    .default("associated"),
  demoteCurrentTo: z.enum(["associated", "completed"]).optional(),
});

export const updateClubWorkSchema = z
  .object({
    status: z.enum(["current", "queued", "completed", "associated"]).optional(),
    sortOrder: z.number().int().min(0).optional(),
    demoteCurrentTo: z.enum(["associated", "completed"]).optional(),
  })
  .refine((data) => data.status !== undefined || data.sortOrder !== undefined, {
    message: "At least one field is required",
  });

export const createClubScheduleSchema = z.object({
  clubReadId: z.string().uuid().nullable().optional(),
  clubWorkId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(300),
  eventKind: z.enum(["checkin", "final_discussion"]).default("checkin"),
  frequency: z.enum(["once", "daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(365).default(1),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  timeOfDay: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("19:00"),
  timezone: z.string().min(1).max(100).default("UTC"),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
  consumption: consumptionTargetSchema,
  topicTitleTemplate: z.string().min(1).max(500).optional(),
  topicBodyTemplate: z.string().min(1).max(10_000).optional(),
  topicTiming: z
    .enum(["at_scheduled_time", "immediate", "hours_before"])
    .default("at_scheduled_time"),
  hoursBefore: z.number().int().min(1).max(168).optional(),
  autoCreateTopic: z.boolean().default(true),
});

export const updateClubScheduleSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    status: z.enum(["active", "paused", "completed"]).optional(),
    endsAt: z.string().datetime().nullable().optional(),
    maxOccurrences: z.number().int().min(1).nullable().optional(),
    topicTitleTemplate: z.string().min(1).max(500).optional(),
    topicBodyTemplate: z.string().min(1).max(10_000).optional(),
    autoCreateTopic: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export function formatConsumptionLabel(consumption: ConsumptionTarget): string {
  switch (consumption.kind) {
    case "chapter": {
      const count = consumption.count ?? 1;
      const start = consumption.start;
      if (count === 1) return `Chapter ${start}`;
      return `Chapters ${start}–${start + count - 1}`;
    }
    case "episode": {
      const end = consumption.end;
      if (end && end !== consumption.start) {
        return `Episodes ${consumption.start}–${end}`;
      }
      const count = consumption.count ?? 1;
      const start = consumption.start;
      if (count === 1) return `Episode ${start}`;
      return `Episodes ${start}–${start + count - 1}`;
    }
    case "page": {
      const end = consumption.end;
      if (end && end !== consumption.start) {
        return `Pages ${consumption.start}–${end}`;
      }
      return `Page ${consumption.start}`;
    }
    case "custom":
      return consumption.label;
  }
}

export function applyScheduleTemplate(
  template: string,
  vars: { date: string; consumptionLabel: string; title: string },
): string {
  return template
    .replaceAll("{{date}}", vars.date)
    .replaceAll("{{consumptionLabel}}", vars.consumptionLabel)
    .replaceAll("{{title}}", vars.title);
}

export { extractMentionUsernames } from "./username.js";
