import { useTranslation } from "react-i18next";
import type { CalendarDomain } from "@shared/upcoming";
import type { CalendarSourceId, CalendarView } from "@shared/calendar";
import { CALENDAR_DOMAINS, CALENDAR_SOURCES } from "@shared/calendar";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Icon } from "../icons/Icon";
import { UiBackIcon, UiForwardIcon } from "../icons/ui-icons";
import { monthLabel } from "../../lib/dates";
import { domainLabel } from "./calendar-display";
import styles from "./calendar.module.css";

const FILTER_DOMAINS = CALENDAR_DOMAINS.filter(
  (domain) => domain !== "club" && domain !== "ttrpg",
);

export function CalendarToolbar({
  view,
  onViewChange,
  month,
  onShiftMonth,
  onToday,
  domains,
  onToggleDomain,
  sources,
  onToggleSource,
}: {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  month: string;
  onShiftMonth: (delta: number) => void;
  onToday: () => void;
  domains: CalendarDomain[];
  onToggleDomain: (domain: CalendarDomain) => void;
  sources: CalendarSourceId[];
  onToggleSource: (source: CalendarSourceId) => void;
}) {
  const { t } = useTranslation("calendar");
  const allDomains = domains.length === 0;
  const allSources = sources.length === 0;

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarRow}>
        <SegmentedControl
          name="calendar-view"
          value={view}
          aria-label={t("viewLabel")}
          options={[
            { value: "agenda", label: t("viewAgenda") },
            { value: "month", label: t("viewMonth") },
          ]}
          onChange={onViewChange}
        />
        <div className={styles.toolbarCenter}>
          {view === "month" ? monthLabel(month) : t("title")}
        </div>
        <div className={styles.toolbarNav}>
          {view === "month" && (
            <>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t("prevMonth")}
                onClick={() => onShiftMonth(-1)}
              >
                <Icon icon={UiBackIcon} size="sm" />
              </button>
              <button type="button" className={styles.iconButton} onClick={onToday}>
                {t("today")}
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t("nextMonth")}
                onClick={() => onShiftMonth(1)}
              >
                <Icon icon={UiForwardIcon} size="sm" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("allMediaLabel")}</span>
          {allDomains && <span className={styles.chipActive + " " + styles.chip}>{t("allMedia")}</span>}
          {FILTER_DOMAINS.map((domain) => {
            const active = domains.includes(domain);
            return (
              <button
                key={domain}
                type="button"
                className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                aria-pressed={active}
                onClick={() => onToggleDomain(domain)}
              >
                {domainLabel(t, domain)}
              </button>
            );
          })}
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("myCalendarLabel")}</span>
          {allSources && (
            <span className={styles.chipActive + " " + styles.chip}>{t("myCalendar")}</span>
          )}
          {CALENDAR_SOURCES.map((source) => {
            const active = sources.includes(source);
            return (
              <button
                key={source}
                type="button"
                className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                aria-pressed={active}
                onClick={() => onToggleSource(source)}
              >
                {t(`source_${source}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}