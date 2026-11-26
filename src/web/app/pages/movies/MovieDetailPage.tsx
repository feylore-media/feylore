import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { NavBackLink } from "../../../components/icons/NavLinks";
import { useTranslation } from "react-i18next";
import type { MovieDetail } from "@shared/movies";
import type { PlaybackManifest } from "@shared/playback";
import { api } from "../../api";
import { useMovieDetail } from "../../../hooks/movies/useMovieDetail";
import { MovieCover } from "../../../components/movies/MovieCover";
import { Button } from "../../../components/primitives";
import { ErrorState, LoadingState } from "../../../components/states";
import {
  isActivePlaybackSubject,
  usePlayback,
} from "../../../playback/context/PlaybackContext";
import { useDownloads } from "../../../downloads/useDownloads";
import {
  movieCollectionPath,
  moviePersonPath,
} from "../../../routes/paths";
import styles from "../../../components/movies/movies.module.css";

function formatRuntime(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function selectPrimaryRepresentationId(
  movie: MovieDetail,
): string | null {
  const progressRepId = movie.userState.progressRepresentationId;
  if (
    progressRepId &&
    movie.representations.some((r) => r.id === progressRepId)
  ) {
    return progressRepId;
  }
  return movie.representations[0]?.id ?? null;
}

export function MovieDetailPage() {
  const { t } = useTranslation("movies");
  const { t: td } = useTranslation("downloads");
  const { slug } = useParams<{ slug: string }>();
  const { movie, loading, error, updateUserState } = useMovieDetail(slug);
  const { playManifest, state: playbackState, pause, resume } = usePlayback();
  const { getDownloadForFile, startDownload, activeProgress } = useDownloads();
  const [rating, setRating] = useState<number | null>(null);
  const [startingPlayback, setStartingPlayback] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    if (movie) setRating(movie.userState.rating);
  }, [movie]);

  const primaryRepresentationId = useMemo(
    () => (movie ? selectPrimaryRepresentationId(movie) : null),
    [movie],
  );

  const primaryRep = movie?.representations.find(
    (r) => r.id === primaryRepresentationId,
  );
  const primaryFileId =
    primaryRep?.files.find((f) => f.role === "content")?.id ??
    primaryRep?.files[0]?.id;
  const videoDownload = primaryFileId
    ? getDownloadForFile(primaryFileId)
    : undefined;

  const isThisMovieActive = useMemo(
    () =>
      movie
        ? isActivePlaybackSubject(playbackState, "movie", movie.id)
        : false,
    [movie, playbackState],
  );

  const isThisMoviePlaying = useMemo(
    () =>
      isThisMovieActive &&
      (playbackState.status === "playing" || playbackState.status === "loading"),
    [isThisMovieActive, playbackState.status],
  );

  const handlePlay = useCallback(async () => {
    if (!movie) return;

    if (
      isThisMovieActive &&
      playbackState.status === "paused" &&
      playbackState.currentItem?.representationId === primaryRepresentationId
    ) {
      resume();
      return;
    }

    if (
      isThisMovieActive &&
      (playbackState.status === "playing" ||
        playbackState.status === "loading")
    ) {
      pause();
      return;
    }

    setPlayError(null);
    setStartingPlayback(true);
    try {
      let manifest: PlaybackManifest;
      if (primaryRepresentationId) {
        const manifestRes = await api<{ data: PlaybackManifest }>(
          `/representations/${primaryRepresentationId}/playback`,
        );
        manifest = manifestRes.data;
      } else {
        const manifestRes = await api<{ data: PlaybackManifest }>(
          `/movies/${movie.slug}/playback`,
        );
        manifest = manifestRes.data;
      }
      await playManifest({ ...manifest, sessionMode: "persistent" });
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : t("playError"));
    } finally {
      setStartingPlayback(false);
    }
  }, [
    isThisMovieActive,
    movie,
    pause,
    playManifest,
    playbackState.currentItem?.representationId,
    playbackState.status,
    primaryRepresentationId,
    resume,
    t,
  ]);

  if (loading) return <LoadingState />;
  if (error || !movie || !slug) {
    return (
      <ErrorState message={error ?? t("movieNotFound")} />
    );
  }

  async function toggleFavorite() {
    const next = !movie!.userState.favorite;
    await api(`/movies/${movie!.slug}/favorite`, {
      method: "PUT",
      body: JSON.stringify({ favorite: next }),
    });
    updateUserState({ favorite: next });
  }

  async function handleDownload() {
    if (!primaryRep || !primaryFileId) return;
    await startDownload(primaryFileId, primaryRep.id);
  }

  async function setMovieRating(value: number) {
    await api(`/movies/${movie!.slug}/rating`, {
      method: "PUT",
      body: JSON.stringify({ rating: value }),
    });
    setRating(value);
    updateUserState({ rating: value });
  }

  async function clearMovieRating() {
    await api(`/movies/${movie!.slug}/rating`, {
      method: "PUT",
      body: JSON.stringify({ rating: null }),
    });
    setRating(null);
    updateUserState({ rating: null });
  }

  function renderDownloadLabel() {
    if (!primaryRep || !primaryFileId) return td("download");

    if (videoDownload?.status === "available") return td("downloaded");
    if (
      videoDownload?.status === "queued" ||
      videoDownload?.status === "in_progress"
    ) {
      const progress = videoDownload.id
        ? activeProgress[videoDownload.id]
        : undefined;
      if (progress != null && videoDownload.bytesTotal) {
        return td("progress", {
          percent: Math.min(
            100,
            Math.round((progress / videoDownload.bytesTotal) * 100),
          ),
        });
      }
      return td("downloading");
    }
    if (videoDownload?.status === "failed") return td("retry");
    return td("download");
  }

  const downloadDisabled =
    videoDownload?.status === "queued" ||
    videoDownload?.status === "in_progress" ||
    videoDownload?.status === "available";

  const progress = movie.userState.progress;
  const progressPct =
    progress?.durationSeconds && progress.positionSeconds > 0
      ? Math.round(
          (progress.positionSeconds / progress.durationSeconds) * 100,
        )
      : null;
  const hasProgress = progressPct != null && progressPct > 0;
  const runtime = formatRuntime(movie.runtimeSeconds);
  const directors = movie.credits.filter((c) =>
    c.role.toLowerCase().includes("director"),
  );
  const longDescription = (movie.description?.length ?? 0) > 400;

  function playButtonLabel(): string {
    if (isThisMovieActive && isThisMoviePlaying) return t("pause");
    if (isThisMovieActive && playbackState.status === "paused") {
      return t("continueWatching");
    }
    return hasProgress ? t("continueWatching") : t("watch");
  }

  return (
    <div>
      <NavBackLink to="/movies/browse">{t("backToLibrary")}</NavBackLink>

      {playError && (
        <div className={styles.errorBanner} role="alert">
          {playError}
        </div>
      )}

      <div className={styles.detailHero}>
        <div className={styles.detailHeroCover}>
          <MovieCover coverFileId={movie.coverFileId} title={movie.title} />
        </div>
        <div className={styles.detailInfo}>
          <h1 className={styles.detailTitle}>{movie.title}</h1>
          {movie.subtitle && (
            <p className={styles.detailSubtitle}>{movie.subtitle}</p>
          )}
          {directors.length > 0 && (
            <p className={styles.detailMeta}>
              {directors.map((d, i) => (
                <span key={d.id}>
                  {i > 0 ? ", " : ""}
                  <Link to={moviePersonPath(d.personSlug)}>{d.name}</Link>
                </span>
              ))}
            </p>
          )}
          {movie.releaseDate && (
            <p className={styles.detailMeta}>
              {t("releaseDate", { date: movie.releaseDate })}
            </p>
          )}
          {runtime && (
            <p className={styles.detailMeta}>
              {t("runtime")}: {runtime}
            </p>
          )}
          {movie.contentRating && (
            <p className={styles.detailMeta}>
              {t("contentRating")}: {movie.contentRating}
            </p>
          )}
          {movie.studio && (
            <p className={styles.detailMeta}>
              {t("studio")}: {movie.studio}
            </p>
          )}
          {movie.genres.length > 0 && (
            <p className={styles.detailMeta}>{movie.genres.join(", ")}</p>
          )}
          {progressPct != null && (
            <p className={styles.detailMeta}>
              {t("progressPercent", { percent: progressPct })}
              <div
                className={styles.progressBar}
                style={{ marginTop: "var(--space-2)", position: "static" }}
              >
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </p>
          )}
          <div className={styles.detailActions}>
            {primaryRepresentationId && (
              <Button
                variant="primary"
                type="button"
                disabled={startingPlayback}
                onClick={() => void handlePlay()}
              >
                {startingPlayback ? t("loading") : playButtonLabel()}
              </Button>
            )}
            {primaryFileId && (
              <Button
                type="button"
                onClick={() => void handleDownload()}
                disabled={downloadDisabled}
              >
                {renderDownloadLabel()}
              </Button>
            )}
            <Button type="button" onClick={() => void toggleFavorite()}>
              {movie.userState.favorite ? t("unfavorite") : t("favorite")}
            </Button>
          </div>
        </div>
      </div>

      {movie.description ? (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("description")}</h2>
          <p
            className={`${styles.detailDescription} ${!descExpanded && longDescription ? styles.detailDescriptionCollapsed : ""}`}
          >
            {movie.description}
          </p>
          {longDescription && (
            <button
              type="button"
              className={styles.expandBtn}
              onClick={() => setDescExpanded((e) => !e)}
            >
              {descExpanded ? t("showLess") : t("showMore")}
            </button>
          )}
        </section>
      ) : (
        <p className={styles.cardMeta}>{t("noDescription")}</p>
      )}

      {movie.collections.length > 0 && (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("collections")}</h2>
          <ul className={styles.genreList}>
            {movie.collections.map((collection) => (
              <li key={collection.id}>
                <Link
                  to={movieCollectionPath(collection.slug)}
                  className={styles.genreLink}
                >
                  {collection.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {movie.credits.length > 0 && (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("credits")}</h2>
          <ul className={styles.creditList}>
            {movie.credits.map((credit) => (
              <li key={credit.id} className={styles.creditRow}>
                <Link to={moviePersonPath(credit.personSlug)}>{credit.name}</Link>
                <span className={styles.creditRole}>
                  {" "}
                  — {credit.role}
                  {credit.character ? ` (${credit.character})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {movie.representations.length > 0 && (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("representations")}</h2>
          {movie.representations.map((rep) => (
            <div key={rep.id} className={styles.formatRow}>
              <span className={styles.formatBadge}>
                {rep.format.toUpperCase()}
              </span>
              {formatRuntime(rep.runtimeSeconds) && (
                <span className={styles.cardMeta}>
                  {formatRuntime(rep.runtimeSeconds)}
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      <section className={styles.detailSection}>
        <h2 className={styles.detailSectionTitle}>{t("rate")}</h2>
        <div className={styles.starRating} role="group" aria-label={t("rate")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Button
              key={n}
              type="button"
              className={`${styles.starButton} ${rating != null && n <= rating ? styles.starFilled : ""}`}
              onClick={() => void setMovieRating(n)}
              aria-pressed={rating === n}
              aria-label={`${n} stars`}
            >
              ★
            </Button>
          ))}
          {rating != null && (
            <Button type="button" onClick={() => void clearMovieRating()}>
              {t("clearRating")}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
