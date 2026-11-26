import { useTranslation } from "react-i18next";
import { useHomeQuery } from "../../hooks/home/useHomeQuery";
import { BookGridSkeleton } from "../../components/books/BookGrid";
import {
  HomeContinueListening,
  HomeContinueWatching,
  HomeContinueReading,
  HomeLibraryRail,
} from "../../components/home/HomeSections";
import { HomeActivityPreview } from "../../components/home/HomeActivityPreview";
import { HomeShortcuts } from "../../components/home/HomeShortcuts";
import { HomeShelfPreviews } from "../../components/home/HomeShelfPreviews";
import { HomeWelcome } from "../../components/home/HomeWelcome";
import { HomeRecommendationsSlot } from "../../components/home/HomeRecommendationsSlot";
import { HomeUpcoming } from "../../components/home/HomeUpcoming";
import styles from "../../components/home/home.module.css";

export function HomePage() {
  const { t } = useTranslation("home");
  const { data, loading, error } = useHomeQuery();

  if (loading) {
    return (
      <div className={styles.loadingSkeleton}>
        <BookGridSkeleton count={6} />
        <BookGridSkeleton count={6} />
      </div>
    );
  }

  if (error || !data) {
    return <p className={styles.welcomeBody}>{t("loadError")}</p>;
  }

  const { sections, isEmpty } = data;

  return (
    <div className={styles.homePage}>
      <HomeContinueReading
        items={sections.continueReading}
        title={t("continueReading")}
        seeAllHref="/books/continue"
        seeAllLabel={t("seeAll")}
      />
      <HomeContinueListening
        items={sections.continueListening}
        title={t("continueListening")}
        seeAllHref="/audiobooks/continue"
        seeAllLabel={t("seeAll")}
      />
      <HomeContinueWatching
        items={sections.continueWatching}
        title={t("continueWatching")}
        seeAllHref="/movies/continue"
        seeAllLabel={t("seeAll")}
      />
      <HomeLibraryRail
        items={sections.recentlyAdded}
        title={t("recentlyAdded")}
        seeAllHref="/search"
        seeAllLabel={t("seeAll")}
      />
      <HomeLibraryRail
        items={sections.recentlyFinished}
        title={t("recentlyFinished")}
        seeAllHref="/activity"
        seeAllLabel={t("seeAll")}
      />
      <HomeLibraryRail
        items={sections.favorites}
        title={t("favorites")}
        seeAllHref="/books/favorites"
        seeAllLabel={t("seeAll")}
      />
      <HomeShelfPreviews shelves={sections.shelves} />
      <HomeActivityPreview events={sections.recentActivity} />
      <HomeUpcoming />
      <HomeShortcuts shortcuts={sections.shortcuts} />
      <HomeRecommendationsSlot recommendations={sections.recommendations} />
      {isEmpty ? <HomeWelcome /> : null}
    </div>
  );
}
