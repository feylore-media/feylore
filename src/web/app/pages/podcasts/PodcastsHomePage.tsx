import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { PodcastContinueListeningItem, PodcastShowListItem } from "@shared/podcasts";
import {
  fetchContinueListening,
  fetchSubscribedPodcasts,
  subscribeToFeed,
} from "../../../hooks/podcasts/usePodcasts";
import { Button } from "../../../components/primitives";
import styles from "../../../components/audiobooks/audiobooks.module.css";

export function PodcastsHomePage() {
  const { t } = useTranslation("podcasts");
  const [shows, setShows] = useState<PodcastShowListItem[]>([]);
  const [continueItems, setContinueItems] = useState<PodcastContinueListeningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedUrl, setFeedUrl] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void Promise.all([fetchSubscribedPodcasts(), fetchContinueListening()])
      .then(([subscribed, listening]) => {
        setShows(subscribed);
        setContinueItems(listening);
      })
      .catch(() => setError("Failed to load podcasts"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!feedUrl.trim()) return;
    setSubscribing(true);
    setError(null);
    try {
      await subscribeToFeed(feedUrl.trim());
      setFeedUrl("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("subscribeFailed"));
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <div className={styles.homePage}>
      <section className={styles.homeOverview}>
        <h2 className={styles.moduleSidebarTitle}>{t("subscribe")}</h2>
        <form onSubmit={handleSubscribe} className={styles.emptyInlineActions}>
          <input
            type="url"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder={t("subscribePlaceholder")}
            className={styles.filterInput}
            required
          />
          <Button type="submit" variant="primary" disabled={subscribing}>
            {t("subscribeSubmit")}
          </Button>
        </form>
        {error ? <p className={styles.errorText}>{error}</p> : null}
      </section>

      {continueItems.length > 0 ? (
        <section>
          <h2 className={styles.moduleSidebarTitle}>{t("continueListening")}</h2>
          <ul className={styles.listRows}>
            {continueItems.map((episode) => (
              <li key={episode.id}>
                <Link
                  to={`/audiobooks/podcasts/${episode.showSlug}/${episode.slug}`}
                  className={styles.listRow}
                >
                  <span className={styles.cardTitle}>{episode.title}</span>
                  <span className={styles.cardMeta}>{episode.showTitle}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className={styles.listHeader}>
          <h2>{t("homeSubscribed")}</h2>
          <Link to="/audiobooks/podcasts/discover">{t("discover")}</Link>
        </div>
        {loading ? (
          <p>{t("title")}…</p>
        ) : shows.length === 0 ? (
          <p>{t("noShows")}</p>
        ) : (
          <ul className={styles.listRows}>
            {shows.map((show) => (
              <li key={show.id}>
                <Link
                  to={`/audiobooks/podcasts/${show.slug}`}
                  className={styles.listRow}
                >
                  <span className={styles.cardTitle}>{show.title}</span>
                  {show.author ? (
                    <span className={styles.cardMeta}>
                      {t("byAuthor", { author: show.author })}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
