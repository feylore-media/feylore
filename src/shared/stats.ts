export const STATS_MEDIA_TYPES = [
  "books",
  "audiobooks",
  "podcasts",
  "music",
  "movies",
  "tv",
  "ttrpg",
] as const;

export type StatsMediaType = (typeof STATS_MEDIA_TYPES)[number];

export const STATS_FACT_KINDS = [
  "completed",
  "rated",
  "progress",
  "session",
  "play",
  "page_read",
] as const;

export type StatsFactKind = (typeof STATS_FACT_KINDS)[number];

export type StatsFactUnit =
  | "count"
  | "stars"
  | "seconds"
  | "pages"
  | "plays";

export interface StatsRange {
  from: string | null;
  to: string | null;
  label: string;
}

export const STATS_RATING_SCALES = [5, 10] as const;
export type StatsRatingScale = (typeof STATS_RATING_SCALES)[number];

export interface StatsDomainCount {
  mediaType: StatsMediaType;
  count: number;
}

export interface StatsTimeSeriesTick {
  key: string;
  label: string;
}

export interface StatsTimeSeriesBucket {
  key: string;
  completed: number;
  sessions: number;
  plays: number;
  readingSeconds: number;
}

export interface StatsRating {
  bucketSize: StatsRatingScale;
  avg: number | null;
  count: number;
  distribution: { value: number; count: number }[];
}

export interface StatsGenre {
  name: string;
  count: number;
  share: number;
}

export interface StatsCreator {
  role: string;
  name: string;
  peopleId: string | null;
  count: number;
}

export interface StatsReleaseYear {
  year: number;
  count: number;
}

export interface StatsDuration {
  completedCount: number;
  avgSeconds: number | null;
  totalSeconds: number | null;
}

export interface StatsHighlight {
  subjectType: string;
  subjectId: string;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  rating: number;
  ratingScale: StatsRatingScale;
  coverFileId?: string | null;
}

export interface StatsHeatDay {
  day: string;
  count: number;
}

export interface StatsResponse {
  profile: { username: string; displayName: string };
  range: StatsRange;
  headline: {
    domainCounts: StatsDomainCount[];
    totalCompleted: number;
    activeDays: number;
    readingSeconds: number;
  };
  media: { mediaType: StatsMediaType; label: string }[];
  timeSeries: {
    ticks: StatsTimeSeriesTick[];
    buckets: StatsTimeSeriesBucket[];
  };
  rating: StatsRating;
  genres: StatsGenre[];
  creators: StatsCreator[];
  releaseYears: StatsReleaseYear[];
  duration: StatsDuration | null;
  highlights: StatsHighlight[];
  heatmap: StatsHeatDay[];
}

/**
 * Strictly parse an ISO calendar date (`YYYY-MM-DD`) with no time component.
 * Returns null for any malformed input.
 */
export function parseStatsDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function toStatsDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

export function endOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 0));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Resolve a (possibly absent) from/to pair into a canonical, server-safe
 * range. Absent values default to the current calendar year.
 */
export function resolveStatsRange(
  from: string | null | undefined,
  to: string | null | undefined,
  now: Date = new Date(),
): StatsRange {
  const fromDate = parseStatsDate(from);
  const toDate = parseStatsDate(to);

  const canonicalFrom =
    fromDate && (!toDate || fromDate <= toDate)
      ? toStatsDate(fromDate)
      : toStatsDate(startOfYear(now));
  const canonicalTo = toDate
    ? toStatsDate(toDate)
    : toStatsDate(endOfYear(now));

  return {
    from: canonicalFrom,
    to: canonicalTo,
    label: formatStatsRangeLabel(canonicalFrom, canonicalTo, now),
  };
}

/**
 * All-time range: from the earliest representable day.
 */
export const STATS_ALL_TIME_FROM = "1970-01-01";

export function resolveAllTimeRange(): StatsRange {
  return {
    from: STATS_ALL_TIME_FROM,
    to: null,
    label: formatStatsRangeLabel(STATS_ALL_TIME_FROM, null),
  };
}

export function isAllTimeRange(from: string | null, to: string | null): boolean {
  return from === STATS_ALL_TIME_FROM && to === null;
}

/**
 * Heading label for a range, e.g. "2026", "Sep '26",
 * "Jun 15 – Sep 20 '26", "Dec '25 – Feb '26", "All Time".
 */
