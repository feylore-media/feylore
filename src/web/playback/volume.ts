const VOLUME_STORAGE_KEY = "feylore.playback.volume";
const DEFAULT_VOLUME = 1;

export function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw == null) return DEFAULT_VOLUME;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, parsed));
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function writeStoredVolume(volume: number): void {
  try {
    localStorage.setItem(
      VOLUME_STORAGE_KEY,
      String(Math.min(1, Math.max(0, volume))),
    );
  } catch {
    // localStorage may be unavailable
  }
}
