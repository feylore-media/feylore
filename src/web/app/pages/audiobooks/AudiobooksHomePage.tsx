import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { AudiobookListItem } from "@shared/audiobooks";
import { api } from "../../api";
import { fetchAudiobooks } from "../../../hooks/audiobooks/useAudiobooksQuery";
import { AudiobookCard } from "../../../components/audiobooks/AudiobookCard";
import {
  AudiobookGridSkeleton,
} from "../../../components/audiobooks/AudiobookGrid";
import { ShelfRow } from "../../../components/home/ShelfRow";
import { Button } from "../../../components/primitives";
import styles from "../../../components/audiobooks/audiobooks.module.css";

export function AudiobooksHomePage() {
  const { t } = useTranslation("audiobooks");

  const [continueAudiobooks, setContinueAudiobooks] = useState<
    AudiobookListItem[]
  >([]);
  const [continueLoading, setContinueLoading] = useState(true);
  const [continueError, setContinueError] = useState(false);

  const [recentAudiobooks, setRecentAudiobooks] = useState<AudiobookListItem[]>(
    [],
  );
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);

  const [seriesList, setSeriesList] = useState<
    Array<{ id: string; name: string; description?: string }>
  >([]);
  const [seriesLoading, setSeriesLoading] = useState(true);

  useEffect(() => {
    void fetchAudiobooks({ view: "continue", limit: 12 })
      .then(setContinueAudiobooks)
      .catch(() => setContinueError(true))
      .finally(() => setContinueLoading(false));
  }, []);

  useEffect(() => {
    void fetchAudiobooks({ view: "recent", limit: 12 })
      .then(setRecentAudiobooks)
      .catch(() => setRecentError(true))
      .finally(() => setRecentLoading(false));
  }, []);

  useEffect(() => {
    void api<{ data: Array<{ id: string; name: string; description?: string }> }>(
      "/audiobooks/series",
    )
      .then((r) => setSeriesList(r.data))
      .finally(() => setSeriesLoading(false));
  }, []);

  return (
    <div className={styles.homePage}>
      {continueLoading ? (
        <AudiobookGridSkeleton count={6} />
      ) : !continueError && continueAudiobooks.length > 0 ? (
        <ShelfRow
          title={t("homeContinue")}
          seeAllHref="/audiobooks/continue"
          seeAllLabel={t("seeAll")}
        >
          {continueAudiobooks.map((audiobook) => (
            <AudiobookCard key={audiobook.id} audiobook={audiobook} />
          ))}
        </ShelfRow>
      ) : null}

      {recentLoading ? (
        <AudiobookGridSkeleton count={6} />
      ) : !recentError && recentAudiobooks.length > 0 ? (
        <ShelfRow
          title={t("homeRecent")}
          seeAllHref="/audiobooks/recent"
          seeAllLabel={t("seeAll")}
        >
          {recentAudiobooks.map((audiobook) => (
            <AudiobookCard key={audiobook.id} audiobook={audiobook} />
          ))}
        </ShelfRow>
      ) : null}

      {!seriesLoading && seriesList.length > 0 ? (
        <ShelfRow
          title={t("homeSeries")}
          seeAllHref="/audiobooks/series"
          seeAllLabel={t("seeAll")}
        >
          {seriesList.slice(0, 8).map((s) => (
            <Link
              key={s.id}
              to={`/audiobooks/library?series=${s.id}`}
              className={styles.card}
              style={{ width: "8.5rem" }}
            >
              <div className={styles.seriesCardCover}>
                <span className={styles.seriesCardInitial}>
                  {s.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className={styles.cardTitle}>{s.name}</div>
            </Link>
          ))}
        </ShelfRow>
      ) : null}

      <section className={styles.homeOverview}>
        <p className={styles.homeOverviewText}>{t("homeOverview")}</p>
        <div className={styles.emptyInlineActions}>
          <Link to="/audiobooks/library">
            <Button type="button" variant="primary">
              {t("browseLibrary")}
            </Button>
          </Link>
          <Link to="/audiobooks/new">
            <Button type="button">{t("newAudiobook")}</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
