import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  isPlayerVisible,
  usePlayback,
} from "../context/PlaybackContext";
import { VolumeControl } from "./VolumeControl";
import {
  isPlayToggleActive,
  togglePlaybackAction,
  usePlayerKeyboard,
} from "./usePlayerKeyboard";
import {
  formatPlaybackTime,
  playbackStatusLabel,
} from "./playbackUtils";
import styles from "../playback.module.css";

export function MiniPlayer() {
  const { t } = useTranslation("playback");
  const {
    state,
    pause,
    resume,
    seek,
    setExpanded,
    stopPlayback,
    replay,
    setVolume,
    volume,
  } = usePlayback();

  const handleToggle = useCallback(() => {
    togglePlaybackAction(state.status, pause, resume, replay);
  }, [state.status, pause, resume, replay]);

  const { handleKeyDown } = usePlayerKeyboard({
    enabled: isPlayerVisible(state),
    onTogglePlayPause: handleToggle,
  });

  if (!isPlayerVisible(state) || !state.currentItem) return null;

  const duration = state.durationSeconds ?? 0;
  const playing = isPlayToggleActive(state.status);
  const statusText = playbackStatusLabel(state.status, t);

  return (
    <div
      className={styles.miniPlayer}
      role="region"
      aria-label={t("nowPlaying")}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.trackInfo}>
        <div className={styles.trackTitle}>{state.currentItem.title}</div>
        {state.currentItem.subtitle ? (
          <div className={styles.trackSubtitle}>
            {state.currentItem.subtitle}
          </div>
        ) : null}
        {statusText ? (
          <div className={styles.statusLabel} aria-live="polite">
            {statusText}
          </div>
        ) : null}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.playerButton}
          onClick={handleToggle}
          aria-label={playing ? t("pause") : t("play")}
          aria-pressed={playing}
        >
          {playing ? t("pause") : state.status === "ended" ? t("replay") : t("play")}
        </button>
        <VolumeControl
          volume={volume}
          onVolumeChange={setVolume}
          compact
        />
        <button
          type="button"
          className={styles.playerButton}
          onClick={stopPlayback}
          aria-label={t("close")}
        >
          {t("close")}
        </button>
      </div>

      <div className={styles.scrubber}>
        <span className={styles.time}>{formatPlaybackTime(state.positionSeconds)}</span>
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 100}
          step={0.1}
          value={Math.min(state.positionSeconds, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label={t("seek")}
          disabled={state.status === "ended"}
        />
        <span className={styles.time}>{formatPlaybackTime(duration)}</span>
      </div>

      <button
        type="button"
        className={styles.expandButton}
        onClick={() => setExpanded(true)}
        aria-label={t("expand")}
      >
        {t("expand")}
      </button>
    </div>
  );
}