export function formatStatsRangeLabel(
  from: string,
  to: string | null,
  _now: Date = new Date(),
): string {
  if (from === STATS_ALL_TIME_FROM && to === null) return "All Time";
  const fromDate = parseStatsDate(from);
  const toDate = to === null ? null : parseStatsDate(to);
  if (!fromDate) return from;
  if (!toDate) return formatYearOrMonth(fromDate);

  if (sameDay(fromDate, toDate)) return formatYearOrMonth(fromDate);

  const sameYear = fromDate.getUTCFullYear() === toDate.getUTCFullYear();

  if (startOfYear(fromDate).getTime() === fromDate.getTime() &&
      endOfYear(fromDate).getTime() === toDate.getTime()) {
    return String(fromDate.getUTCFullYear());
  }

  if (sameDay(startOfMonth(fromDate), fromDate) &&
      sameDay(endOfMonth(toDate), toDate) &&
      startOfMonth(fromDate).getTime() === startOfMonth(toDate).getTime()) {
    return formatMonthYear(fromDate);
  }

  if (sameYear) {
    return `${monthDay(fromDate)} – ${monthDay(toDate)} '${String(
      fromDate.getUTCFullYear(),
    ).slice(2)}`;
  }

  return `${formatMonthYear(fromDate)} – ${formatMonthYear(toDate)}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function formatYearOrMonth(date: Date): string {
  const year = date.getUTCFullYear();
  if (date.getUTCDate() === 1 && date.getUTCMonth() === 0) return String(year);
  if (date.getUTCDate() === 1) return formatMonthYear(date);
  return formatShortDate(date);
}

function formatShortDate(date: Date): string {
  const month = MONTH_ABBREVIATIONS[date.getUTCMonth()];
  return `${month} ${date.getUTCDate()} '${String(date.getUTCFullYear()).slice(2)}`;
}

function formatMonthYear(date: Date): string {
  return `${MONTH_ABBREVIATIONS[date.getUTCMonth()]} '${String(
    date.getUTCFullYear(),
  ).slice(2)}`;
}

function monthDay(date: Date): string {
  return `${MONTH_ABBREVIATIONS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/**
 * Per-domain display metadata used by the UI and the API envelope.
 */
export const STATS_DOMAIN_META: Record<
  StatsMediaType,
  {
    plural: string;
    singular: string;
    unit: string;
    hasDuration: boolean;
    hrefBase: string;
  }
> = {
  books: {
    plural: "Books",
    singular: "Book",
    unit: "books read",
    hasDuration: false,
    hrefBase: "/books",
  },
  audiobooks: {
    plural: "Audiobooks",
    singular: "Audiobook",
    unit: "audiobooks finished",
    hasDuration: true,
    hrefBase: "/audiobooks",
  },
  podcasts: {
    plural: "Podcasts",
    singular: "Episode",
    unit: "episodes finished",
    hasDuration: true,
    hrefBase: "/podcasts",
  },
  music: {
    plural: "Music",
    singular: "Album",
    unit: "albums listened",
    hasDuration: true,
    hrefBase: "/music/albums",
  },
  movies: {
    plural: "Movies",
    singular: "Movie",
    unit: "movies watched",
    hasDuration: true,
    hrefBase: "/movies",
  },
  tv: {
    plural: "TV",
    singular: "Episode",
    unit: "episodes watched",
    hasDuration: true,
    hrefBase: "/tv",
  },
  ttrpg: {
    plural: "TTRPG",
    singular: "Module",
    unit: "items finished",
    hasDuration: false,
    hrefBase: "/ttrpg",
  },
};

export function isStatsMediaType(value: string): value is StatsMediaType {
  return (STATS_MEDIA_TYPES as readonly string[]).includes(value);
}

export function statsMediaTypeFromWorkType(
  workType: string,
): StatsMediaType | null {
  switch (workType) {
    case "book":
    case "comic":
      return "books";
    case "audiobook":
      return "audiobooks";
    case "podcast_episode":
      return "podcasts";
    case "album":
    case "track":
      return "music";
    case "movie":
      return "movies";
    case "tv_episode":
      return "tv";
    case "ttrpg_module":
      return "ttrpg";
    default:
      return null;
  }
}

export const STATS_DURATION_FORMATTER = new Intl.NumberFormat("en", {
  maximumFractionDigits: 0,
});

export function formatStatsDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatAvgRuntime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${pad2(minutes)}m`;
}