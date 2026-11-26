import { z } from "zod";

export const locatorTextSchema = z.object({
  before: z.string().optional(),
  highlight: z.string().optional(),
  after: z.string().optional(),
});

export type LocatorText = z.infer<typeof locatorTextSchema>;

export const readingLocatorSchema = z.object({
  type: z.string().default("epub-cfi"),
  href: z.string().optional(),
  cfi: z.string().optional(),
  progression: z.number().min(0).max(1).optional(),
  totalProgression: z.number().min(0).max(1).optional(),
  position: z.number().int().min(0).optional(),
  title: z.string().optional(),
  locatorText: locatorTextSchema.optional(),
  displayPage: z.number().int().min(0).optional(),
  displayTotalPages: z.number().int().min(0).optional(),
});

export type ReadingLocator = z.infer<typeof readingLocatorSchema>;

export const READING_COMPLETION_THRESHOLD = 0.99;

export const READING_COMPLETION_SOURCES = [
  "client",
  "locator",
  "manual",
] as const;

export type ReadingCompletionSource =
  (typeof READING_COMPLETION_SOURCES)[number];

export const readingProgressUpdateSchema = z.object({
  locator: readingLocatorSchema,
  representationId: z.string().uuid().optional(),
  clientUpdatedAt: z.string().datetime({ offset: true }).optional(),
  deviceId: z.string().uuid().optional(),
  clientId: z.string().min(1).max(128).optional(),
  idempotencyKey: z.string().min(1).max(256).optional(),
  completed: z.boolean().optional(),
});

export type ReadingProgressUpdate = z.infer<typeof readingProgressUpdateSchema>;

export const readingProgressQuerySchema = z.object({
  representationId: z.string().uuid().optional(),
  workType: z.string().min(1).optional(),
  workId: z.string().min(1).optional(),
});

export type ReadingProgressPublic = {
  representationId: string;
  workType: string;
  workId: string;
  locator: ReadingLocator;
  version: number;
  startedAt: string;
  updatedAt: string;
  clientUpdatedAt: string | null;
  completedAt: string | null;
  completionSource: ReadingCompletionSource | null;
  lastDeviceId: string | null;
  lastClientId: string | null;
  totalProgression: number | null;
};

export function deriveTotalProgression(
  locator: ReadingLocator,
): number | null {
  if (locator.totalProgression != null) return locator.totalProgression;
  if (locator.progression != null) return locator.progression;
  return null;
}

export function locatorCompletenessScore(locator: ReadingLocator): number {
  let score = 0;
  if (locator.href) score += 1;
  if (locator.cfi) score += 4;
  if (locator.progression != null) score += 2;
  if (locator.position != null) score += 1;
  if (locator.locatorText) score += 1;
  return score;
}

export function mergeReadingLocators(
  existing: ReadingLocator,
  incoming: ReadingLocator,
): ReadingLocator {
  return {
    type: incoming.type ?? existing.type,
    href: incoming.href ?? existing.href,
    cfi: incoming.cfi ?? existing.cfi,
    progression: incoming.progression ?? existing.progression,
    totalProgression: incoming.totalProgression ?? existing.totalProgression,
    position: incoming.position ?? existing.position,
    title: incoming.title ?? existing.title,
    locatorText: incoming.locatorText ?? existing.locatorText,
    displayPage: incoming.displayPage ?? existing.displayPage,
    displayTotalPages:
      incoming.displayTotalPages ?? existing.displayTotalPages,
  };
}

export function resolveReadingCompletion(
  locator: ReadingLocator,
  completed?: boolean,
): { completed: boolean; source: ReadingCompletionSource | null } {
  if (completed === true) {
    return { completed: true, source: "client" };
  }
  if (completed === false) {
    return { completed: false, source: null };
  }
  const progression = deriveTotalProgression(locator);
  if (progression != null && progression >= READING_COMPLETION_THRESHOLD) {
    return { completed: true, source: "locator" };
  }
  return { completed: false, source: null };
}
