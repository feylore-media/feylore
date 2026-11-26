import { z } from "zod";

export const PRESENCE_KINDS = ["reading", "listening", "watching"] as const;
export type PresenceKind = (typeof PRESENCE_KINDS)[number];

export const PRESENCE_SOURCES = [
  "feylore-reader",
  "feylore-player",
  "integration",
] as const;
export type PresenceSource = (typeof PRESENCE_SOURCES)[number];

export const PRESENCE_VISIBILITY = ["private", "friends", "public"] as const;
export type PresenceVisibility = (typeof PRESENCE_VISIBILITY)[number];

export const presenceMetadataSchema = z
  .object({
    progressPercent: z.number().min(0).max(100).optional(),
    chapterTitle: z.string().max(300).optional(),
    locator: z.record(z.unknown()).optional(),
    remainingSeconds: z.number().min(0).optional(),
    episodeWorkId: z.string().min(1).optional(),
  })
  .passthrough();

export type PresenceMetadata = z.infer<typeof presenceMetadataSchema>;

export const presenceStartSchema = z.object({
  kind: z.enum(PRESENCE_KINDS),
  workType: z.string().min(1).max(64),
  workId: z.string().min(1).max(64),
  expressionId: z.string().uuid().optional(),
  manifestationId: z.string().uuid().optional(),
  representationId: z.string().uuid().optional(),
  source: z.enum(PRESENCE_SOURCES),
  sourceInstance: z.string().max(256).optional(),
  metadata: presenceMetadataSchema.optional(),
});

export type PresenceStartInput = z.infer<typeof presenceStartSchema>;

export const presenceTouchSchema = z.object({
  sessionId: z.string().uuid(),
  metadata: presenceMetadataSchema.optional(),
});

export const presenceHeartbeatSchema = z.object({
  sessionId: z.string().uuid(),
  metadata: presenceMetadataSchema.optional(),
});

export const presenceEndSchema = z.object({
  sessionId: z.string().uuid(),
});

export const presenceSessionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(PRESENCE_KINDS),
  workType: z.string(),
  workId: z.string(),
  expressionId: z.string().nullable().optional(),
  manifestationId: z.string().nullable().optional(),
  representationId: z.string().nullable().optional(),
  source: z.enum(PRESENCE_SOURCES),
  sourceInstance: z.string().nullable().optional(),
  startedAt: z.string(),
  lastEngagedAt: z.string(),
  lastHeartbeatAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  metadata: presenceMetadataSchema.optional(),
});

export type PresenceSession = z.infer<typeof presenceSessionSchema>;

/** Resolved display presence. Work title/cover resolved server-side from library. */
export const presenceViewSchema = z.object({
  kind: z.enum(PRESENCE_KINDS),
  sessionId: z.string().uuid(),
  workType: z.string(),
  workId: z.string(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  /** "live" while reader open / media playing; "recent" for aged reading. */
  liveness: z.enum(["live", "recent"]),
  lastEngagedAt: z.string(),
  metadata: presenceMetadataSchema.optional(),
});

export type PresenceView = z.infer<typeof presenceViewSchema>;

export const presencePolicySchema = z.object({
  enabled: z.boolean(),
  readingRecencyHours: z.number().min(1).max(24 * 30),
  playbackDisconnectMinutes: z.number().min(1).max(60),
  pausedPlaybackGraceMinutes: z.number().min(1).max(120),
});

export type PresencePolicy = z.infer<typeof presencePolicySchema>;

export const DEFAULT_PRESENCE_POLICY: PresencePolicy = {
  enabled: true,
  readingRecencyHours: 48,
  playbackDisconnectMinutes: 2,
  pausedPlaybackGraceMinutes: 5,
};

export const presencePolicyUpdateSchema = presencePolicySchema.partial();

export const presencePreferencesSchema = z.object({
  enabled: z.boolean(),
  visibility: z.enum(PRESENCE_VISIBILITY),
  readerEnabled: z.boolean(),
  playerEnabled: z.boolean(),
});

export type PresencePreferences = z.infer<typeof presencePreferencesSchema>;

export const DEFAULT_PRESENCE_PREFERENCES: PresencePreferences = {
  enabled: true,
  visibility: "private",
  readerEnabled: true,
  playerEnabled: true,
};

export const presencePreferencesUpdateSchema = presencePreferencesSchema.partial();
