import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { ClubContext, ClubWorkDetail } from "@shared/clubs";
import { clubWorkSectionLabel } from "./club-list-display";
import styles from "./clubs.module.css";

export interface ClubCurrentWorkCardProps {
  context: ClubContext;
  work: ClubWorkDetail | null;
  canModerate: boolean;
  onOpenSettings?: () => void;
}

export function ClubCurrentWorkCard({
  context,
  work,
  canModerate,
  onOpenSettings,
}: ClubCurrentWorkCardProps) {
  const { t } = useTranslation("clubs");

  if (context !== "book" && context !== "video" && context !== "ttrpg" && !work) {
    return null;
  }

  const sectionLabel = clubWorkSectionLabel(
    context,
    work?.workSubjectType,
    t,
  );

  return (
    <section className={styles.clubSection} aria-labelledby="club-current-work-heading">
      <h2 id="club-current-work-heading" className={styles.clubSectionLabel}>
        {sectionLabel}
      </h2>
      {work ? (
        <div className={styles.clubWorkCard}>
          {work.coverFileId && (
            <img
              src={`/api/v1/files/${work.coverFileId}/content`}
              alt=""
              className={styles.clubWorkCover}
            />
          )}
          <div className={styles.clubWorkBody}>
            <Link to={work.href} className={styles.clubWorkTitle}>
              {work.title}
            </Link>
            {work.subtitle && (
              <p className={styles.clubWorkSubtitle}>{work.subtitle}</p>
            )}
            {work.progressLabel && (
              <p className={styles.clubWorkProgress}>{work.progressLabel}</p>
            )}
          </div>
        </div>
      ) : (
        <div>
          <p className={styles.sectionEmpty}>{t("noCurrentWork")}</p>
          {canModerate && onOpenSettings && (
            <button
              type="button"
              className={styles.clubInlineAction}
              onClick={onOpenSettings}
            >
              {t("manageCurrentWork")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
