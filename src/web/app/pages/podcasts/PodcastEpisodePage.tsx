import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { PodcastEpisodeDetail, PodcastPrepareResult } from "@shared/podcasts";
import type { PlaybackManifest } from "@shared/playback";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { PodcastDescription } from "../../../components/podcasts/PodcastDescription";
import {
  isActivePlaybackSubject,
  usePlayback,
} from "../../../playback/context/PlaybackContext";
import { useDownloads } from "../../../downloads/useDownloads";
import styles from "../../../components/audiobooks/audiobooks.module.css";

async function prepareEpisode(
  showSlug: string,
  episodeSlug: string,
): Promise<PodcastPrepareResult> {
  const res = await api<{ data: PodcastPrepareResult }>(
    `/podcasts/${showSlug}/episodes/${episodeSlug}/prepare`,
    { method: "POST" },
  );
  return res.data;
}

export function PodcastEpisodePage() {
  const { t } = useTranslation("podcasts");
  const { t: td } = useTranslation("downloads");
  const { slug: showSlug, episodeSlug } = useParams<{
    slug: string;
    episodeSlug: string;
  }>();
  const [episode, setEpisode] = useState<PodcastEpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const { playManifest, state: playbackState, pause, resume } = usePlayback();
  const { startDownload } = useDownloads();

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!showSlug || !episodeSlug) return;
    if (!options?.silent) setLoading(true);
    void api<{ data: PodcastEpisodeDetail }>(
      `/podcasts/${showSlug}/episodes/${episodeSlug}`,
    )
      .then((r) => setEpisode(r.data))
      .finally(() => {
        if (!options?.silent) setLoading(false);
      });
  }, [showSlug, episodeSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const isThisEpisodeActive = useMemo(
    () =>
      episode
        ? isActivePlaybackSubject(
            playbackState,
            "podcast_episode",
            episode.id,
          )
        : false,
    [episode, playbackState],
  );

  const isPlaying =
    isThisEpisodeActive &&
    (playbackState.status === "playing" || playbackState.status === "loading");

  const ensurePrepared = useCallback(async () => {
    if (!showSlug || !episodeSlug) throw new Error("Missing route");
    if (episode?.prepareStatus === "ready" && episode.representationId) {
      return episode.representationId;
    }
    setPreparing(true);
    setPlayError(null);
    try {
      const result = await prepareEpisode(showSlug, episodeSlug);
      if (result.prepareStatus !== "ready" || !result.representationId) {
        throw new Error(
          result.prepareError ??
            (result.prepareStatus === "pending"
              ? t("prepareTimeout")
              : t("prepareFailed")),
        );
      }
      load({ silent: true });
      return result.representationId;
    } catch (err) {
      load({ silent: true });
      throw err;
    } finally {
      setPreparing(false);
    }
  }, [showSlug, episodeSlug, episode, load, t]);

  const handlePlay = useCallback(async () => {
    if (!episode) return;
    if (isThisEpisodeActive && playbackState.status === "paused") {
      resume();
      return;
    }
    if (isPlaying) {
      pause();
      return;
    }
    setPlayError(null);
    try {
      const representationId = await ensurePrepared();
      const manifestRes = await api<{ data: PlaybackManifest }>(
        `/representations/${representationId}/playback`,
      );
      await playManifest(manifestRes.data);
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : t("prepareFailed"));
    }
  }, [
    episode,
    isThisEpisodeActive,
    isPlaying,
    playbackState.status,
    ensurePrepared,
    playManifest,
    pause,
    resume,
    t,
  ]);

  const handleDownload = useCallback(async () => {
    if (!episode) return;
    try {
      const representationId = await ensurePrepared();
      const manifestRes = await api<{ data: PlaybackManifest }>(
        `/representations/${representationId}/playback`,
      );
      const fileId = manifestRes.data.sources[0]?.fileId;
      if (!fileId) throw new Error(t("prepareFailed"));
      await startDownload(fileId, representationId);
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : t("prepareFailed"));
    }
  }, [episode, ensurePrepared, startDownload, t]);

  if (loading || !episode || !showSlug) return <p>…</p>;

  return (
    <div className={styles.detailPage}>
      <nav>
        <Link to={`/audiobooks/podcasts/${showSlug}`}>{episode.showTitle}</Link>
      </nav>
      <header className={styles.detailHero}>
        <h1>{episode.title}</h1>
        {episode.description ? (
          <PodcastDescription text={episode.description} />
        ) : null}
        {episode.publishedAt ? (
          <p className={styles.cardMeta}>
            {new Date(episode.publishedAt).toLocaleString()}
          </p>
        ) : null}
      </header>

      <div className={styles.emptyInlineActions}>
        <Button
          type="button"
          variant="primary"
          onClick={() => void handlePlay()}
          disabled={preparing}
        >
          {preparing
            ? t("preparing")
            : isPlaying
              ? t("play")
              : isThisEpisodeActive && playbackState.status === "paused"
                ? t("play")
                : t("play")}
        </Button>
        <Button
          type="button"
          onClick={() => void handleDownload()}
          disabled={preparing}
        >
          {td("download")}
        </Button>
      </div>

      {playError ? <p className={styles.errorText}>{playError}</p> : null}
      {!playError && episode.prepareError && episode.prepareStatus === "failed" ? (
        <p className={styles.errorText}>{episode.prepareError}</p>
      ) : null}
      {preparing ? <p>{t("preparing")}</p> : null}
    </div>
  );
}
