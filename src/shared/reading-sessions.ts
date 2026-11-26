import { z } from "zod";
import type { ReadingLocator } from "./reading-progress.js";

export const READING_SESSION_STATUSES = [
  "pending",
  "qualified",
  "ended",
] as const;

export type ReadingSessionStatus = (typeof READING_SESSION_STATUSES)[number];

export const READING_SESSION_VISIBILITY = [
  "active",
  "hidden",
  "background",
] as const;

export type ReadingSessionVisibility =
  (typeof READING_SESSION_VISIBILITY)[number];

export const readingSessionPatchSchema = z.object({
  ended: z.boolean().optional(),
  endingLocator: z
    .object({
      type: z.string().optional(),
      href: z.string().optional(),
      cfi: z.string().optional(),
      progression: z.number().min(0).max(1).optional(),
      totalProgression: z.number().min(0).max(1).optional(),
      position: z.number().int().min(0).optional(),
      title: z.string().optional(),
    })
    .optional(),
});

export const readingSessionListQuerySchema = z.object({
  representationId: z.string().uuid().optional(),
  status: z.enum(READING_SESSION_STATUSES).optional(),
  qualifiedOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type ReadingSessionPublic = {
  id: string;
  representationId: string;
  startedAt: string;
  endedAt: string | null;
  activeDuration: number;
  startingLocator: ReadingLocator | null;
  endingLocator: ReadingLocator | null;
  deviceId: string | null;
  clientId: string | null;
  status: ReadingSessionStatus;
  qualifiedAt: string | null;
};
