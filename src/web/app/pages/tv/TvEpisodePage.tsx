import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { PlaybackManifest } from "@shared/playback";
import type { TvEpisodeDetail } from "@shared/tv";
import { api } from "../../api";
import { useTvEpisode } from "../../../hooks/tv/useTvEpisode";
import { TvCover } from "../../../components/tv/TvCover";
import { Button } from "../../../components/primitives";
import { ErrorState, LoadingState } from "../../../components/states";
import {
  isActivePlaybackSubject,
  usePlayback,
} from "../../../playback/context/PlaybackContext";
import { useDownloads } from "../../../downloads/useDownloads";
import {
  tvEpisodePath,
  tvSeasonPath,
  tvShowPath,
} from "../../../routes/paths";
import styles from "../../../components/tv/tv.module.css";

function formatRuntime(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function selectPrimaryRepresentationId(
  episode: TvEpisodeDetail,
): string | null {
  const progressRepId = episode.userState.progressRepresentationId;
  if (
    progressRepId &&
    episode.representations.some((r) => r.id === progressRepId)
  ) {
    return progressRepId;
  }
  return episode.representations[0]?.id ?? null;
}

async function playEpisodeWithQueue(
  episode: TvEpisodeDetail,
  playManifest: (
    manifest: PlaybackManifest,
    options?: { append?: boolean },
  ) => Promise<void>,
) {
  const currentRes = await api<{ data: PlaybackManifest }>(
    `/tv/episodes/${episode.id}/playback`,
  );
  await playManifest({
    ...currentRes.data,
    sessionMode: "persistent",
  });

  const next = episode.nextEpisode;
  if (!next) return;

  const nextRes = await api<{ data: PlaybackManifest }>(
    `/tv/episodes/${next.episodeId}/playback`,
  );
  await playManifest(
    { ...nextRes.data, sessionMode: "persistent" },
    { append: true },
  );
}

export function TvEpisodePage() {
  const { t } = useTranslation("tv");
  const { t: td } = useTranslation("downloads");
  const { slug, season: seasonParam, episode: episodeParam } = useParams<{
    slug: string;
    season: string;
    episode: string;
  }>();
  const { episode, loading, error } = useTvEpisode(
    slug,
    seasonParam,
    episodeParam,
  );
  const { playManifest, state: playbackState, pause, resume } = usePlayback();
  const { getDownloadForFile, startDownload, activeProgress } = useDownloads();
  const [startingPlayback, setStartingPlayback] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  const primaryRepresentationId = useMemo(
    () => (episode ? selectPrimaryRepresentationId(episode) : null),
    [episode],
  );

  const primaryRep = episode?.representations.find(
    (r) => r.id === primaryRepresentationId,
  );
  const primaryFileId =
    primaryRep?.files.find((f) => f.role === "content")?.id ??
    primaryRep?.files[0]?.id;
  const videoDownload = primaryFileId
    ? getDownloadForFile(primaryFileId)
    : undefined;

  const isThisEpisodeActive = useMemo(
    () =>
      episode
        ? isActivePlaybackSubject(playbackState, "tv_episode", episode.id)
        : false,
    [episode, playbackState],
  );

  const isThisEpisodePlaying = useMemo(
    () =>
      isThisEpisodeActive &&
      (playbackState.status === "playing" || playbackState.status === "loading"),
    [isThisEpisodeActive, playbackState.status],
  );

  const handlePlay = useCallback(async () => {
    if (!episode) return;

    if (
      isThisEpisodeActive &&
      playbackState.status === "paused" &&
      playbackState.currentItem?.representationId === primaryRepresentationId
    ) {
      resume();
      return;
    }

    if (
      isThisEpisodeActive &&
      (playbackState.status === "playing" ||
        playbackState.status === "loading")
    ) {
      pause();
      return;
    }

    setPlayError(null);
    setStartingPlayback(true);
    try {
      if (primaryRepresentationId) {
        await playEpisodeWithQueue(episode, playManifest);
      } else {
        throw new Error(t("playError"));
      }
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : t("playError"));
    } finally {
      setStartingPlayback(false);
    }
  }, [
    episode,
    isThisEpisodeActive,
    pause,
    playManifest,
    playbackState.currentItem?.representationId,
    playbackState.status,
    primaryRepresentationId,
    resume,
    t,
  ]);

  if (loading) return <LoadingState />;
  if (error || !episode || !slug || !seasonParam) {
    return <ErrorState message={error ?? t("episodeNotFound")} />;
  }

  async function handleDownload() {
    if (!primaryRep || !primaryFileId) return;
    await startDownload(primaryFileId, primaryRep.id);
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

  const progress = episode.userState.progress;
  const progressPct =
    progress?.durationSeconds && progress.positionSeconds > 0
      ? Math.round(
          (progress.positionSeconds / progress.durationSeconds) * 100,
        )
      : null;
  const hasProgress = progressPct != null && progressPct > 0;
  const runtime = formatRuntime(episode.runtimeSeconds);
  const longDescription = (episode.description?.length ?? 0) > 400;
  const nextEp = episode.nextEpisode;

  function playButtonLabel(): string {
    if (isThisEpisodeActive && isThisEpisodePlaying) return t("pause");
    if (isThisEpisodeActive && playbackState.status === "paused") {
      return t("continueWatching");
    }
    return hasProgress ? t("continueWatching") : t("watch");
  }

  return (
    <div>
      <nav className={styles.backLink}>
        <Link to={tvShowPath(slug)}>{episode.showTitle}</Link>
        {" · "}
        <Link to={tvSeasonPath(slug, episode.seasonNumber)}>
          {t("seasonLabel", { number: episode.seasonNumber })}
        </Link>
      </nav>

      {playError && (
        <div className={styles.errorBanner} role="alert">
          {playError}
        </div>
      )}

      <div className={styles.detailHero}>
        <div className={styles.detailHeroCover}>
          <TvCover coverFileId={episode.coverFileId} title={episode.title} />
        </div>
        <div className={styles.detailInfo}>
          <h1 className={styles.detailTitle}>
            {t("episodeLabel", { number: episode.episodeNumber })}:{" "}
            {episode.title}
          </h1>
          {episode.airDate && (
            <p className={styles.detailMeta}>{episode.airDate}</p>
          )}
          {runtime && (
            <p className={styles.detailMeta}>
              {t("runtime")}: {runtime}
            </p>
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
          </div>
        </div>
      </div>

      {episode.description ? (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("description")}</h2>
          <p
            className={`${styles.detailDescription} ${!descExpanded && longDescription ? styles.detailDescriptionCollapsed : ""}`}
          >
            {episode.description}
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
      ) : null}

      {nextEp && (
        <section className={styles.detailSection}>
          <Link
            to={tvEpisodePath(
              slug,
              nextEp.seasonNumber,
              nextEp.episodeNumber,
            )}
            className={styles.cardMeta}
          >
            {t("nextEpisode", {
              season: nextEp.seasonNumber,
              episode: nextEp.episodeNumber,
              title: nextEp.title,
            })}
          </Link>
        </section>
      )}
    </div>
  );
}
