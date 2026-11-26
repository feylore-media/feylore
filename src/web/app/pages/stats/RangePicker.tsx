import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  STATS_ALL_TIME_FROM,
  endOfMonth,
  endOfYear,
  parseStatsDate,
  startOfMonth,
  startOfYear,
  toStatsDate,
} from "@shared/stats";
import { Button } from "../../../components/primitives";
import styles from "./stats.module.css";

function monthBounds(year: number, month: number): [string, string] {
  const first = new Date(Date.UTC(year, month, 1));
  return [toStatsDate(startOfMonth(first)), toStatsDate(endOfMonth(first))];
}

export function RangePicker({
  open,
  initialFrom,
  initialTo,
  onApply,
  onClose,
}: {
  open: boolean;
  initialFrom: string | null;
  initialTo: string | null;
  onApply: (from: string | null, to: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("stats");
  const dialogRef = useRef<HTMLDivElement>(null);

  const seed = parseStatsDate(initialFrom) ?? new Date();
  const [cursorYear, setCursorYear] = useState(seed.getUTCFullYear());
  const [cursorMonth, setCursorMonth] = useState(seed.getUTCMonth());
  const [customFrom, setCustomFrom] = useState(initialFrom ?? "");
  const [customTo, setCustomTo] = useState(initialTo ?? "");

  useEffect(() => {
    if (open) {
      const anchor = parseStatsDate(initialFrom) ?? new Date();
      setCursorYear(anchor.getUTCFullYear());
      setCursorMonth(anchor.getUTCMonth());
      setCustomFrom(initialFrom ?? "");
      setCustomTo(initialTo ?? "");
      dialogRef.current?.focus();
    }
  }, [open, initialFrom, initialTo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const now = new Date();
  const thisMonth: [string, string] = [
    toStatsDate(startOfMonth(now)),
    toStatsDate(endOfMonth(now)),
  ];
  const thisYear: [string, string] = [
    toStatsDate(startOfYear(now)),
    toStatsDate(endOfYear(now)),
  ];
  const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonth = monthBounds(prevMonthDate.getUTCFullYear(), prevMonthDate.getUTCMonth());
  const lastYear: [string, string] = [
    `${now.getUTCFullYear() - 1}-01-01`,
    `${now.getUTCFullYear() - 1}-12-31`,
  ];

  const cursorLabel = new Date(Date.UTC(cursorYear, cursorMonth, 1)).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  const stepMonth = (delta: number) => {
    const d = new Date(Date.UTC(cursorYear, cursorMonth + delta, 1));
    setCursorYear(d.getUTCFullYear());
    setCursorMonth(d.getUTCMonth());
  };

  const presets: { key: string; label: string; apply: () => void }[] = [
    {
      key: "thisMonth",
      label: t("presetThisMonth"),
      apply: () => onApply(thisMonth[0], thisMonth[1]),
    },
    {
      key: "thisYear",
      label: t("presetThisYear"),
      apply: () => onApply(thisYear[0], thisYear[1]),
    },
    {
      key: "lastMonth",
      label: t("presetLastMonth"),
      apply: () => onApply(lastMonth[0], lastMonth[1]),
    },
    {
      key: "lastYear",
      label: t("presetLastYear"),
      apply: () => onApply(lastYear[0], lastYear[1]),
    },
    {
      key: "allTime",
      label: t("presetAllTime"),
      apply: () => onApply(STATS_ALL_TIME_FROM, null),
    },
  ];

  return (
    <div className={styles.pickerBackdrop}>
      <button
        type="button"
        aria-label={t("pickerClose")}
        className={styles.pickerBackdropButton}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={t("pickerTitle")}
        tabIndex={-1}
        className={styles.picker}
      >
        <div className={styles.pickerPresets}>
          {presets.map((preset) => (
            <Button key={preset.key} type="button" onClick={preset.apply}>
              {preset.label}
            </Button>
          ))}
        </div>

        <div className={styles.pickerMonthNav}>
          <Button
            type="button"
            aria-label={t("prevYear")}
            onClick={() => setCursorYear((y) => y - 1)}
          >
            {"◂"}
          </Button>
          <span aria-hidden="true">{"·"}</span>
          <Button
            type="button"
            aria-label={t("nextYear")}
            onClick={() => setCursorYear((y) => y + 1)}
          >
            {"▸"}
          </Button>
          <Button
            type="button"
            aria-label={t("prevMonth")}
            onClick={() => stepMonth(-1)}
          >
            {"◂"}
          </Button>
          <span className={styles.pickerCursor}>{cursorLabel}</span>
          <Button
            type="button"
            aria-label={t("nextMonth")}
            onClick={() => stepMonth(1)}
          >
            {"▸"}
          </Button>
        </div>
        <Button
          type="button"
          onClick={() => {
            const [from, to] = monthBounds(cursorYear, cursorMonth);
            onApply(from, to);
          }}
        >
          {t("useMonth")}
        </Button>

        <div className={styles.pickerCustom}>
          <label>
            {t("customFrom")}{" "}
            <input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
          </label>
          <label>
            {t("customTo")}{" "}
            <input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.pickerActions}>
          <Button
            type="button"
            variant="primary"
            onClick={() => onApply(customFrom || null, customTo || null)}
          >
            {t("apply")}
          </Button>
          <Button type="button" onClick={() => onApply(null, null)}>
            {t("clear")}
          </Button>
        </div>
      </div>
    </div>
  );
}
