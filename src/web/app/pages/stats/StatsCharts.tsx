import { useMemo } from "react";
import type { StatsResponse } from "@shared/stats";
import styles from "./stats.module.css";

type Buckets = StatsResponse["timeSeries"]["buckets"];
type Ticks = StatsResponse["timeSeries"]["ticks"];

const MAX_COLUMNS = 48;

interface MonthColumn {
  key: string;
  label: string;
  completed: number;
  plays: number;
}

function groupMonths(buckets: Buckets, ticks: Ticks): MonthColumn[] {
  const labels = new Map(ticks.map((t) => [t.key, t.label]));
  if (buckets.length <= MAX_COLUMNS) {
    return buckets.map((b) => ({
      key: b.key,
      label: labels.get(b.key) ?? b.key,
      completed: b.completed,
      plays: b.plays,
    }));
  }
  const size = Math.ceil(buckets.length / MAX_COLUMNS);
  const columns: MonthColumn[] = [];
  for (let i = 0; i < buckets.length; i += size) {
    const chunk = buckets.slice(i, i + size);
    const first = chunk[0]!;
    let completed = 0;
    let plays = 0;
    for (const b of chunk) {
      completed += b.completed;
      plays += b.plays;
    }
    columns.push({
      key: first.key,
      label: labels.get(first.key) ?? first.key,
      completed,
      plays,
    });
  }
  return columns;
}

export function MonthBars({
  buckets,
  ticks,
  summary,
}: {
  buckets: Buckets;
  ticks: Ticks;
  summary: string;
}) {
  const columns = useMemo(() => groupMonths(buckets, ticks), [buckets, ticks]);

  const width = 640;
  const height = 240;
  const marginLeft = 36;
  const marginBottom = 26;
  const marginTop = 8;
  const plotW = width - marginLeft - 8;
  const plotH = height - marginTop - marginBottom;

  const maxV = Math.max(
    1,
    ...columns.map((c) => Math.max(c.completed, c.plays)),
  );
  const slot = plotW / Math.max(columns.length, 1);
  const barW = Math.max(2, Math.min(22, slot * 0.52));
  const playW = Math.max(1, Math.min(10, slot * 0.24));
  const y = (v: number) => marginTop + plotH - (v / maxV) * plotH;
  const gridValues = maxV === 1 ? [0, 1] : [0, Math.round(maxV / 2), maxV];
  const labelEvery = Math.max(1, Math.ceil(columns.length / 12));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.chart}
      role="img"
      aria-label={summary}
    >
      <title>{summary}</title>
      {gridValues.map((v) => (
        <g key={v}>
          <line
            x1={marginLeft}
            x2={width - 8}
            y1={y(v)}
            y2={y(v)}
            className={styles.gridLine}
          />
          <text x={marginLeft - 6} y={y(v) + 3} className={styles.axisLabel} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {columns.map((c, i) => {
        const x = marginLeft + i * slot + (slot - barW - playW - 3) / 2;
        return (
          <g key={c.key}>
            <title>{`${c.label}: ${c.completed} finished, ${c.plays} plays`}</title>
            <rect
              x={x}
              y={y(c.completed)}
              width={barW}
              height={Math.max(0, marginTop + plotH - y(c.completed))}
              className={styles.barCompleted}
            />
            <rect
              x={x + barW + 3}
              y={y(c.plays)}
              width={playW}
              height={Math.max(0, marginTop + plotH - y(c.plays))}
              className={styles.barPlays}
            />
            {i % labelEvery === 0 && (
              <text
                x={marginLeft + i * slot + slot / 2}
                y={height - 8}
                className={styles.axisLabel}
                textAnchor="middle"
              >
                {c.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function monthYearLabel(day: string): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const [y, m] = day.split("-");
  const month = months[Number(m) - 1] ?? "";
  return `${month} '${(y ?? "").slice(2)}`;
}

function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count < 4) return 2;
  if (count < 8) return 3;
  return 4;
}

function heatClass(level: number): string {
  const classes = [
    styles.heat0,
    styles.heat1,
    styles.heat2,
    styles.heat3,
    styles.heat4,
  ];
  return classes[Math.min(Math.max(level, 0), 4)] ?? styles.heat0;
}

export function Heatmap({
  days,
  dayLabel,
  summary,
}: {
  days: StatsResponse["heatmap"];
  dayLabel: (date: string, count: number) => string;
  summary: string;
}) {
  const weeks = useMemo(() => {
    const result: ({ day: string; count: number } | null)[][] = [];
    if (days.length === 0) return result;
    const first = new Date(`${days[0]!.day}T00:00:00.000Z`);
    const leading = (first.getUTCDay() + 6) % 7;
    const cells: ({ day: string; count: number } | null)[] = [
      ...Array<null>(leading).fill(null),
      ...days,
    ];
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      while (week.length < 7) week.push(null);
      result.push(week);
    }
    return result;
  }, [days]);

  if (days.length === 0) return null;

  const pitch = 14;
  const size = 11;
  const width = weeks.length * pitch + 2;
  const height = 7 * pitch + 2;
  const caption = `${monthYearLabel(days[0]!.day)} – ${monthYearLabel(days[days.length - 1]!.day)}`;

  return (
    <figure className={styles.heatmapFigure}>
      <div className={styles.heatmapScroll}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className={styles.heatmap}
          role="img"
          aria-label={summary}
        >
          <title>{summary}</title>
          {weeks.map((week, wi) =>
            week.map((cell, di) => {
              if (!cell) return null;
              const level = heatLevel(cell.count);
              return (
                <rect
                  key={cell.day}
                  x={1 + wi * pitch}
                  y={1 + di * pitch}
                  width={size}
                  height={size}
                  className={heatClass(level)}
                  aria-hidden="true"
                >
                  <title>{dayLabel(cell.day, cell.count)}</title>
                </rect>
              );
            }),
          )}
        </svg>
      </div>
      <figcaption className={styles.heatmapCaption}>{caption}</figcaption>
    </figure>
  );
}
