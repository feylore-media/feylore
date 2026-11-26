import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { SeriesMember } from "@shared/books";
import { BookCover } from "../books/BookCover";
import { bookPath } from "../../routes/paths";
import { WorkDetailSection } from "./WorkDetailSection";
import styles from "./work-detail.module.css";
import homeStyles from "../home/home.module.css";

interface SeriesStripProps {
  seriesName: string;
  members: SeriesMember[];
}

export function SeriesStrip({ seriesName, members }: SeriesStripProps) {
  const { t } = useTranslation("books");
  if (members.length === 0) return null;

  return (
    <WorkDetailSection title={seriesName} rule>
      <div className={homeStyles.shelfRowTrack}>
        {members.map((member) => {
          const pct =
            member.readingState?.progress?.totalProgression ??
            member.readingState?.progress?.progression;
          const finished = member.readingState?.finished;
          const positionLabel =
            member.position != null ? `#${member.position}` : null;

          return (
            <Link
              key={member.work.id}
              to={bookPath(member.work.slug)}
              className={`${styles.seriesTile} ${member.current ? styles.seriesTileCurrent : ""}`}
              aria-current={member.current ? "true" : undefined}
            >
              <div className={styles.seriesTileCover}>
                <BookCover
                  coverFileId={member.work.coverFileId}
                  title={member.work.title}
                />
              </div>
              {finished && (
                <span className={styles.seriesTileFinished} aria-hidden>
                  ✓
                </span>
              )}
              <p className={styles.seriesTileTitle}>{member.work.title}</p>
              <p className={styles.seriesTileMeta}>
                {[positionLabel, pct != null && pct > 0 ? `${Math.round(pct * 100)}%` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Link>
          );
        })}
      </div>
      <p className={styles.journalCounts}>
        {t("seriesBookCount", { count: members.length })}
      </p>
    </WorkDetailSection>
  );
}
