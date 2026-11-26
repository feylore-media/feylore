export type CalendarDomain =
  | "club"
  | "book"
  | "audiobook"
  | "music"
  | "movie"
  | "tv"
  | "podcast"
  | "ttrpg";

export type DatePrecision =
  | "timestamp"
  | "day"
  | "month"
  | "season"
  | "year"
  | "unknown";

export type EventStatus = "confirmed" | "tentative" | "changed";

export interface CalendarPerson {
  name: string;
  href?: string | null;
  role?: string | null;
}

export interface CalendarSeriesRef {
  name: string;
  position: number | null;
}

/**
 * A dated, authorized projection from a domain's own records.
 *
 * `startsAt` is only populated for instants (and, for legacy club events, the
 * day-bound events that already existed). Partial release dates never fabricate
 * a day: a "September 2026" release has `datePrecision: "month"`,
 * `releaseDate: null`, and `releaseBucket: "2026-09"` for sorting/grouping.
 */
export interface UpcomingEvent {
  id: string;
  domain: CalendarDomain;
  kind: string;
  startsAt: string | null;
  endsAt: string | null;
  datePrecision: DatePrecision;
  /** `YYYY-MM-DD` when the date is known to the day. */
  releaseDate: string | null;
  /** `YYYY-MM-DD` end of a multi-day window, when known. */
  releaseEndDate: string | null;
  /** Sortable bucket for partial dates: `YYYY-MM-DD`/`YYYY-MM`/`YYYY`. */
  releaseBucket: string | null;
  /** Human partial label from the source, e.g. "Fall 2026". */
  releaseWindowLabel: string | null;
  timezone: string | null;
  label: string;
  title: string | null;
  href: string;
  description: string | null;
  artworkFileId: string | null;
  workId: string | null;
  expressionId: string | null;
  manifestationId: string | null;
  people: CalendarPerson[];
  series: CalendarSeriesRef[];
  /** Why this event is present for the current user, e.g. ["library", "club"]. */
  reasons: string[];
  /** Optional user state such as wanting to read/listen/watch this work. */
  userIntent: string | null;
  status: EventStatus;
  /** Stable source identity, e.g. "club" | "library.book". */
  source: string;
  discoveredAt: string;
  updatedAt: string;
}

/** Stable group/sort key for partial dates without inventing a day of month. */
export function eventSortKey(event: UpcomingEvent): string {
  if (event.releaseBucket) return event.releaseBucket;
  const day = event.releaseDate ?? event.startsAt?.slice(0, 10) ?? null;
  return day ?? "0000-00-00";
}

/** The concrete calendar day an event belongs to, when known to the day. */
export function eventDay(event: UpcomingEvent): string | null {
  if (event.datePrecision === "day" && event.releaseDate) {
    return event.releaseDate;
  }
  if (event.datePrecision === "timestamp" && event.startsAt) {
    return event.startsAt.slice(0, 10);
  }
  return null;
}