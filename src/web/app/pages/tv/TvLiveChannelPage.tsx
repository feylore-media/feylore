import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { NavBackLink } from "../../../components/icons/NavLinks";
import { useTranslation } from "react-i18next";
import type { LiveTvChannelPublic } from "@shared/tv";
import type { PlaybackManifest } from "@shared/playback";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { ErrorState, LoadingState } from "../../../components/states";
import { usePlayback } from "../../../playback/context/PlaybackContext";
import styles from "../../../components/tv/tv.module.css";

export function TvLiveChannelPage() {
  const { t } = useTranslation("tv");
  const { channelId } = useParams<{ channelId: string }>();
  const [channel, setChannel] = useState<LiveTvChannelPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingPlayback, setStartingPlayback] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const { playManifest, state: playbackState, pause, resume } = usePlayback();

  const load = useCallback(() => {
    if (!channelId) return;
    setLoading(true);
    setError(null);
    void api<{ data: LiveTvChannelPublic }>(`/tv/live/channels/${channelId}`)
      .then((r) => setChannel(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setChannel(null);
      })
      .finally(() => setLoading(false));
  }, [channelId]);

  useEffect(() => {
    load();
  }, [load]);

  const isThisChannelActive = useMemo(() => {
    if (!channel) return false;
    const item = playbackState.currentItem;
    if (!item) return false;
    return item.subject.id === channel.id;
  }, [channel, playbackState.currentItem]);

  const isPlaying = useMemo(
    () =>
      isThisChannelActive &&
      (playbackState.status === "playing" || playbackState.status === "loading"),
    [isThisChannelActive, playbackState.status],
  );

  const handlePlay = useCallback(async () => {
    if (!channelId || !channel) return;

    if (isThisChannelActive && playbackState.status === "paused") {
      resume();
      return;
    }

    if (isPlaying) {
      pause();
      return;
    }

    setPlayError(null);
    setStartingPlayback(true);
    try {
      const manifestRes = await api<{ data: PlaybackManifest }>(
        `/tv/live/channels/${channelId}/playback`,
      );
      await playManifest({
        ...manifestRes.data,
        sessionMode: "persistent",
      });
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : t("playError"));
    } finally {
      setStartingPlayback(false);
    }
  }, [
    channel,
    channelId,
    isPlaying,
    isThisChannelActive,
    pause,
    playManifest,
    playbackState.status,
    resume,
    t,
  ]);

  if (loading) return <LoadingState />;
  if (error || !channel || !channelId) {
    return <ErrorState message={error ?? t("channelNotFound")} />;
  }

  return (
    <div>
      <NavBackLink to="/tv/live">{t("live")}</NavBackLink>

      {playError && (
        <div className={styles.errorBanner} role="alert">
          {playError}
        </div>
      )}

      <div className={styles.detailHero}>
        {channel.logoUrl ? (
          <img
            src={channel.logoUrl}
            alt=""
            className={styles.channelLogo}
            style={{ width: "10rem" }}
          />
        ) : (
          <div
            className={styles.channelLogoPlaceholder}
            style={{ width: "10rem" }}
          >
            {channel.name.charAt(0)}
          </div>
        )}
        <div className={styles.detailInfo}>
          <h1 className={styles.detailTitle}>{channel.name}</h1>
          {channel.groupTitle && (
            <p className={styles.detailMeta}>{channel.groupTitle}</p>
          )}
          {channel.currentProgram && (
            <div className={styles.detailSection}>
              <p className={styles.detailMeta}>{t("nowPlaying")}</p>
              <p className={styles.episodeTitle}>
                {channel.currentProgram.title}
              </p>
              {channel.currentProgram.description && (
                <p className={styles.cardMeta}>
                  {channel.currentProgram.description}
                </p>
              )}
            </div>
          )}
          <div className={styles.detailActions}>
            <Button
              variant="primary"
              type="button"
              disabled={startingPlayback}
              onClick={() => void handlePlay()}
            >
              {startingPlayback
                ? t("loading")
                : isPlaying
                  ? t("pause")
                  : t("watch")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
