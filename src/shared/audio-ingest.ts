export interface AudioFileSortKey {
  filename: string;
  discNumber?: number;
  trackNumber?: number;
}

/** Deterministic ordering: disc → track → filename (case-insensitive). */
export function compareAudioFileSortKeys(
  a: AudioFileSortKey,
  b: AudioFileSortKey,
): number {
  const discA = a.discNumber ?? 1;
  const discB = b.discNumber ?? 1;
  if (discA !== discB) return discA - discB;

  const trackA = a.trackNumber ?? Number.MAX_SAFE_INTEGER;
  const trackB = b.trackNumber ?? Number.MAX_SAFE_INTEGER;
  if (trackA !== trackB) return trackA - trackB;

  return a.filename.localeCompare(b.filename, undefined, {
    sensitivity: "base",
  });
}

const ASIN_PATTERN = /\b(B0[A-Z0-9]{8})\b/i;

export function detectAsinFromText(text: string): string | undefined {
  const match = text.match(ASIN_PATTERN);
  return match?.[1]?.toUpperCase();
}
