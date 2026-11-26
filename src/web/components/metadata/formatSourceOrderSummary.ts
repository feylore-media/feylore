/**
 * Formats an ordered source list as a compact summary for table display.
 * e.g. "Hardcover → Open Library → Apple Books + 3"
 */
export function formatSourceOrderSummary(
  sources: string[],
  providerName: (key: string) => string,
  maxVisible = 3,
): string {
  if (sources.length === 0) return "";

  const visible = sources.slice(0, maxVisible).map(providerName);
  const chain = visible.join(" → ");
  const remaining = sources.length - maxVisible;

  if (remaining > 0) {
    return `${chain} + ${remaining}`;
  }
  return chain;
}
