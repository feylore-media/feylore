import { useTranslation } from "react-i18next";
import type { TrackListItem } from "@shared/music";
import styles from "./music.module.css";

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface TrackListProps {
  tracks: TrackListItem[];
  onPlayTrack?: (track: TrackListItem) => void;
  activeTrackId?: string | null;
}

export function TrackList({ tracks, onPlayTrack, activeTrackId }: TrackListProps) {
  const { t } = useTranslation("music");

  if (tracks.length === 0) return null;

  return (
    <ol className={styles.trackList}>
      {tracks.map((track, index) => (
        <li key={track.id} className={styles.trackRow}>
          <span className={styles.trackNumber}>
            {track.trackNumber ?? index + 1}
          </span>
          <div>
            <div className={styles.trackTitle}>{track.title}</div>
            {track.artists.length > 0 && (
              <div className={styles.trackArtist}>{track.artists.join(", ")}</div>
            )}
          </div>
          <span className={styles.trackDuration}>
            {formatDuration(track.durationSeconds)}
          </span>
          {onPlayTrack && track.representationId ? (
            <button
              type="button"
              className={styles.playButton}
              onClick={() => onPlayTrack(track)}
              aria-label={
                activeTrackId === track.id ? t("pause") : t("playTrack")
              }
            >
              {activeTrackId === track.id ? t("pause") : t("play")}
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
