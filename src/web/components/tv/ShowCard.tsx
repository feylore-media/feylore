import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { TvShowListItem } from "@shared/tv";
import type { PlaybackLocator } from "@shared/playback";
import { TvCover } from "./TvCover";
import { tvEpisodePath, tvShowPath } from "../../routes/paths";
import styles from "./tv.module.css";

function progressPct(progress: PlaybackLocator | null | undefined): number | null {
  if (!progress?.durationSeconds || progress.positionSeconds <= 0) return null;
  return progress.positionSeconds / progress.durationSeconds;
}

export interface ShowCardProps {
  show: TvShowListItem;
}

export function ShowCard({ show }: ShowCardProps) {
  const { t } = useTranslation("tv");
  const continueEp = show.continueEpisode;
  const pct = continueEp ? progressPct(continueEp.progress) : null;
  const href = continueEp
    ? tvEpisodePath(show.slug, continueEp.seasonNumber, continueEp.episodeNumber)
    : tvShowPath(show.slug);

  return (
    <Link to={href} className={styles.card}>
      <div className={styles.cardCoverBlock}>
        <TvCover coverFileId={show.coverFileId} title={show.title} />
        {show.favorite && (
          <span className={styles.cardFavorite} aria-label={t("favorite")}>
            ★
          </span>
        )}
        {pct != null && (
          <div className={styles.progressBar} aria-hidden>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round(pct * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className={styles.cardTitle}>{show.title}</div>
      {show.premiereDate && (
        <div className={styles.cardMeta}>{show.premiereDate}</div>
      )}
      {show.episodeCount > 0 && (
        <div className={styles.cardMeta}>
          {t("episodeCount", { count: show.episodeCount })}
        </div>
      )}
      {continueEp && (
        <div className={styles.cardMeta}>
          {t("continueEpisode", {
            season: continueEp.seasonNumber,
            episode: continueEp.episodeNumber,
          })}
        </div>
      )}
    </Link>
  );
}
