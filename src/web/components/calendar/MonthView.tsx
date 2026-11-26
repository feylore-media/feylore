import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UpcomingEvent } from "@shared/upcoming";
import { eventDay } from "@shared/upcoming";
import { Dialog, DialogBody, DialogContent } from "../ui/Dialog";
import { CalendarCover } from "./CalendarCover";
import { MediaPreviewPopover } from "./MediaPreviewPopover";
import {
  domainLabel,
  kindLabel,
  monthCells,
} from "./calendar-display";
import { todayIso } from "../../lib/dates";
import styles from "./calendar.module.css";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function MonthView({
  month,
  events,
}: {
  month: string;
  events: UpcomingEvent[];
}) {
  const { t } = useTranslation("calendar");

  const byDay = useMemo(() => {
    const map = new Map<string, UpcomingEvent[]>();
    for (const event of events) {
      const day = eventDay(event);
      if (!day) continue;
      const list = map.get(day) ?? [];
      list.push(event);
      map.set(day, list);
    }
    return map;
  }, [events]);

  const cells = monthCells(month);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selectedEvents = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const today = todayIso();

  const weekdays = WEEKDAYS.map((weekday) =>
    new Date(Date.UTC(2026, 0, 4 + weekday)).toLocaleDateString(undefined, {
      weekday: "short",
    }),
  );

  return (
    <div aria-label={`${t("monthTitle")} ${month}`}>
      <div className={styles.monthGrid}>
        {weekdays.map((label) => (
          <div key={label} className={styles.weekdayHeader}>
            {label}
          </div>
        ))}
        {cells.map((day, index) => {
          if (day === null) {
            return <div key={`blank-${index}`} className={styles.monthCell} />;
          }
          const dayEvents = byDay.get(day) ?? [];
          const visible = dayEvents.slice(0, 2);
          const overflow = dayEvents.length - visible.length;
          return (
            <div
              key={day}
              className={`${styles.monthCell} ${
                day === today ? styles.monthCellToday : ""
              }`}
            >
              <div className={styles.cellDate}>
                <span>{day}</span>
                {dayEvents.length > 3 && (
                  <span className={styles.dayCount}>{dayEvents.length}</span>
                )}
              </div>
              <div className={styles.cellCovers}>
                {visible.map((event) => (
                  <MediaPreviewPopover key={event.id} event={event}>
                    <CalendarCover
                      artworkFileId={event.artworkFileId}
                      title={event.title ?? event.label}
                      size="cell"
                    />
                  </MediaPreviewPopover>
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    className={styles.moreLink}
                    onClick={() => setSelectedDay(day)}
                  >
                    +{overflow}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={selectedDay !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        <DialogContent size="wide" aria-label={t("inDaySheet")}>
          <DialogBody>
            {selectedDay && <DaySheet day={selectedDay} events={selectedEvents} />}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DaySheet({ day, events }: { day: string; events: UpcomingEvent[] }) {
  const { t } = useTranslation("calendar");
  return (
    <div>
      <h3 className={styles.sectionTitle}>{day}</h3>
      {events.length === 0 && <p>{t("emptyDetail")}</p>}
      <ul className={styles.events}>
        {events.map((event) => (
          <li key={event.id} className={styles.eventRow}>
            <CalendarCover
              artworkFileId={event.artworkFileId}
              title={event.title ?? event.label}
              size="list"
            />
            <div className={styles.eventBody}>
              <p className={styles.eventKind}>
                {kindLabel(t, event.kind)}
                <span aria-hidden> · </span>
                {domainLabel(t, event.domain)}
              </p>
              <p className={styles.eventTitle}>{event.title ?? event.label}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}