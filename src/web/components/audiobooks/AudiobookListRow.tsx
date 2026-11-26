import { Link } from "react-router";
import type { AudiobookListItem } from "@shared/audiobooks";
import { AudiobookCover } from "./AudiobookCover";
import { audiobookPath } from "../../routes/paths";
import styles from "./audiobooks.module.css";

function formatRuntime(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function progressPct(audiobook: AudiobookListItem): number | null {
  const p = audiobook.progress;
  if (!p?.durationSeconds || p.positionSeconds <= 0) return null;
  return p.positionSeconds / p.durationSeconds;
}

function seriesLabel(audiobook: AudiobookListItem): string | null {
  if (!audiobook.series) return null;
  const pos =
    audiobook.series.position != null ? ` #${audiobook.series.position}` : "";
  return `${audiobook.series.name}${pos}`;
}

export interface AudiobookListRowProps {
  audiobook: AudiobookListItem;
}

export function AudiobookListRow({ audiobook }: AudiobookListRowProps) {
  const pct = progressPct(audiobook);
  const series = seriesLabel(audiobook);
  const runtime = formatRuntime(audiobook.runtimeSeconds);

  return (
    <Link to={audiobookPath(audiobook.slug)} className={styles.listRow}>
      <AudiobookCover
        coverFileId={audiobook.coverFileId}
        title={audiobook.title}
        size="small"
      />
      <div className={styles.listRowBody}>
        <div className={styles.cardTitle}>{audiobook.title}</div>
        {audiobook.authors.length > 0 && (
          <div className={styles.cardMeta}>{audiobook.authors.join(", ")}</div>
        )}
        {audiobook.narrators.length > 0 && (
          <div className={styles.cardMeta}>{audiobook.narrators.join(", ")}</div>
        )}
        {series && <div className={styles.cardSeries}>{series}</div>}
        {runtime && <div className={styles.cardSeries}>{runtime}</div>}
      </div>
      {audiobook.favorite && (
        <span className={styles.cardFavorite} aria-label="Favorite">
          ★
        </span>
      )}
      {pct != null && (
        <div className={`${styles.progressBar} ${styles.listRowProgress}`}>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.round(pct * 100)}%` }}
          />
        </div>
      )}
    </Link>
  );
}
