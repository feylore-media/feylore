import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import styles from "../../../components/music/music.module.css";

export function MusicGenresPage() {
  const { t } = useTranslation("music");
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<{ data: string[] }>("/music/genres")
      .then((r) => setGenres(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className={styles.pageTitle}>{t("genres")}</h1>
      {loading ? (
        <p className={styles.cardMeta}>{t("loading")}</p>
      ) : genres.length === 0 ? (
        <p className={styles.cardMeta}>{t("noGenres")}</p>
      ) : (
        <ul className={styles.genreList}>
          {genres.map((genre) => (
            <li key={genre}>
              <Link
                to={`/music/albums?genre=${encodeURIComponent(genre)}`}
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
