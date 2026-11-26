import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { LiveTvChannelPublic, LiveTvPlaylistPublic } from "@shared/tv";
import { api } from "../../api";
import { Button } from "../../../components/primitives";
import { LoadingState } from "../../../components/states";
import { tvLiveChannelPath } from "../../../routes/paths";
import styles from "../../../components/tv/tv.module.css";

async function fetchAllChannels(): Promise<LiveTvChannelPublic[]> {
  const playlistsRes = await api<{ data: LiveTvPlaylistPublic[] }>(
    "/tv/live/playlists",
  );
  const channels = await Promise.all(
    playlistsRes.data.map((playlist) =>
      api<{ data: LiveTvChannelPublic[] }>(
        `/tv/live/playlists/${playlist.id}/channels`,
      ).then((r) => r.data),
    ),
  );
  return channels.flat().filter((channel) => channel.enabled);
}

export function TvLivePage() {
  const { t } = useTranslation("tv");
  const [channels, setChannels] = useState<LiveTvChannelPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchAllChannels()
      .then(setChannels)
      .catch((e: Error) => {
        setError(e.message);
        setChannels([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <h1 className={styles.pageTitle}>{t("live")}</h1>

      {error && (
        <div className={styles.errorBanner} role="alert">
          <span>{t("loadError")}</span>
          <Button type="button" onClick={load}>
            {t("retry")}
          </Button>
        </div>
      )}

      {channels.length === 0 ? (
        <div className={styles.emptyInline}>
          <h2 className={styles.emptyInlineTitle}>{t("noChannels")}</h2>
          <p className={styles.emptyInlineDetail}>{t("noChannelsDetail")}</p>
        </div>
      ) : (
        <div className={styles.channelGrid}>
          {channels.map((channel) => (
            <Link
              key={channel.id}
              to={tvLiveChannelPath(channel.id)}
              className={styles.channelCard}
            >
              {channel.logoUrl ? (
                <img
                  src={channel.logoUrl}
                  alt=""
                  className={styles.channelLogo}
                  loading="lazy"
                />
              ) : (
                <div className={styles.channelLogoPlaceholder}>
                  {channel.name.charAt(0)}
                </div>
              )}
              <p className={styles.channelName}>{channel.name}</p>
              {channel.groupTitle && (
                <p className={styles.channelGroup}>{channel.groupTitle}</p>
              )}
              {channel.currentProgram && (
                <p className={styles.channelGroup}>
                  {channel.currentProgram.title}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
