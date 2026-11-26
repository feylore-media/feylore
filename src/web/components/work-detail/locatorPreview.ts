import type { ReadingLocator } from "@shared/books";

export function locatorProgression(locator: ReadingLocator): number | null {
  const p = locator.totalProgression ?? locator.progression;
  if (p == null || p <= 0) return null;
  return p;
}

export function formatLocatorLabel(locator: ReadingLocator): string {
  if (locator.title) return locator.title;
  const pct = locatorProgression(locator);
  if (pct != null) return `${Math.round(pct * 100)}%`;
  if (locator.href) {
    const segment = locator.href.split("/").pop();
    if (segment) return segment.replace(/\.[^.]+$/, "");
  }
  return "Location";
}

export function formatLocatorExcerpt(
  locator: ReadingLocator,
  highlightText?: string,
  label?: string,
): string | undefined {
  if (highlightText) return highlightText;
  if (label) return label;
  const text = locator.locatorText?.highlight ?? locator.locatorText?.after;
  if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  return undefined;
}
