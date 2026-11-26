import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type {
  PodcastEpisodeListItem,
  PodcastShowDetail,
} from "@shared/podcasts";
import { api } from "../../api";
import {
  fetchDiscoverPodcasts,
  unsubscribeFromShow,
} from "../../../hooks/podcasts/usePodcasts";
import { Button } from "../../../components/primitives";
import { PodcastDescription } from "../../../components/podcasts/PodcastDescription";
import styles from "../../../components/audiobooks/audiobooks.module.css";

export function PodcastDiscoverPage() {
  const { t } = useTranslation("podcasts");
  const [shows, setShows] = useState<Awaited<ReturnType<typeof fetchDiscoverPodcasts>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchDiscoverPodcasts()
      .then(setShows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.homePage}>
      <h2>{t("homeDiscover")}</h2>
      {loading ? (
        <p>…</p>
      ) : (
        <ul className={styles.listRows}>
          {shows.map((show) => (
            <li key={show.id}>
              <Link
                to={`/audiobooks/podcasts/${show.slug}`}
                className={styles.listRow}
              >
                <span className={styles.cardTitle}>{show.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PodcastShowPage({ slug }: { slug: string }) {
  const { t } = useTranslation("podcasts");
  const [show, setShow] = useState<PodcastShowDetail | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisodeListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      api<{ data: PodcastShowDetail }>(`/podcasts/${slug}`),
      api<{ data: PodcastEpisodeListItem[] }>(`/podcasts/${slug}/episodes`),
    ])
      .then(([detail, eps]) => {
        setShow(detail.data);
        setEpisodes(eps.data);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleUnsubscribe() {
    await unsubscribeFromShow(slug);
    const detail = await api<{ data: PodcastShowDetail }>(`/podcasts/${slug}`);
    setShow(detail.data);
  }

  if (loading || !show) return <p>…</p>;

  return (
    <div className={styles.detailPage}>
      <header className={styles.detailHero}>
        <h1>{show.title}</h1>
        {show.author ? <p>{t("byAuthor", { author: show.author })}</p> : null}
        {show.description ? <PodcastDescription text={show.description} /> : null}
        {show.subscribed ? (
          <Button type="button" onClick={() => void handleUnsubscribe()}>
            {t("unsubscribe")}
          </Button>
        ) : (
          <p>{t("discover")}</p>
        )}
      </header>

      <section>
        <h2>{t("episodes")}</h2>
        {episodes.length === 0 ? (
          <p>{t("noEpisodes")}</p>
        ) : (
          <ul className={styles.listRows}>
            {episodes.map((episode) => (
              <li key={episode.id}>
                <Link
                  to={`/audiobooks/podcasts/${slug}/${episode.slug}`}
                  className={styles.listRow}
                >
                  <span className={styles.cardTitle}>{episode.title}</span>
                  {episode.publishedAt ? (
                    <span className={styles.cardMeta}>
                      {new Date(episode.publishedAt).toLocaleDateString()}
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
