import { z } from "zod";
import type { ConsumptionTarget } from "./clubs.js";
import type { ProgressLocator } from "./progress-locator.js";
import {
  isPlaybackProgressLocator,
  isReadingProgressLocator,
} from "./progress-locator.js";

export type ClubPostBodyFormat = "plain" | "structured";

export type ClubPostBodySegment =
  | { type: "text"; text: string }
  | { type: "spoiler"; text: string };

export type ConsumptionProgressComparison = "before" | "at_or_after" | "unknown";

export interface ViewerConsumptionContext {
  progress: ProgressLocator | null;
  tvContinue?: { seasonNumber: number; episodeNumber: number } | null;
}

export const clubPostBodySegmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("spoiler"), text: z.string() }),
]);

export const clubPostBodySegmentsSchema = z
  .array(clubPostBodySegmentSchema)
  .min(1)
  .refine(
    (segments) => segmentsToPlainText(segments).length >= 1,
    "Body must not be empty",
  )
  .refine(
    (segments) => segmentsToPlainText(segments).length <= 10_000,
    "Body exceeds maximum length",
  );

const DISCORD_SPOILER_PATTERN = /\|\|([\s\S]*?)\|\|/g;

/** Parse Discord-style `||spoiler||` markers into structured segments. */
export function parseDiscordSpoilerInput(input: string): ClubPostBodySegment[] {
  if (!input) return [];

  const segments: ClubPostBodySegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  DISCORD_SPOILER_PATTERN.lastIndex = 0;
  while ((match = DISCORD_SPOILER_PATTERN.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: input.slice(lastIndex, match.index) });
    }
    segments.push({ type: "spoiler", text: match[1] });
    lastIndex = DISCORD_SPOILER_PATTERN.lastIndex;
  }

  if (lastIndex < input.length) {
    segments.push({ type: "text", text: input.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: "text", text: input });
  }

  return segments;
}

export function segmentsToPlainText(segments: ClubPostBodySegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

export function serializeStructuredBody(segments: ClubPostBodySegment[]): string {
  return JSON.stringify(segments);
}

export function parseStoredPostBody(
  bodyFormat: ClubPostBodyFormat,
  body: string,
): {
  bodyFormat: ClubPostBodyFormat;
  plainText: string;
  segments: ClubPostBodySegment[];
} {
  if (bodyFormat === "structured") {
    const segments = clubPostBodySegmentsSchema.parse(JSON.parse(body));
    return {
      bodyFormat: "structured",
      plainText: segmentsToPlainText(segments),
      segments,
    };
  }

  const segments = parseDiscordSpoilerInput(body);
  const hasSpoiler = segments.some((segment) => segment.type === "spoiler");
  if (hasSpoiler) {
    return {
      bodyFormat: "structured",
      plainText: segmentsToPlainText(segments),
      segments,
    };
  }

  return {
    bodyFormat: "plain",
    plainText: body,
    segments: [{ type: "text", text: body }],
  };
}

export function prepareClubPostBody(
  body: string,
  bodyFormat?: ClubPostBodyFormat,
): {
  bodyFormat: ClubPostBodyFormat;
  storageBody: string;
  plainText: string;
  segments: ClubPostBodySegment[];
} {
  if (bodyFormat === "structured") {
    const segments = clubPostBodySegmentsSchema.parse(JSON.parse(body));
    return {
      bodyFormat: "structured",
      storageBody: serializeStructuredBody(segments),
      plainText: segmentsToPlainText(segments),
      segments,
    };
  }

  const segments = parseDiscordSpoilerInput(body);
  const hasSpoiler = segments.some((segment) => segment.type === "spoiler");
  if (hasSpoiler) {
    const validated = clubPostBodySegmentsSchema.parse(segments);
    return {
      bodyFormat: "structured",
      storageBody: serializeStructuredBody(validated),
      plainText: segmentsToPlainText(validated),
      segments: validated,
    };
  }

  return {
    bodyFormat: "plain",
    storageBody: body,
    plainText: body,
    segments: [{ type: "text", text: body }],
  };
}

export function extractChapterNumber(text: string): number | null {
  const match = text.match(/\bchapter\s+(\d+)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function consumptionAnchorStart(
  consumption: ConsumptionTarget,
): number | null {
  switch (consumption.kind) {
    case "chapter":
    case "episode":
    case "page":
      return consumption.start;
    case "custom":
      return null;
  }
}

export function compareConsumptionToProgress(
  consumption: ConsumptionTarget,
  context: ViewerConsumptionContext,
): ConsumptionProgressComparison {
  const anchorStart = consumptionAnchorStart(consumption);
  if (anchorStart === null) return "unknown";

  const progress = context.progress;

  if (consumption.kind === "chapter") {
    if (!progress || !isReadingProgressLocator(progress)) return "unknown";

    const chapter =
      extractChapterNumber(progress.title ?? "") ??
      extractChapterNumber(progress.href ?? "");
    if (chapter === null) return "unknown";

    return chapter >= anchorStart ? "at_or_after" : "before";
  }

  if (consumption.kind === "episode") {
    if (context.tvContinue) {
      const viewerEpisode = context.tvContinue.episodeNumber;
      return viewerEpisode >= anchorStart ? "at_or_after" : "before";
    }

    if (progress && isPlaybackProgressLocator(progress)) {
      if (progress.trackIndex !== undefined) {
        const viewerEpisode = progress.trackIndex + 1;
        return viewerEpisode >= anchorStart ? "at_or_after" : "before";
      }
      return "unknown";
    }

    return "unknown";
  }

  if (consumption.kind === "page") {
    return "unknown";
  }

  return "unknown";
}
