import { useCallback, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { PlaybackManifest } from "@shared/playback";
import type { TrackListItem } from "@shared/music";
import { api } from "../../api";
import { usePlaylistDetail } from "../../../hooks/music/usePlaylists";
import { TrackList } from "../../../components/music/TrackList";
import { LoadingState } from "../../../components/states";
import { Button } from "../../../components/primitives";
import {
  isActivePlaybackSubject,
  usePlayback,
} from "../../../playback/context/PlaybackContext";
import styles from "../../../components/music/music.module.css";

export function PlaylistDetailPage() {
  const { t } = useTranslation("music");
  const { slug } = useParams<{ slug: string }>();
  const { playlist, loading, error } = usePlaylistDetail(slug);
  const { playManifest, state: playbackState } = usePlayback();
  const [startingPlayback, setStartingPlayback] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  const handlePlayAll = useCallback(async () => {
    if (!playlist || playlist.tracks.length === 0) return;
    setPlayError(null);
    setStartingPlayback(true);
    try {
      const playable = playlist.tracks.filter((t) => t.representationId);
      for (let i = 0; i < playable.length; i++) {
        const track = playable[i]!;
        const manifestRes = await api<{ data: PlaybackManifest }>(
          `/representations/${track.representationId}/playback`,
        );
        await playManifest(
          { ...manifestRes.data, sessionMode: "persistent" },
          i > 0 ? { append: true } : undefined,
        );
      }
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : t("playError"));
    } finally {
      setStartingPlayback(false);
    }
  }, [playlist, playManifest, t]);

  const handlePlayTrack = useCallback(
    async (track: TrackListItem) => {
      if (!track.representationId) return;
      setPlayError(null);
      setStartingPlayback(true);
      try {
        const manifestRes = await api<{ data: PlaybackManifest }>(
          `/representations/${track.representationId}/playback`,
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
    },
    [playManifest, t],
  );

  if (loading) return <LoadingState />;
  if (error || !playlist) {
    return <p className={styles.cardMeta}>{error ?? t("loadError")}</p>;
  }

  const activeTrackId =
    playbackState.currentItem?.subject.type === "track" &&
    isActivePlaybackSubject(
      playbackState,
      "track",
      playbackState.currentItem.subject.id,
    )
      ? playbackState.currentItem.subject.id
      : null;

  return (
    <div>
      <h1 className={styles.pageTitle}>{playlist.name}</h1>
      {playlist.description && (
        <p className={styles.detailMeta}>{playlist.description}</p>
      )}
      <div className={styles.detailActions}>
        <Button
          type="button"
          variant="primary"
          disabled={startingPlayback || playlist.tracks.length === 0}
          onClick={() => void handlePlayAll()}
        >
          {startingPlayback ? t("loading") : t("play")}
        </Button>
      </div>
      {playError && (
        <p className={styles.cardMeta} role="alert">
          {playError}
        </p>
      )}
      <TrackList
        tracks={playlist.tracks}
        onPlayTrack={(track) => void handlePlayTrack(track)}
        activeTrackId={activeTrackId}
      />
    </div>
  );
}
