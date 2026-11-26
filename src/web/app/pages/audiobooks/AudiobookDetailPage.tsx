import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { NavBackLink } from "../../../components/icons/NavLinks";
import { useTranslation } from "react-i18next";
import type { PlaybackManifest } from "@shared/playback";
import { api } from "../../api";
import { useAudiobookDetail } from "../../../hooks/audiobooks/useAudiobookDetail";
import { AudiobookDetailHero } from "../../../components/audiobooks/AudiobookDetailHero";
import { AudiobookDetailSections } from "../../../components/audiobooks/AudiobookDetailSections";
import { LoadingState } from "../../../components/states";
import {
  isActivePlaybackSubject,
  isPlayerVisible,
  usePlayback,
} from "../../../playback/context/PlaybackContext";
import { useDownloads } from "../../../downloads/useDownloads";
import styles from "../../../components/audiobooks/audiobooks.module.css";

function selectPrimaryRepresentationId(
  audiobook: NonNullable<ReturnType<typeof useAudiobookDetail>["audiobook"]>,
): string | null {
  const progressRepId = audiobook.userState.progressRepresentationId;
  if (
    progressRepId &&
    audiobook.representations.some((r) => r.id === progressRepId)
  ) {
    return progressRepId;
  }
  const available = audiobook.representations.find((r) => !r.unavailableAt);
  return available?.id ?? audiobook.representations[0]?.id ?? null;
}

export function AudiobookDetailPage() {
  const { t } = useTranslation("audiobooks");
  const { t: td } = useTranslation("downloads");
  const { slug } = useParams<{ slug: string }>();
  const { audiobook, loading, error, updateUserState } = useAudiobookDetail(slug);
  const { playManifest, state: playbackState, pause, resume } = usePlayback();
  const { getDownloadForFile, startDownload, activeProgress } = useDownloads();
  const [rating, setRating] = useState<number | null>(null);
  const [startingPlayback, setStartingPlayback] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    if (audiobook) setRating(audiobook.userState.rating);
  }, [audiobook]);

  const primaryRepresentationId = useMemo(
    () => (audiobook ? selectPrimaryRepresentationId(audiobook) : null),
    [audiobook],
  );

  const primaryRep = audiobook?.representations.find(
    (r) => r.id === primaryRepresentationId,
  );
  const primaryFileId =
    primaryRep?.files.find((f) => f.role === "content")?.id ??
    primaryRep?.files[0]?.id;
  const audioDownload = primaryFileId
    ? getDownloadForFile(primaryFileId)
    : undefined;

  const isThisAudiobookActive = useMemo(
    () =>
      audiobook
        ? isActivePlaybackSubject(playbackState, "audiobook", audiobook.id)
        : false,
    [audiobook, playbackState],
  );

  const isThisAudiobookPlaying = useMemo(
    () =>
      isThisAudiobookActive &&
      (playbackState.status === "playing" || playbackState.status === "loading"),
    [isThisAudiobookActive, playbackState.status],
  );

  const handlePlay = useCallback(
    async (representationId: string) => {
      if (
        isThisAudiobookActive &&
        playbackState.status === "paused" &&
        playbackState.currentItem?.representationId === representationId
      ) {
        resume();
        return;
      }

      if (
        isThisAudiobookActive &&
        (playbackState.status === "playing" ||
          playbackState.status === "loading")
      ) {
        pause();
        return;
      }

      setPlayError(null);
      setStartingPlayback(true);
      try {
        const manifestRes = await api<{ data: PlaybackManifest }>(
          `/representations/${representationId}/playback`,
        );
        await playManifest(manifestRes.data);
      } catch (err) {
        setPlayError(
          err instanceof Error ? err.message : t("playError"),
        );
      } finally {
        setStartingPlayback(false);
      }
    },
    [
      isThisAudiobookActive,
      pause,
      playManifest,
      playbackState.currentItem?.representationId,
      playbackState.status,
      resume,
      t,
    ],
  );

  if (loading) return <LoadingState />;
  if (error || !audiobook || !slug) {
    return (
      <div className={styles.emptyInline}>
        <h2 className={styles.emptyInlineTitle}>{t("audiobookNotFound")}</h2>
        <Link to="/audiobooks/library" className={styles.backLink}>
          {t("backToLibrary")}
        </Link>
      </div>
    );
  }

  async function toggleFavorite() {
    if (!audiobook) return;
    const next = !audiobook.userState.favorite;
    await api(`/audiobooks/${audiobook.slug}/favorite`, {
      method: "PUT",
      body: JSON.stringify({ favorite: next }),
    });
    updateUserState({ favorite: next });
  }

  async function handleDownload() {
    if (!primaryRep || !primaryFileId) return;
    await startDownload(primaryFileId, primaryRep.id);
  }

  function renderDownloadLabel() {
    if (!primaryRep || !primaryFileId) return td("download");

    if (audioDownload?.status === "available") return td("downloaded");
    if (
      audioDownload?.status === "queued" ||
      audioDownload?.status === "in_progress"
    ) {
      const progress = audioDownload.id
        ? activeProgress[audioDownload.id]
        : undefined;
      if (progress != null && audioDownload.bytesTotal) {
        return td("progress", {
          percent: Math.min(
            100,
            Math.round((progress / audioDownload.bytesTotal) * 100),
          ),
        });
      }
      return td("downloading");
    }
    if (audioDownload?.status === "failed") return td("retry");
    return td("download");
  }

  const downloadDisabled =
    audioDownload?.status === "queued" ||
    audioDownload?.status === "in_progress" ||
    audioDownload?.status === "available";

  return (
    <div className={styles.detailPage}>
      <NavBackLink to="/audiobooks/library">{t("backToLibrary")}</NavBackLink>

      {playError && (
        <div className={styles.errorBanner} role="alert">
          {playError}
        </div>
      )}

      <AudiobookDetailHero
        audiobook={audiobook}
        primaryRepresentationId={primaryRepresentationId}
        sessionActive={isThisAudiobookActive && isPlayerVisible(playbackState)}
        isPlaying={isThisAudiobookPlaying}
        isPaused={
          isThisAudiobookActive && playbackState.status === "paused"
        }
        startingPlayback={startingPlayback}
        onPlay={handlePlay}
        onFavoriteToggle={toggleFavorite}
        onDownload={primaryFileId ? handleDownload : undefined}
        downloadLabel={renderDownloadLabel()}
        downloadDisabled={downloadDisabled}
      />

      <AudiobookDetailSections
        audiobook={audiobook}
        rating={rating}
        onRatingChange={setRating}
      />
    </div>
  );
}
