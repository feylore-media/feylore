import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import styles from "../../../components/books/books.module.css";

interface SeriesItem {
  id: string;
  name: string;
  description?: string | null;
}

export function BooksSeriesPage() {
  const { t } = useTranslation("books");
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<{ data: SeriesItem[] }>("/books/series")
      .then((r) => setSeries(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className={styles.pageTitle}>{t("series")}</h1>
      {loading ? (
        <p className={styles.cardMeta}>{t("loading")}</p>
      ) : series.length === 0 ? (
        <p className={styles.cardMeta}>{t("noSeries")}</p>
      ) : (
        <div className={styles.seriesGrid}>
          {series.map((s) => (
            <Link
              key={s.id}
              to={`/books/library?series=${s.id}`}
              className={styles.seriesCard}
            >
              <div className={styles.seriesCardCover}>
                <span className={styles.seriesCardInitial}>
                  {s.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <h2 className={styles.seriesCardTitle}>{s.name}</h2>
              {s.description && (
                <p className={styles.seriesCardDesc}>{s.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
