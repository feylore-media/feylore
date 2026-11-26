import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { TvShowListItem } from "@shared/tv";
import { fetchTvShows } from "../../../hooks/tv/useTvShows";
import { ShowCard } from "../../../components/tv/ShowCard";
import { ShowGridSkeleton } from "../../../components/tv/ShowGrid";
import { ShelfRow } from "../../../components/home/ShelfRow";
import { Button } from "../../../components/primitives";
import styles from "../../../components/tv/tv.module.css";

export function TvHomePage() {
  const { t } = useTranslation("tv");

  const [continueShows, setContinueShows] = useState<TvShowListItem[]>([]);
  const [continueLoading, setContinueLoading] = useState(true);
  const [continueError, setContinueError] = useState(false);

  const [recentShows, setRecentShows] = useState<TvShowListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);

  useEffect(() => {
    void fetchTvShows({ view: "continue", limit: 12 })
      .then(setContinueShows)
      .catch(() => setContinueError(true))
      .finally(() => setContinueLoading(false));
  }, []);

  useEffect(() => {
    void fetchTvShows({ view: "recent", limit: 12 })
      .then(setRecentShows)
      .catch(() => setRecentError(true))
      .finally(() => setRecentLoading(false));
  }, []);

  return (
    <div className={styles.homePage}>
      {continueLoading ? (
        <ShowGridSkeleton count={6} />
      ) : !continueError && continueShows.length > 0 ? (
        <ShelfRow
          title={t("homeContinue")}
          seeAllHref="/tv/continue"
          seeAllLabel={t("seeAll")}
        >
          {continueShows.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </ShelfRow>
      ) : null}

      {recentLoading ? (
        <ShowGridSkeleton count={6} />
      ) : !recentError && recentShows.length > 0 ? (
        <ShelfRow
          title={t("homeRecent")}
          seeAllHref="/tv/recent"
          seeAllLabel={t("seeAll")}
        >
          {recentShows.map((show) => (
            <ShowCard key={show.id} show={show} />
          ))}
        </ShelfRow>
      ) : null}

      <section className={styles.homeOverview}>
        <p className={styles.homeOverviewText}>{t("homeOverview")}</p>
        <div className={styles.emptyInlineActions}>
          <Link to="/tv/browse">
            <Button type="button" variant="primary">
              {t("browseShows")}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
