import { useCallback, useEffect } from "react";
import { Icon } from "../../components/icons/Icon";
import { UiMusicPlaceholderIcon } from "../../components/icons/ui-icons";
import { useTranslation } from "react-i18next";
import { usePlayback } from "../context/PlaybackContext";
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

export function FullPlayer() {
  const { t } = useTranslation("playback");
  const {
    state,
    pause,
    resume,
    seek,
    next,
    previous,
    removeFromQueue,
    setExpanded,
    stopPlayback,
    replay,
    setVolume,
    volume,
  } = usePlayback();

  const handleToggle = useCallback(() => {
    togglePlaybackAction(state.status, pause, resume, replay);
  }, [state.status, pause, resume, replay]);

  const handleEscape = useCallback(() => {
    setExpanded(false);
  }, [setExpanded]);

  const { handleKeyDown } = usePlayerKeyboard({
    enabled: state.expanded && state.currentItem !== null,
    onTogglePlayPause: handleToggle,
    onEscape: handleEscape,
  });

  useEffect(() => {
    if (!state.expanded) return;
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setExpanded(false);
    };
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, [state.expanded, setExpanded]);

  if (!state.expanded || !state.currentItem) return null;

  const duration = state.durationSeconds ?? 0;
  const playing = isPlayToggleActive(state.status);
  const statusText = playbackStatusLabel(state.status, t);

  return (
    <div
      className={styles.fullPlayerOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={t("nowPlaying")}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.fullPlayerHeader}>
        <button
          type="button"
          className={styles.playerButton}
          onClick={() => setExpanded(false)}
        >
          {t("collapse")}
        </button>
        <button
          type="button"
          className={styles.playerButton}
          onClick={stopPlayback}
          aria-label={t("close")}
        >
          {t("close")}
        </button>
      </div>

      <div className={styles.fullPlayerArtwork} aria-hidden>
        <Icon icon={UiMusicPlaceholderIcon} size="lg" />
      </div>

      <div className={styles.fullPlayerMeta}>
        <h2>{state.currentItem.title}</h2>
        {state.currentItem.subtitle ? <p>{state.currentItem.subtitle}</p> : null}
        {statusText ? (
          <p className={styles.statusLabel} aria-live="polite">
            {statusText}
          </p>
        ) : null}
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

      <div className={styles.fullPlayerControls}>
        <button
          type="button"
          className={styles.playerButton}
          onClick={() => previous()}
          aria-label={t("previous")}
        >
          {t("previous")}
        </button>
        <button
          type="button"
          className={styles.playerButton}
          onClick={handleToggle}
          aria-label={playing ? t("pause") : t("play")}
          aria-pressed={playing}
        >
          {playing ? t("pause") : state.status === "ended" ? t("replay") : t("play")}
        </button>
        <button
          type="button"
          className={styles.playerButton}
          onClick={() => next()}
          aria-label={t("next")}
        >
          {t("next")}
        </button>
      </div>

      <VolumeControl volume={volume} onVolumeChange={setVolume} />

      {state.status === "ended" ? (
        <div className={styles.finishedActions}>
          <button type="button" className={styles.playerButton} onClick={replay}>
            {t("replay")}
          </button>
          <button
            type="button"
            className={styles.playerButton}
            onClick={stopPlayback}
          >
            {t("close")}
          </button>
        </div>
      ) : null}

      <div className={styles.queue}>
        <h3>{t("queue")}</h3>
        {state.queue.map((item, index) => (
          <div
            key={item.id}
            className={`${styles.queueItem} ${index === state.queueIndex ? styles.queueItemActive : ""}`}
          >
            <span>
              {item.title}
              {item.subtitle ? ` — ${item.subtitle}` : ""}
            </span>
            <button
              type="button"
              className={styles.playerButton}
              onClick={() => removeFromQueue(index)}
              aria-label={t("removeFromQueue")}
            >
              {t("remove")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
