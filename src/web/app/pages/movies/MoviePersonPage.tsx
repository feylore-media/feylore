import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { MoviePersonDetail } from "@shared/movies";
import { api } from "../../api";
import { ErrorState, LoadingState } from "../../../components/states";
import { moviePath } from "../../../routes/paths";
import styles from "../../../components/movies/movies.module.css";

export function MoviePersonPage() {
  const { t } = useTranslation("movies");
  const { slug } = useParams<{ slug: string }>();
  const [person, setPerson] = useState<MoviePersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void api<{ data: MoviePersonDetail }>(`/movies/people/${slug}`)
      .then((r) => setPerson(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setPerson(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <LoadingState />;
  if (error || !person) {
    return <ErrorState message={error ?? t("personNotFound")} />;
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>{person.name}</h1>

      {person.credits.length === 0 ? (
        <p className={styles.cardMeta}>{t("noMovies")}</p>
      ) : (
        <section className={styles.detailSection}>
          <h2 className={styles.detailSectionTitle}>{t("credits")}</h2>
          <ul className={styles.creditList}>
            {person.credits.map((credit, index) => (
              <li
                key={`${credit.movieId}-${credit.role}-${index}`}
                className={styles.creditRow}
              >
                <Link to={moviePath(credit.movieSlug)}>{credit.movieTitle}</Link>
                <span className={styles.creditRole}>
                  {" "}
                  — {credit.role}
                  {credit.character ? ` (${credit.character})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
