import type { PlaybackStatus } from "@shared/playback";

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function playbackStatusLabel(
  status: PlaybackStatus,
  t: (key: string) => string,
): string {
  switch (status) {
    case "playing":
      return t("statusPlaying");
    case "paused":
      return t("statusPaused");
    case "ended":
      return t("statusFinished");
    case "loading":
      return t("statusLoading");
    default:
      return "";
  }
}

export function isActivelyPlaying(status: PlaybackStatus): boolean {
  return status === "playing";
}

export function canTogglePlayback(status: PlaybackStatus): boolean {
  return (
    status === "playing" ||
    status === "paused" ||
    status === "loading" ||
    status === "ended"
  );
}
