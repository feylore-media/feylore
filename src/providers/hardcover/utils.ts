import type { HardcoverCachedImage } from "./types.js";

export function getImageUrl(
  value: HardcoverCachedImage | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value.url === "string") {
    const trimmed = value.url.trim();
    return trimmed || undefined;
  }
  return undefined;
}

const KNOWN_LANGUAGE_NAMES: Record<string, string> = {
  english: "eng",
};

/** Conservative language normalization — no invented ISO codes. */
export function normalizeHardcoverLanguage(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^[a-z]{2,3}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const mapped = KNOWN_LANGUAGE_NAMES[trimmed.toLowerCase()];
  if (mapped) return mapped;

  return trimmed;
}
