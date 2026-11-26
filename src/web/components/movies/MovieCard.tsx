import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { MovieListItem } from "@shared/movies";
import { MovieCover } from "./MovieCover";
import { moviePath } from "../../routes/paths";
import styles from "./movies.module.css";

function formatRuntime(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function progressPct(movie: MovieListItem): number | null {
  const p = movie.progress;
  if (!p?.durationSeconds || p.positionSeconds <= 0) return null;
  return p.positionSeconds / p.durationSeconds;
}

export interface MovieCardProps {
  movie: MovieListItem;
}

export function MovieCard({ movie }: MovieCardProps) {
  const { t } = useTranslation("movies");
  const pct = progressPct(movie);
  const runtime = formatRuntime(movie.runtimeSeconds);
  const hasProgress = pct != null && pct > 0;

  return (
    <Link to={moviePath(movie.slug)} className={styles.card}>
      <div className={styles.cardCoverBlock}>
        <MovieCover coverFileId={movie.coverFileId} title={movie.title} />
        {movie.favorite && (
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
      <div className={styles.cardTitle}>{movie.title}</div>
      {movie.directors.length > 0 && (
        <div className={styles.cardMeta}>{movie.directors.join(", ")}</div>
      )}
      {movie.releaseDate && (
        <div className={styles.cardMeta}>{movie.releaseDate}</div>
      )}
      {runtime && <div className={styles.cardMeta}>{runtime}</div>}
      {hasProgress && (
        <div className={styles.cardMeta}>{t("continueWatching")}</div>
      )}
    </Link>
  );
}
