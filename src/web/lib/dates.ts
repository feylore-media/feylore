const pad = (value: number) => String(value).padStart(2, "0");

export function isoDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month + 1)}`;
}

export function currentMonthKey(): string {
  const now = new Date();
  return monthKey(now.getFullYear(), now.getMonth());
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return monthKey(date.getUTCFullYear(), date.getUTCMonth());
}

export function monthLabel(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );
}

/** Week cells for a month grid; leading blanks pad to the first weekday (Sun=0). */
export function monthGridCells(month: string): Array<string | null> {
  const [year, monthIndex] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, monthIndex - 1, 1)).getUTCDay();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${month}-${pad(day)}`);
  }
  return cells;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return isoDay(next);
}

export function formatDayHeader(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatDayCell(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
  });
}

/** Month bucket "YYYY-MM" for an ISO date. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function yearOf(date: string): string {
  return date.slice(0, 4);
}