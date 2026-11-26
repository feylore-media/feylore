import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { NavBackLink } from "../../../components/icons/NavLinks";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { useTvShowDetail } from "../../../hooks/tv/useTvShowDetail";
import { TvCover } from "../../../components/tv/TvCover";
import { Button } from "../../../components/primitives";
import { ErrorState, LoadingState } from "../../../components/states";
import {
  tvEpisodePath,
  tvSeasonPath,
} from "../../../routes/paths";
import styles from "../../../components/tv/tv.module.css";

export function TvShowPage() {
  const { t } = useTranslation("tv");
  const { slug } = useParams<{ slug: string }>();
  const { show, loading, error, updateUserState } = useTvShowDetail(slug);
  const [rating, setRating] = useState<number | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    if (show) setRating(show.userState.rating);
  }, [show]);

  if (loading) return <LoadingState />;
  if (error || !show || !slug) {
    return <ErrorState message={error ?? t("showNotFound")} />;
  }

  async function toggleFavorite() {
    const next = !show!.userState.favorite;
    await api(`/tv/shows/${show!.slug}/favorite`, {
      method: "PUT",
      body: JSON.stringify({ favorite: next }),
    });
    updateUserState({ favorite: next });
  }

  async function setShowRating(value: number) {
    await api(`/tv/shows/${show!.slug}/rating`, {
      method: "PUT",
      body: JSON.stringify({ rating: value }),
    });
    setRating(value);
    updateUserState({ rating: value });
  }

  async function clearShowRating() {
    await api(`/tv/shows/${show!.slug}/rating`, {
      method: "PUT",
      body: JSON.stringify({ rating: null }),
    });
    setRating(null);
    updateUserState({ rating: null });
  }

  const continueEp = show.continueEpisode;
  const longDescription = (show.description?.length ?? 0) > 400;

  return (
    <div>
      <NavBackLink to="/tv/browse">{t("backToLibrary")}</NavBackLink>

      <div className={styles.detailHero}>
        <div className={styles.detailHeroCover}>
          <TvCover coverFileId={show.coverFileId} title={show.title} />
        </div>
        <div className={styles.detailInfo}>
          <h1 className={styles.detailTitle}>{show.title}</h1>
          {show.subtitle && (
            <p className={styles.detailSubtitle}>{show.subtitle}</p>
          )}
          {show.premiereDate && (
            <p className={styles.detailMeta}>
              {t("premiereDate", { date: show.premiereDate })}
            </p>
          )}
          {show.contentRating && (
            <p className={styles.detailMeta}>
              {t("contentRating")}: {show.contentRating}
            </p>
          )}
          {show.studio && (
            <p className={styles.detailMeta}>
              {t("studio")}: {show.studio}
            </p>
          )}
          {show.genres.length > 0 && (
            <p className={styles.detailMeta}>{show.genres.join(", ")}</p>
          )}
          <div className={styles.detailActions}>
            {continueEp && (
              <Link
                to={tvEpisodePath(
                  show.slug,
                  continueEp.seasonNumber,
                  continueEp.episodeNumber,
                )}
              >
                <Button type="button" variant="primary">
                  {t("continueWatching")}
                </Button>
              </Link>
            )}
            <Button type="button" onClick={() => void toggleFavorite()}>
              {show.userState.favorite ? t("unfavorite") : t("favorite")}
            </Button>
          </div>
        </div>
      </div>

      {show.description ? (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("description")}</h2>
          <p
            className={`${styles.detailDescription} ${!descExpanded && longDescription ? styles.detailDescriptionCollapsed : ""}`}
          >
            {show.description}
          </p>
          {longDescription && (
            <button
              type="button"
              className={styles.expandBtn}
              onClick={() => setDescExpanded((e) => !e)}
            >
              {descExpanded ? t("showLess") : t("showMore")}
            </button>
          )}
        </section>
      ) : (
        <p className={styles.cardMeta}>{t("noDescription")}</p>
      )}

      {show.seasons.length > 0 && (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("seasons")}</h2>
          <ul className={styles.seasonList}>
            {show.seasons.map((season) => {
              const progress = show.seasonProgress.find(
                (p) => p.seasonNumber === season.seasonNumber,
              );
              const label =
                season.title ??
                t("seasonLabel", { number: season.seasonNumber });
              return (
                <li key={season.id}>
                  <Link
                    to={tvSeasonPath(show.slug, season.seasonNumber)}
                    className={styles.seasonLink}
                  >
                    <div>
                      <p className={styles.seasonLinkTitle}>{label}</p>
                      {progress && progress.totalEpisodes > 0 && (
                        <p className={styles.cardMeta}>
                          {t("seasonProgress", {
                            watched: progress.watchedCount,
                            total: progress.totalEpisodes,
                          })}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className={styles.detailSection}>
        <h2 className={styles.detailSectionTitle}>{t("rate")}</h2>
        <div className={styles.starRating} role="group" aria-label={t("rate")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Button
              key={n}
              type="button"
              className={`${styles.starButton} ${rating != null && n <= rating ? styles.starFilled : ""}`}
              onClick={() => void setShowRating(n)}
              aria-pressed={rating === n}
              aria-label={`${n} stars`}
            >
              ★
            </Button>
          ))}
          {rating != null && (
            <Button type="button" onClick={() => void clearShowRating()}>
              {t("clearRating")}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
