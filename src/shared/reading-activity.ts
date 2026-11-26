import { z } from "zod";
import { readingLocatorSchema } from "./reading-progress.js";
import { READING_SESSION_VISIBILITY } from "./reading-sessions.js";

export const readingActivityCreateSchema = z.object({
  locator: readingLocatorSchema,
  startedAt: z.string().datetime({ offset: true }).optional(),
  duration: z.number().min(0),
  deviceId: z.string().uuid().optional(),
  clientId: z.string().min(1).max(128).optional(),
  idempotencyKey: z.string().min(1).max(256).optional(),
  visibility: z.enum(READING_SESSION_VISIBILITY).optional(),
});

export const readingActivityListQuerySchema = z.object({
  representationId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export type ReadingActivityPublic = {
  id: string;
  representationId: string;
  sessionId: string | null;
  locator: z.infer<typeof readingLocatorSchema>;
  startedAt: string;
  duration: number;
  deviceId: string | null;
  clientId: string | null;
};

export type ReadingActivityCreateResult = {
  activityId: string;
  sessionId: string;
  sessionStatus: string;
  sessionActiveDuration: number;
};
