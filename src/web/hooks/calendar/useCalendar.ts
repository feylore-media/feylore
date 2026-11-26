import { useCallback, useEffect, useState } from "react";
import type { UpcomingEvent } from "@shared/upcoming";
import type { CalendarDomain } from "@shared/upcoming";
import {
  calendarQueryString,
  CALENDAR_DEFAULT_FROM_DAYS,
  CALENDAR_DEFAULT_TO_DAYS,
  type CalendarSourceId,
  type CalendarView,
} from "@shared/calendar";
import { api } from "../../app/api";
import { addDays, todayIso } from "../../lib/dates";

export interface CalendarQueryParams {
  from: string;
  to: string;
  domains: CalendarDomain[] | null;
  sources: CalendarSourceId[] | null;
}

export interface CalendarPrefs {
  view: CalendarView;
  domains: CalendarDomain[];
  sources: CalendarSourceId[];
}

export function defaultCalendarWindow(): { from: string; to: string } {
  const today = todayIso();
  return {
    from: addDays(today, -CALENDAR_DEFAULT_FROM_DAYS),
    to: addDays(today, CALENDAR_DEFAULT_TO_DAYS),
  };
}

export function useCalendarEvents(
  params: CalendarQueryParams,
  enabled = true,
) {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = calendarQueryString({
      from: params.from,
      to: params.to,
      media: params.domains,
      sources: params.sources,
      limit: 600,
    });
    return api<{ data: UpcomingEvent[] }>(`/calendar?${qs}`)
      .then((res) => setEvents(res.data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Request failed"),
      )
      .finally(() => setLoading(false));
  }, [params.from, params.to, params.domains, params.sources]);

  useEffect(() => {
    if (enabled) void reload();
  }, [reload, enabled]);

  return { events, loading, error, reload };
}

export function useCalendarPreferences() {
  const [prefs, setPrefs] = useState<CalendarPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ data: CalendarPrefs }>("/calendar/preferences")
      .then((res) => {
        if (active) setPrefs(res.data);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load preferences",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback((patch: Partial<CalendarPrefs>) => {
    setPrefs((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      void api<{ data: CalendarPrefs }>("/calendar/preferences", {
        method: "PUT",
        body: JSON.stringify(next),
      }).catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Failed to save preferences",
        ),
      );
      return next;
    });
  }, []);

  return { prefs, error, update, ready: prefs !== null };
}