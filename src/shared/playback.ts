import { z } from "zod";
import { SUBJECT_TYPES, type SubjectRef } from "./subject.js";

export const PLAYBACK_MEDIA_KINDS = ["audio", "video"] as const;
export type PlaybackMediaKind = (typeof PLAYBACK_MEDIA_KINDS)[number];

export const subjectRefSchema = z.object({
  type: z.enum(SUBJECT_TYPES),
  id: z.string().min(1),
}) satisfies z.ZodType<SubjectRef>;

export const PLAYBACK_STATUSES = [
  "idle",
  "loading",
  "playing",
  "paused",
  "ended",
  "error",
] as const;
export type PlaybackStatus = (typeof PLAYBACK_STATUSES)[number];

/** Temporal position stored in user_progress for listening/watching. */
export const playbackLocatorSchema = z.object({
  kind: z.literal("playback"),
  positionSeconds: z.number().min(0),
  durationSeconds: z.number().min(0).optional(),
  trackIndex: z.number().int().min(0).optional(),
  chapterId: z.string().optional(),
  completed: z.boolean().optional(),
});

export type PlaybackLocator = z.infer<typeof playbackLocatorSchema>;

export const PLAYBACK_COMPLETION_THRESHOLD = 0.97;

export function isPlaybackComplete(
  positionSeconds: number,
  durationSeconds?: number | null,
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false;
  return positionSeconds / durationSeconds >= PLAYBACK_COMPLETION_THRESHOLD;
}

/** Resume position; returns 0 when item was completed. */
export function resolvePlaybackResumePosition(
  locator: PlaybackLocator | null | undefined,
): number {
  if (!locator) return 0;
  if (locator.completed) return 0;
  if (
    locator.durationSeconds &&
    isPlaybackComplete(locator.positionSeconds, locator.durationSeconds)
  ) {
    return 0;
  }
  return locator.positionSeconds;
}

export const playbackSourceSchema = z.object({
  fileId: z.string().min(1),
  url: z.union([
    z.string().startsWith("/api/v1/"),
    z.string().url(),
  ]),
  mimeType: z.string().optional(),
  durationSeconds: z.number().min(0).optional(),
});

export type PlaybackSource = z.infer<typeof playbackSourceSchema>;

export const PLAYBACK_SESSION_MODES = ["ephemeral", "persistent"] as const;
export type PlaybackSessionMode = (typeof PLAYBACK_SESSION_MODES)[number];

export const playbackManifestSchema = z.object({
  subject: subjectRefSchema,
  representationId: z.string().uuid(),
  title: z.string(),
  subtitle: z.string().optional(),
  artworkUrl: z.string().url().optional(),
  mediaKind: z.enum(PLAYBACK_MEDIA_KINDS),
  sources: z.array(playbackSourceSchema).min(1),
  sessionMode: z.enum(PLAYBACK_SESSION_MODES).default("ephemeral"),
});

export type PlaybackManifest = z.infer<typeof playbackManifestSchema>;

/** Client queue item — extends manifest with a client-generated queue id. */
export const playbackItemSchema = playbackManifestSchema.extend({
  id: z.string().min(1),
});

export type PlaybackItem = z.infer<typeof playbackItemSchema>;

export const playbackProgressQuerySchema = z.object({
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
});

export const playbackProgressUpdateSchema = z.object({
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
  locator: playbackLocatorSchema,
  representationId: z.string().uuid().optional(),
});

export type PlaybackProgressUpdate = z.infer<
  typeof playbackProgressUpdateSchema
>;

export const playbackHistoryQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const PLAYBACK_HISTORY_EVENT_TYPES = {
  LISTENING_STARTED: "listening_started",
  LISTENING_PROGRESS_UPDATED: "listening_progress_updated",
  LISTENING_FINISHED: "listening_finished",
} as const;

export type PlaybackHistoryEventType =
  (typeof PLAYBACK_HISTORY_EVENT_TYPES)[keyof typeof PLAYBACK_HISTORY_EVENT_TYPES];
