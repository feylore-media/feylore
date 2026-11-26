import type { OpenLibraryDescription, OpenLibraryTextValue } from "./types.js";

export function extractTextValue(
  value: OpenLibraryDescription | string[] | undefined,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (Array.isArray(value)) {
    const joined = value.map((v) => String(v).trim()).filter(Boolean).join(" ");
    return joined || undefined;
  }
  const obj = value as OpenLibraryTextValue;
  if (typeof obj.value === "string") {
    const trimmed = obj.value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

export function normalizeLanguageKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const trimmed = key.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/\/languages\/(.+)$/i);
  return (match?.[1] ?? trimmed).trim() || undefined;
}

export function coverUrlFromId(coverId: number | undefined): string | undefined {
  if (coverId === undefined || coverId === null || !Number.isFinite(coverId)) {
    return undefined;
  }
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

export function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:\s]+$/u, "").trim();
}

export function isNumericSeriesToken(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/u.test(trimmed)) return false;
  const num = Number(trimmed);
  return Number.isFinite(num) && num > 0;
}

export function joinList(values: string[] | undefined): string | undefined {
  if (!values?.length) return undefined;
  const joined = values.map((v) => v.trim()).filter(Boolean).join(", ");
  return joined || undefined;
}

export function serializeRawValue(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (!value.length) return undefined;
  return JSON.stringify(value);
}

/** Strip Open Library path prefix, returning bare OL IDs like OL18931307W. */
export function bareOpenLibraryKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const trimmed = key.trim();
  if (!trimmed) return undefined;
  const bare = trimmed.replace(/^\/(?:works|books)\//, "").trim();
  return bare || undefined;
}
