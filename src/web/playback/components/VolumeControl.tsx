import { useTranslation } from "react-i18next";
import styles from "../playback.module.css";

interface VolumeControlProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  compact?: boolean;
}

export function VolumeControl({
  volume,
  onVolumeChange,
  compact,
}: VolumeControlProps) {
  const { t } = useTranslation("playback");
  const muted = volume === 0;

  return (
    <div className={styles.volumeControl}>
      <button
        type="button"
        className={styles.playerButton}
        onClick={() => onVolumeChange(muted ? 1 : 0)}
        aria-label={muted ? t("unmute") : t("mute")}
        aria-pressed={muted}
      >
        {muted ? t("unmute") : t("mute")}
      </button>
      {!compact ? (
        <input
          type="range"
          className={styles.volumeSlider}
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          aria-label={t("volume")}
        />
      ) : null}
    </div>
  );
}
