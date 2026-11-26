import type { AudiobookDetail } from "@shared/audiobooks";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { AudiobookCover } from "./AudiobookCover";
import { AudiobookActions } from "./AudiobookActions";
import { audiobookEditPath } from "../../routes/paths";
import styles from "./audiobooks.module.css";

interface AudiobookDetailHeroProps {
  audiobook: AudiobookDetail;
  primaryRepresentationId: string | null;
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

export function AudiobookDetailHero({
  audiobook,
  primaryRepresentationId,
  sessionActive,
  isPlaying,
  isPaused,
  startingPlayback,
  onPlay,
  onFavoriteToggle,
  onDownload,
  downloadLabel,
  downloadDisabled,
}: AudiobookDetailHeroProps) {
  const { t } = useTranslation("audiobooks");
  const progress = audiobook.userState.progress;
  const progressPct =
    progress?.durationSeconds && progress.positionSeconds > 0
      ? Math.round(
          (progress.positionSeconds / progress.durationSeconds) * 100,
        )
      : null;
  const hasProgress = progressPct != null && progressPct > 0;

  return (
    <div className={styles.detailHero}>
      <div className={styles.detailHeroCover}>
        <AudiobookCover
          coverFileId={audiobook.coverFileId}
          title={audiobook.title}
        />
      </div>
      <div className={styles.detailHeroBody}>
        <h1 className={styles.detailTitle}>{audiobook.title}</h1>
        {audiobook.subtitle && (
          <p className={styles.detailSubtitle}>{audiobook.subtitle}</p>
        )}
        {audiobook.authors.length > 0 && (
          <p className={styles.detailByline}>
            {audiobook.authors.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                {a.peopleSlug ? (
                  <Link to={`/people/${a.peopleSlug}`}>{a.name}</Link>
                ) : (
                  <Link
                    to={`/audiobooks/library?author=${encodeURIComponent(a.name)}`}
                  >
                    {a.name}
                  </Link>
                )}
              </span>
            ))}
          </p>
        )}
        {audiobook.narrators.length > 0 && (
          <p className={styles.detailByline}>
            {audiobook.narrators.map((n, i) => (
              <span key={n.id}>
                {i > 0 && ", "}
                {n.peopleSlug ? (
                  <Link to={`/people/${n.peopleSlug}`}>{n.name}</Link>
                ) : (
                  <Link
                    to={`/audiobooks/library?narrator=${encodeURIComponent(n.name)}`}
                  >
                    {n.name}
                  </Link>
                )}
              </span>
            ))}
          </p>
        )}
        {audiobook.series && (
          <p className={styles.detailSeries}>
            <Link to={`/audiobooks/library?series=${audiobook.series.id}`}>
              {audiobook.series.name}
              {audiobook.series.position != null &&
                ` #${audiobook.series.position}`}
            </Link>
          </p>
        )}
        {progressPct != null && (
          <p className={styles.detailProgress}>
            {t("progressPercent", { percent: progressPct })}
            <div
              className={styles.progressBar}
              style={{ marginTop: "var(--space-2)" }}
            >
              <div
                className={styles.progressFill}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </p>
        )}
        <AudiobookActions
          audiobook={audiobook}
          primaryRepresentationId={primaryRepresentationId}
          hasProgress={hasProgress}
          sessionActive={sessionActive}
          isPlaying={isPlaying}
          isPaused={isPaused}
          startingPlayback={startingPlayback}
          onPlay={onPlay}
          onFavoriteToggle={onFavoriteToggle}
          onDownload={onDownload}
          downloadLabel={downloadLabel}
          downloadDisabled={downloadDisabled}
        />
        <Link to={audiobookEditPath(audiobook.slug)} className={styles.detailEditLink}>
          {t("editMetadata")}
        </Link>
      </div>
    </div>
  );
}
