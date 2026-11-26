import { z } from "zod";
import { readingLocatorSchema } from "./reading-progress.js";
import { playbackLocatorSchema } from "./playback.js";

export const readingProgressLocatorSchema = z.object({
  kind: z.literal("reading"),
}).merge(readingLocatorSchema);

export const progressLocatorSchema = z.discriminatedUnion("kind", [
  readingProgressLocatorSchema,
  playbackLocatorSchema,
]);

export type ProgressLocator = z.infer<typeof progressLocatorSchema>;

export function isReadingProgressLocator(
  locator: ProgressLocator | Record<string, unknown>,
): locator is z.infer<typeof readingProgressLocatorSchema> {
  return locator.kind === "reading" || !("kind" in locator);
}

export function isPlaybackProgressLocator(
  locator: ProgressLocator | Record<string, unknown>,
): locator is z.infer<typeof playbackLocatorSchema> {
  return locator.kind === "playback";
}

/** Normalize stored locator JSON (legacy reading locators omit `kind`). */
export function normalizeProgressLocator(
  raw: Record<string, unknown>,
): ProgressLocator {
  if (raw.kind === "playback") {
    return playbackLocatorSchema.parse(raw);
  }
  if (raw.kind === "reading") {
    const { kind, ...rest } = raw;
    void kind;
    return { kind: "reading", ...readingLocatorSchema.parse(rest) };
  }
  return { kind: "reading", ...readingLocatorSchema.parse(raw) };
}

export function toStoredReadingLocator(
  locator: z.infer<typeof readingLocatorSchema>,
): ProgressLocator {
  return { kind: "reading", ...locator };
}
