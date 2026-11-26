import { Link, useParams } from "react-router";
import { NavBackLink } from "../../../components/icons/NavLinks";
import { useTranslation } from "react-i18next";
import type { PlaybackLocator } from "@shared/playback";
import { useTvSeasonDetail } from "../../../hooks/tv/useTvShowDetail";
import { ErrorState, LoadingState } from "../../../components/states";
import {
  tvEpisodePath,
  tvShowPath,
} from "../../../routes/paths";
import styles from "../../../components/tv/tv.module.css";

function formatRuntime(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  return `${m}m`;
}

function progressPct(progress: PlaybackLocator | null): number | null {
  if (!progress?.durationSeconds || progress.positionSeconds <= 0) return null;
  return Math.round(
    (progress.positionSeconds / progress.durationSeconds) * 100,
  );
}

export function TvSeasonPage() {
  const { t } = useTranslation("tv");
  const { slug, season: seasonParam } = useParams<{
    slug: string;
    season: string;
  }>();
  const { season, loading, error } = useTvSeasonDetail(slug, seasonParam);

  if (loading) return <LoadingState />;
  if (error || !season || !slug || !seasonParam) {
    return <ErrorState message={error ?? t("seasonNotFound")} />;
  }

  const seasonLabel =
    season.title ?? t("seasonLabel", { number: season.seasonNumber });

  return (
    <div>
      <NavBackLink to={tvShowPath(slug)}>{season.showTitle}</NavBackLink>

      <h1 className={styles.pageTitle}>{seasonLabel}</h1>

      {season.progress.totalEpisodes > 0 && (
        <p className={styles.detailMeta}>
          {t("seasonProgress", {
            watched: season.progress.watchedCount,
            total: season.progress.totalEpisodes,
          })}
        </p>
      )}

      {season.description && (
        <p className={styles.detailDescription}>{season.description}</p>
      )}

      <section className={styles.detailSection}>
        <h2 className={styles.detailSectionTitle}>{t("episodes")}</h2>
        <ul className={styles.episodeList}>
          {season.episodes.map((episode) => {
            const pct = progressPct(episode.progress);
            const runtime = formatRuntime(episode.runtimeSeconds);
            return (
              <li key={episode.id} className={styles.episodeRow}>
                <Link
                  to={tvEpisodePath(
                    slug,
                    season.seasonNumber,
                    episode.episodeNumber,
                  )}
                  className={styles.episodeLink}
                >
                  <span className={styles.episodeNumber}>
                    {episode.episodeNumber}
                  </span>
                  <div className={styles.episodeInfo}>
                    <p className={styles.episodeTitle}>{episode.title}</p>
                    {runtime && (
                      <p className={styles.episodeMeta}>{runtime}</p>
                    )}
                  </div>
                  {pct != null && (
                    <div className={styles.episodeProgress} aria-hidden>
                      <div
                        className={styles.episodeProgressFill}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
