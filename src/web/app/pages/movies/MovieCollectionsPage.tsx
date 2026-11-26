import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useMovieCollections } from "../../../hooks/movies/useMovieCollections";
import { movieCollectionPath } from "../../../routes/paths";
import { ErrorState, LoadingState } from "../../../components/states";
import styles from "../../../components/movies/movies.module.css";

export function MovieCollectionsPage() {
  const { t } = useTranslation("movies");
  const { collections, loading, error, reload } = useMovieCollections();

  if (loading) return <LoadingState />;
  if (error) {
    return <ErrorState message={t("loadError")} onRetry={reload} />;
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>{t("collections")}</h1>
      {collections.length === 0 ? (
        <p className={styles.cardMeta}>{t("noCollections")}</p>
      ) : (
        <ul className={styles.collectionList}>
          {collections.map((collection) => (
            <li key={collection.id}>
              <Link
                to={movieCollectionPath(collection.slug)}
                className={styles.collectionLink}
              >
                <p className={styles.collectionName}>{collection.title}</p>
                {collection.movieCount != null && (
                  <p className={styles.collectionMeta}>
                    {t("movieCount", { count: collection.movieCount })}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
