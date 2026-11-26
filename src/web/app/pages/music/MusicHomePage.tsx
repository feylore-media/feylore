import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { AlbumListItem } from "@shared/music";
import { fetchAlbums } from "../../../hooks/music/useAlbumsQuery";
import { AlbumCard } from "../../../components/music/AlbumCard";
import { AlbumGridSkeleton } from "../../../components/music/AlbumGrid";
import { ShelfRow } from "../../../components/home/ShelfRow";
import { Button } from "../../../components/primitives";
import styles from "../../../components/music/music.module.css";

export function MusicHomePage() {
  const { t } = useTranslation("music");
  const [recentAlbums, setRecentAlbums] = useState<AlbumListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);

  useEffect(() => {
    void fetchAlbums({ view: "recent", limit: 12 })
      .then(setRecentAlbums)
      .catch(() => setRecentError(true))
      .finally(() => setRecentLoading(false));
  }, []);

  return (
    <div className={styles.homePage}>
      {recentLoading ? (
        <AlbumGridSkeleton count={6} />
      ) : !recentError && recentAlbums.length > 0 ? (
        <ShelfRow
          title={t("homeRecent")}
          seeAllHref="/music/albums?view=recent"
          seeAllLabel={t("seeAll")}
        >
          {recentAlbums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </ShelfRow>
      ) : null}

      <section className={styles.homeOverview}>
        <p className={styles.homeOverviewText}>{t("homeOverview")}</p>
        <div className={styles.emptyInlineActions}>
          <Link to="/music/albums">
            <Button type="button" variant="primary">
              {t("browseAlbums")}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
