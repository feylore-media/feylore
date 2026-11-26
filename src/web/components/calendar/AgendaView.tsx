import { useTranslation } from "react-i18next";
import type { UpcomingEvent } from "@shared/upcoming";
import { eventDay } from "@shared/upcoming";
import { EmptyState, LoadingState } from "../states";
import { CalendarCover } from "./CalendarCover";
import { MediaPreviewPopover } from "./MediaPreviewPopover";
import {
  buildAgendaSections,
  domainLabel,
  kindLabel,
  reasonLabels,
} from "./calendar-display";
import { formatDayHeader } from "../../lib/dates";
import styles from "./calendar.module.css";

export function AgendaView({
  events,
  loading,
}: {
  events: UpcomingEvent[];
  loading: boolean;
}) {
  const { t } = useTranslation("calendar");

  if (loading && events.length === 0) return <LoadingState />;
  if (events.length === 0) {
    return <EmptyState ns="calendar" titleKey="emptyTitle" detailKey="emptyDetail" />;
  }

  const sections = buildAgendaSections(events, t("tbd"));

  return (
    <div className={styles.sections}>
      {sections.map((section) => (
        <section key={section.key} className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            {section.isPartial && (
              <span className={styles.sectionTag}>{t("tentative")}</span>
            )}
            {section.date && (
              <time className={styles.sectionTag} dateTime={section.date}>
                {section.date}
              </time>
            )}
          </div>
          <ul className={styles.events}>
            {section.events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EventRow({ event }: { event: UpcomingEvent }) {
  const { t } = useTranslation("calendar");
  const day = eventDay(event);
  const reasons = reasonLabels(t, event.reasons);

  return (
    <li className={styles.eventRow}>
      <MediaPreviewPopover event={event}>
        <CalendarCover
          artworkFileId={event.artworkFileId}
          title={event.title ?? event.label}
          size="list"
        />
      </MediaPreviewPopover>
      <div className={styles.eventBody}>
        <div className={styles.eventTop}>
          <span className={styles.eventKind}>
            {kindLabel(t, event.kind)}
            <span aria-hidden> · </span>
            {domainLabel(t, event.domain)}
          </span>
          {reasons.map((reason) => (
            <span key={reason} className={styles.reasonTag}>
              {reason}
            </span>
          ))}
        </div>
        <p className={styles.eventTitle}>{event.title ?? event.label}</p>
        <p className={styles.eventMeta}>
          {day ? formatDayHeader(day) : dateLine(event)}
          {event.people.length > 0 &&
            ` · ${event.people.map((person) => person.name).join(", ")}`}
        </p>
      </div>
    </li>
  );
}

function dateLine(event: UpcomingEvent): string {
  if (event.releaseWindowLabel) return event.releaseWindowLabel;
  if (event.releaseBucket) return event.releaseBucket;
  return "";
}