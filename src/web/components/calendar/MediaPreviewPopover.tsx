import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { UpcomingEvent } from "@shared/upcoming";
import { CalendarCover } from "./CalendarCover";
import {
  domainLabel,
  kindLabel,
  reasonLabels,
} from "./calendar-display";
import styles from "./calendar.module.css";

/**
 * A lightweight, dependency-free hover/focus preview popover for calendar
 * events. Unlike a full Dialog it stays anchored to the triggering row so the
 * surrounding calendar context remains visible.
 */
export function MediaPreviewPopover({
  event,
  children,
}: {
  event: UpcomingEvent;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const { t } = useTranslation("calendar");

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(evt: MouseEvent) {
      if (!wrapRef.current?.contains(evt.target as Node)) close();
    }
    function onKeyDown(evt: KeyboardEvent) {
      if (evt.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const people = event.people.map((person) =>
    person.href ? (
      <Link key={`${person.name}${person.role ?? ""}`} to={person.href}>
        {person.name}
      </Link>
    ) : (
      <span key={`${person.name}${person.role ?? ""}`}>{person.name}</span>
    ),
  );

  const reasonTags = reasonLabels(t, event.reasons);

  return (
    <span
      className={styles.popoverWrap}
      ref={wrapRef}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={styles.popoverTrigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t("title")} · ${event.label}`}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen((prev) => !prev)}
      >
        {children}
      </button>
      {open && (
        <span className={styles.popoverPanel} role="dialog">
          <div className={styles.popoverCover}>
            <CalendarCover
              artworkFileId={event.artworkFileId}
              title={event.title ?? event.label}
              size="popover"
            />
          </div>
          <div className={styles.popoverBody}>
            <p className={styles.popoverMeta}>
              <span>{kindLabel(t, event.kind)}</span>
              <span aria-hidden>·</span>
              <span>{domainLabel(t, event.domain)}</span>
            </p>
            <p className={styles.popoverTitle}>{event.title ?? event.label}</p>
            {event.description && (
              <p className={styles.popoverDescription}>{event.description}</p>
            )}
            {people.length > 0 && (
              <p className={styles.popoverPeople}>{people}</p>
            )}
            {reasonTags.length > 0 && (
              <p className={styles.popoverReasons}>
                {reasonTags.map((reason) => (
                  <span key={reason} className={styles.reasonTag}>
                    {reason}
                  </span>
                ))}
              </p>
            )}
            <p className={styles.popoverActions}>
              <Link to={event.href} onClick={close}>
                {t("open")}
              </Link>
            </p>
          </div>
        </span>
      )}
    </span>
  );
}