import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { HomeTvContinueItem } from "@shared/home";
import type { PlaybackLocator } from "@shared/playback";
import { TvCover } from "./TvCover";
import styles from "./tv.module.css";

function progressPct(progress: PlaybackLocator | null): number | null {
  if (!progress?.durationSeconds || progress.positionSeconds <= 0) return null;
  return progress.positionSeconds / progress.durationSeconds;
}

export interface TvContinueCardProps {
  item: HomeTvContinueItem;
}

export function TvContinueCard({ item }: TvContinueCardProps) {
  const { t } = useTranslation("tv");
  const pct = progressPct(item.progress);

  return (
    <Link to={item.href} className={styles.card}>
      <div className={styles.cardCoverBlock}>
        <TvCover coverFileId={item.coverFileId} title={item.showTitle} />
        {pct != null && (
          <div className={styles.progressBar} aria-hidden>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className={styles.cardTitle}>{item.showTitle}</div>
      <div className={styles.cardMeta}>
        {t("continueEpisode", {
          season: item.seasonNumber,
          episode: item.episodeNumber,
        })}
      </div>
      {item.episodeTitle && (
        <div className={styles.cardMeta}>{item.episodeTitle}</div>
      )}
    </Link>
  );
}
