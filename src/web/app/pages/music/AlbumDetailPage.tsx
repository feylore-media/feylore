import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { PlaybackManifest } from "@shared/playback";
import type { TrackListItem } from "@shared/music";
import { api } from "../../api";
import { useAlbumDetail } from "../../../hooks/music/useAlbumDetail";
import { AlbumCover } from "../../../components/music/AlbumCover";
import { TrackList } from "../../../components/music/TrackList";
import { LoadingState } from "../../../components/states";
import { Button } from "../../../components/primitives";
import {
  isActivePlaybackSubject,
  usePlayback,
} from "../../../playback/context/PlaybackContext";
import { artistPath } from "../../../routes/paths";
import styles from "../../../components/music/music.module.css";

async function playAlbumManifests(
  slug: string,
  playManifest: (
    manifest: PlaybackManifest,
    options?: { append?: boolean },
  ) => Promise<void>,
) {
  const res = await api<{ data: PlaybackManifest[] }>(
    `/music/albums/${slug}/playback`,
  );
  const manifests = res.data;
  if (manifests.length === 0) return;
  await playManifest(manifests[0]!);
  for (let i = 1; i < manifests.length; i++) {
    await playManifest(manifests[i]!, { append: true });
  }
}

export function AlbumDetailPage() {
  const { t } = useTranslation("music");
  const { slug } = useParams<{ slug: string }>();
  const { album, loading, error } = useAlbumDetail(slug);
  const { playManifest, state: playbackState } = usePlayback();
  const [startingPlayback, setStartingPlayback] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  const handlePlayAlbum = useCallback(async () => {
    if (!slug) return;
    setPlayError(null);
    setStartingPlayback(true);
    try {
      await playAlbumManifests(slug, playManifest);
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : t("playError"));
    } finally {
      setStartingPlayback(false);
    }
  }, [playManifest, slug, t]);

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
  if (error || !album) {
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
      <div className={styles.detailHero}>
        <AlbumCover coverFileId={album.coverFileId} title={album.title} />
        <div className={styles.detailInfo}>
          <h1 className={styles.detailTitle}>{album.title}</h1>
          {album.artists.length > 0 && (
            <p className={styles.detailMeta}>
              {album.artists.map((artist, i) => (
                <span key={artist.id}>
                  {i > 0 ? ", " : ""}
                  <Link to={artistPath(artist.slug)}>{artist.name}</Link>
                </span>
              ))}
            </p>
          )}
          {album.releaseDate && (
            <p className={styles.detailMeta}>
              {t("releaseDate", { date: album.releaseDate })}
            </p>
          )}
          {album.genres.length > 0 && (
            <p className={styles.detailMeta}>{album.genres.join(", ")}</p>
          )}
          <div className={styles.detailActions}>
            <Button
              type="button"
              variant="primary"
              disabled={startingPlayback || album.tracks.length === 0}
              onClick={() => void handlePlayAlbum()}
            >
              {startingPlayback ? t("loading") : t("playAlbum")}
            </Button>
          </div>
          {playError && (
            <p className={styles.cardMeta} role="alert">
              {playError}
            </p>
          )}
        </div>
      </div>

      <h2 className={styles.pageTitle}>{t("tracks")}</h2>
      <TrackList
        tracks={album.tracks}
        onPlayTrack={(track) => void handlePlayTrack(track)}
        activeTrackId={activeTrackId}
      />
    </div>
  );
}
