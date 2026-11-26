import type { CalendarDomain, DatePrecision } from "./upcoming.js";

export type CalendarSourceId = "library" | "club";
export type CalendarView = "agenda" | "month";

export const CALENDAR_DOMAINS: readonly CalendarDomain[] = [
  "book",
  "audiobook",
  "music",
  "movie",
  "tv",
  "podcast",
  "club",
  "ttrpg",
];

export const CALENDAR_SOURCES: readonly CalendarSourceId[] = [
  "library",
  "club",
];

/** Default "All Media" selection; TTRPG has no provider in V1 and starts off. */
export const CALENDAR_DEFAULT_DOMAINS: readonly CalendarDomain[] = [
  "book",
  "audiobook",
  "music",
  "movie",
  "tv",
  "podcast",
];

export const CALENDAR_DEFAULT_SOURCES: readonly CalendarSourceId[] = [
  "library",
  "club",
];

/** How far into the past the default agenda window reaches. */
export const CALENDAR_DEFAULT_FROM_DAYS = 21;
/** How far into the future the default agenda window reaches. */
export const CALENDAR_DEFAULT_TO_DAYS = 120;
/** Hard clamp so one page request cannot sweep a huge window. */
export const CALENDAR_MAX_WINDOW_DAYS = 400;

export interface CalendarFilters {
  /** `null` means all domains. */
  domains: CalendarDomain[] | null;
  /** `null` means all sources. */
  sources: CalendarSourceId[] | null;
  /** Inclusive `YYYY-MM-DD` lower bound. */
  from: string;
  /** Inclusive `YYYY-MM-DD` upper bound. */
  to: string;
  limit: number | null;
}

export interface CalendarPreferences {
  view: CalendarView;
  domains: CalendarDomain[];
  sources: CalendarSourceId[];
}

/** Storage key inside `user_preferences.settings_json`. */
export const CALENDAR_PREFERENCES_KEY = "calendar";

export function calendarQueryString(f: {
  from: string;
  to: string;
  media?: CalendarDomain[] | null;
  sources?: CalendarSourceId[] | null;
  limit?: number | null;
}): string {
  const params = new URLSearchParams();
  params.set("from", f.from);
  params.set("to", f.to);
  if (f.media?.length) params.set("media", f.media.join(","));
  else params.set("media", "");
  if (f.sources?.length) params.set("sources", f.sources.join(","));
  else params.set("sources", "");
  if (f.limit) params.set("limit", String(f.limit));
  return params.toString();
}

const SEASON_MONTH: Record<string, number> = {
  winter: 1,
  spring: 4,
  summer: 7,
  fall: 10,
  autumn: 10,
};

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export interface ParsedReleaseDate {
  precision: Exclude<DatePrecision, "timestamp" | "unknown"> | "unknown";
  day: string | null;
  bucket: string | null;
  label: string | null;
}

const pad = (value: number) => String(value).padStart(2, "0");

function isValidDay(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Parse a release date value without ever fabricating a calendar day.
 * "2026-09" stays month precision; "2026" stays year precision.
 * Returns `precision: "unknown"` for empty, "TBA", or unparseable values.
 */
export function parseReleaseDate(value: unknown): ParsedReleaseDate {
  if (typeof value !== "string") return { precision: "unknown", day: null, bucket: null, label: null };
  const trimmed = value.trim();
  if (!trimmed) return { precision: "unknown", day: null, bucket: null, label: null };

  const tba = /^(tba|tbd|unknown|to be announced|n\/a|null)$/i;
  if (tba.test(trimmed)) return { precision: "unknown", day: null, bucket: null, label: null };

  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(trimmed);
  if (dayMatch) {
    const day = `${dayMatch[1]}-${dayMatch[2]}-${dayMatch[3]}`;
    if (isValidDay(day)) {
      return { precision: "day", day, bucket: day, label: null };
    }
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (monthMatch) {
    const m = Number(monthMatch[2]);
    if (m >= 1 && m <= 12) {
      const bucket = `${monthMatch[1]}-${pad(m)}`;
      return { precision: "month", day: null, bucket, label: null };
    }
  }

  const seasonMatch = /^(spring|summer|fall|autumn|winter)\s+(\d{4})$/i.exec(trimmed);
  if (seasonMatch) {
    const season = seasonMatch[1].toLowerCase();
    const year = seasonMatch[2];
    const month = SEASON_MONTH[season];
    const label = season === "autumn" ? `Fall ${year}` : `${season[0]!.toUpperCase()}${season.slice(1)} ${year}`;
    return {
      precision: "season",
      day: null,
      bucket: `${year}-${pad(month)}`,
      label,
    };
  }

  const yearMatch = /^(\d{4})$/.exec(trimmed);
  if (yearMatch) {
    return { precision: "year", day: null, bucket: trimmed, label: null };
  }

  const namedMatch = /^([a-zA-Z]+)\s+(\d{4})$/.exec(trimmed);
  if (namedMatch) {
    const month = MONTH_NAMES[namedMatch[1].toLowerCase()];
    if (month) {
      return {
        precision: "month",
        day: null,
        bucket: `${namedMatch[2]}-${pad(month)}`,
        label: null,
      };
    }
  }

  return { precision: "unknown", day: null, bucket: null, label: "TBA" };
}