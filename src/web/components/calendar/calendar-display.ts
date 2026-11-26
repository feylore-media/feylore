import {
  eventDay,
  eventSortKey,
  type CalendarDomain,
  type UpcomingEvent,
} from "@shared/upcoming";
import { formatDayHeader } from "../../lib/dates";

export { monthGridCells as monthCells } from "../../lib/dates";

export interface CalendarSection {
  key: string;
  title: string;
  date: string | null;
  isPartial: boolean;
  events: UpcomingEvent[];
}

/** Human heading for a partial release bucket (month/season/year). */
function partialTitle(event: UpcomingEvent, tbdLabel: string): string {
  if (event.releaseWindowLabel) return event.releaseWindowLabel;
  const bucket = event.releaseBucket;
  if (bucket && bucket.length === 7 && bucket !== "0000-00") {
    const [year, monthIndex] = bucket.split("-").map(Number);
    return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString(
      undefined,
      { month: "long", year: "numeric" },
    );
  }
  if (bucket && bucket.length === 4 && bucket !== "0000") return bucket;
  return tbdLabel;
}

export function buildAgendaSections(
  events: UpcomingEvent[],
  tbdLabel = "TBD",
): CalendarSection[] {
  const grouped = new Map<
    string,
    { title: string; date: string | null; isPartial: boolean; events: UpcomingEvent[] }
  >();
  for (const event of events) {
    const day = eventDay(event);
    if (day) {
      const existing = grouped.get(day);
      if (existing) {
        existing.events.push(event);
      } else {
        grouped.set(day, {
          title: formatDayHeader(day),
          date: day,
          isPartial: false,
          events: [event],
        });
      }
      continue;
    }
    const bucket =
      event.datePrecision === "unknown" || !event.releaseBucket
        ? "9999"
        : event.releaseBucket;
    const existing = grouped.get(bucket);
    if (existing) {
      existing.events.push(event);
    } else {
      grouped.set(bucket, {
        title: partialTitle(event, tbdLabel),
        date: null,
        isPartial: true,
        events: [event],
      });
    }
  }

  return [...grouped.entries()]
    .map(([key, section]) => ({ key, ...section }))
    .sort((a, b) => {
      const ka = a.isPartial ? a.key : eventSortKey(a.events[0]);
      const kb = b.isPartial ? b.key : eventSortKey(b.events[0]);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
}

export function domainLabel(
  t: (key: string) => string,
  domain: CalendarDomain,
): string {
  return t(`domain_${domain}`);
}

export function kindLabel(
  t: (key: string) => string,
  kind: string,
): string {
  const key = `kind_${kind}`;
  const label = t(key);
  return label === key ? kind : label;
}

export function reasonLabels(
  t: (key: string) => string,
  reasons: string[],
): string[] {
  return reasons.map((reason) => {
    const key = `reason_${reason}`;
    const label = t(key);
    return label === key ? reason : label;
  });
}

/** Human heading for a partial release bucket given its ISO-ish bucket string. */
export function bucketLabel(bucket: string | null | undefined): string {
  if (!bucket) return "TBD";
  if (bucket.length === 7 && bucket !== "0000-00") {
    const [year, monthIndex] = bucket.split("-").map(Number);
    return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString(
      undefined,
      { month: "long", year: "numeric" },
    );
  }
  if (bucket.length === 4 && bucket !== "0000") return bucket;
  return bucket;
}