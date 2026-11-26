import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import styles from "../../../components/movies/movies.module.css";

export function MoviesGenresPage() {
  const { t } = useTranslation("movies");
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ data: string[] }>("/movies/genres")
      .then((r) => setGenres(r.data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className={styles.pageTitle}>{t("genres")}</h1>
      {loading ? (
        <p className={styles.cardMeta}>{t("loading")}</p>
      ) : error ? (
        <p className={styles.cardMeta} role="alert">
          {t("loadError")}
        </p>
      ) : genres.length === 0 ? (
        <p className={styles.cardMeta}>{t("noGenres")}</p>
      ) : (
        <ul className={styles.genreList}>
          {genres.map((genre) => (
            <li key={genre}>
              <Link
                to={`/movies/browse?genre=${encodeURIComponent(genre)}`}
                className={styles.genreLink}
              >
                {genre}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
