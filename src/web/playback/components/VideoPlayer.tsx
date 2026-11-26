import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePlayback } from "../context/PlaybackContext";
import { VideoEngine } from "../engine/VideoEngine";
import {
  formatPlaybackTime,
  playbackStatusLabel,
} from "./playbackUtils";
import {
  isPlayToggleActive,
  togglePlaybackAction,
  usePlayerKeyboard,
} from "./usePlayerKeyboard";
import styles from "../playback.module.css";

export function VideoPlayer() {
  const { t } = useTranslation("playback");
  const { state, pause, resume, seek, setExpanded, stopPlayback, replay } =
    usePlayback();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || state.currentItem?.mediaKind !== "video") return;
    const engine = (window as unknown as { __feyloreVideoEngine?: VideoEngine })
      .__feyloreVideoEngine;
    if (engine instanceof VideoEngine) {
      engine.attachTo(container);
    }
  }, [state.currentItem?.mediaKind, state.currentItem?.id]);

  const handleToggle = () => {
    togglePlaybackAction(state.status, pause, resume, replay);
  };

  const { handleKeyDown } = usePlayerKeyboard({
    enabled: state.currentItem?.mediaKind === "video",
    onTogglePlayPause: handleToggle,
    onEscape: () => setExpanded(false),
  });

  if (state.currentItem?.mediaKind !== "video") return null;

  const duration = state.durationSeconds ?? 0;
  const playing = isPlayToggleActive(state.status);
  const statusText = playbackStatusLabel(state.status, t);

  return (
    <div
      className={styles.videoPlayerOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={t("nowPlaying")}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.videoPlayerHeader}>
        <div className={styles.videoPlayerTitle}>
          <div>{state.currentItem.title}</div>
          {state.currentItem.subtitle ? (
            <div className={styles.videoPlayerSubtitle}>
              {state.currentItem.subtitle}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.playerButton}
          onClick={() => stopPlayback()}
        >
          {t("close")}
        </button>
      </div>
      <div ref={containerRef} className={styles.videoPlayerSurface} />
      <div className={styles.videoPlayerControls}>
        <div className={styles.videoPlayerProgressRow}>
          <span className={styles.timeLabel}>
            {formatPlaybackTime(state.positionSeconds)}
          </span>
          <input
            type="range"
            className={styles.seekBar}
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.1}
            value={Math.min(state.positionSeconds, duration || 0)}
            onChange={(e) => seek(parseFloat(e.target.value))}
            aria-label={t("seek")}
          />
          <span className={styles.timeLabel}>
            {formatPlaybackTime(duration)}
          </span>
        </div>
        <div className={styles.videoPlayerActions}>
          <button
            type="button"
            className={styles.playerButtonPrimary}
            onClick={handleToggle}
          >
            {playing ? t("pause") : t("play")}
          </button>
          <span className={styles.playerStatus}>{statusText}</span>
        </div>
      </div>
    </div>
  );
}
