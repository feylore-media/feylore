import { useCallback } from "react";
import type { PlaybackStatus } from "@shared/playback";

interface UsePlayerKeyboardOptions {
  enabled: boolean;
  onTogglePlayPause: () => void;
  onEscape?: () => void;
}

export function usePlayerKeyboard({
  enabled,
  onTogglePlayPause,
  onEscape,
}: UsePlayerKeyboardOptions) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!enabled) return;

      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" &&
        (target as HTMLInputElement).type === "range"
      ) {
        return;
      }

      if (event.key === " " || event.key === "Enter") {
        if (target.tagName === "BUTTON") return;
        event.preventDefault();
        onTogglePlayPause();
        return;
      }

      if (event.key === "Escape" && onEscape) {
        event.preventDefault();
        onEscape();
      }
    },
    [enabled, onEscape, onTogglePlayPause],
  );

  return { handleKeyDown };
}

export function togglePlaybackAction(
  status: PlaybackStatus,
  pause: () => void,
  resume: () => void,
  replay: () => void,
): void {
  if (status === "ended") {
    replay();
    return;
  }
  if (status === "playing" || status === "loading") {
    pause();
    return;
  }
  resume();
}

export function isPlayToggleActive(status: PlaybackStatus): boolean {
  return status === "playing" || status === "loading";
}
