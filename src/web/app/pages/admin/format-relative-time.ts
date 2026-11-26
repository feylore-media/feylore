export function formatRelativeTime(
  value: string | Date | null | undefined,
  neverLabel: string,
): string {
  if (!value) return neverLabel;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return neverLabel;

  const diffSec = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return rtf.format(diffSec, "second");
  if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (absSec < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (absSec < 2592000) return rtf.format(Math.round(diffSec / 86400), "day");
  if (absSec < 31536000) {
    return rtf.format(Math.round(diffSec / 2592000), "month");
  }
  return rtf.format(Math.round(diffSec / 31536000), "year");
}
