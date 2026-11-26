import { useTranslation } from "react-i18next";
import type { AudiobookDetail } from "@shared/audiobooks";
import { Button } from "../primitives";
import styles from "./audiobooks.module.css";

interface AudiobookActionsProps {
  audiobook: AudiobookDetail;
  primaryRepresentationId: string | null;
  hasProgress: boolean;
  sessionActive: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  startingPlayback: boolean;
  onPlay: (representationId: string) => void;
  onFavoriteToggle: () => void;
  onDownload?: () => void;
  downloadLabel?: React.ReactNode;
  downloadDisabled?: boolean;
}

export function AudiobookActions({
  audiobook,
  primaryRepresentationId,
  hasProgress,
  sessionActive,
  isPlaying,
  isPaused,
  startingPlayback,
  onPlay,
  onFavoriteToggle,
  onDownload,
  downloadLabel,
  downloadDisabled,
}: AudiobookActionsProps) {
  const { t } = useTranslation("audiobooks");

  function playButtonLabel(): string {
    if (sessionActive && isPlaying) return t("pause");
    if (sessionActive && isPaused) return t("continueListening");
    return hasProgress ? t("continueListening") : t("play");
  }

  return (
    <div className={styles.detailActions}>
      {primaryRepresentationId && (
        <Button
          variant="primary"
          type="button"
          disabled={startingPlayback}
          onClick={() => onPlay(primaryRepresentationId)}
        >
          {playButtonLabel()}
        </Button>
      )}
      {onDownload && downloadLabel != null && (
        <Button type="button" onClick={onDownload} disabled={downloadDisabled}>
          {downloadLabel}
        </Button>
      )}
      <Button type="button" onClick={onFavoriteToggle}>
        {audiobook.userState.favorite ? t("unfavorite") : t("favorite")}
      </Button>
    </div>
  );
}
