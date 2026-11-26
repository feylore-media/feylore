import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { CalendarDomain } from "@shared/upcoming";
import type { CalendarSourceId, CalendarView } from "@shared/calendar";
import {
  CALENDAR_DEFAULT_DOMAINS,
  CALENDAR_SOURCES,
} from "@shared/calendar";
import {
  defaultCalendarWindow,
  useCalendarEvents,
  useCalendarPreferences,
} from "../../hooks/calendar/useCalendar";
import { CalendarToolbar } from "../../components/calendar/CalendarToolbar";
import { AgendaView } from "../../components/calendar/AgendaView";
import { MonthView } from "../../components/calendar/MonthView";
import { LoadingState, ErrorState } from "../../components/states";
import { currentMonthKey, shiftMonth } from "../../lib/dates";
import styles from "../../components/calendar/calendar.module.css";

const VIEWS: CalendarView[] = ["agenda", "month"];

function splitList(raw: string | null, allowed: readonly string[]): string[] | null {
  if (!raw) return null;
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => allowed.includes(value));
  return values.length ? values : null;
}

function monthEnd(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

export function CalendarPage() {
  const { t } = useTranslation("calendar");
  const [searchParams, setSearchParams] = useSearchParams();
  const { prefs, ready, update } = useCalendarPreferences();

  const [view, setView] = useState<CalendarView>("agenda");
  const [month, setMonth] = useState(() => currentMonthKey());
  const [domains, setDomains] = useState<CalendarDomain[]>([]);
  const [sources, setSources] = useState<CalendarSourceId[]>([]);
  const appliedPrefs = useRef(false);

  useEffect(() => {
    if (!ready || !prefs || appliedPrefs.current) return;
    appliedPrefs.current = true;
    const urlView = searchParams.get("view");
    const urlMonth = searchParams.get("month");
    const urlMedia = searchParams.get("media");
    const urlSources = searchParams.get("sources");
    setView(
      urlView && VIEWS.includes(urlView as CalendarView)
        ? (urlView as CalendarView)
        : prefs.view,
    );
    setMonth(
      urlMonth && /^\d{4}-\d{2}$/.test(urlMonth) ? urlMonth : currentMonthKey(),
    );
    const media = splitList(urlMedia, CALENDAR_DEFAULT_DOMAINS) as
      | CalendarDomain[]
      | null;
    const sourceList = splitList(urlSources, CALENDAR_SOURCES) as
      | CalendarSourceId[]
      | null;
    setDomains(media ?? prefs.domains);
    setSources(sourceList ?? prefs.sources);
  }, [ready, prefs, searchParams]);

  const { loading, error, events } = useCalendarEvents(
    useMemo(
      () => {
        const window = view === "month"
          ? { from: `${month}-01`, to: monthEnd(month) }
          : defaultCalendarWindow();
        return {
          from: window.from,
          to: window.to,
          domains: domains.length ? domains : null,
          sources: sources.length ? sources : null,
        };
      },
      [view, month, domains, sources],
    ),
    ready,
  );

  function commit(next: {
    view?: CalendarView;
    month?: string;
    domains?: CalendarDomain[];
    sources?: CalendarSourceId[];
  }) {
    const params = new URLSearchParams(searchParams);
    if (next.view) params.set("view", next.view);
    if (next.month) params.set("month", next.month);
    params.set("media", next.domains ? next.domains.join(",") : "");
    params.set("sources", next.sources ? next.sources.join(",") : "");
    setSearchParams(params, { replace: true });
  }

  function toggleDomain(domain: CalendarDomain) {
    const next = domains.includes(domain)
      ? domains.filter((item) => item !== domain)
      : [...domains, domain];
    setDomains(next);
    commit({ domains: next });
    update({ domains: next });
  }

  function toggleSource(source: CalendarSourceId) {
    const next = sources.includes(source)
      ? sources.filter((item) => item !== source)
      : [...sources, source];
    setSources(next);
    commit({ sources: next });
    update({ sources: next });
  }

  function changeView(next: CalendarView) {
    setView(next);
    commit({ view: next });
    update({ view: next });
  }

  function shiftMonthBy(delta: number) {
    const next = shiftMonth(month, delta);
    setMonth(next);
    commit({ month: next });
  }

  function goToday() {
    const next = currentMonthKey();
    setMonth(next);
    commit({ month: next });
  }

  if (!ready) return <LoadingState />;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t("title")}</h1>
        <p className={styles.pageSubtitle}>{t("subtitle")}</p>
      </div>

      <CalendarToolbar
        view={view}
        onViewChange={changeView}
        month={month}
        onShiftMonth={shiftMonthBy}
        onToday={goToday}
        domains={domains}
        onToggleDomain={toggleDomain}
        sources={sources}
        onToggleSource={toggleSource}
      />

      {error && (
        <ErrorState
          message={t("networkError")}
          onRetry={() => window.location.reload()}
        />
      )}

      {view === "month" ? (
        <MonthView month={month} events={events} />
      ) : (
        <AgendaView events={events} loading={loading} />
      )}
    </div>
  );
}