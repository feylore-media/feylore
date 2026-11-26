import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMovieCollectionDetail } from "../../../hooks/movies/useMovieCollections";
import { MovieCard } from "../../../components/movies/MovieCard";
import { MovieGrid } from "../../../components/movies/MovieGrid";
import { ErrorState, LoadingState } from "../../../components/states";
import styles from "../../../components/movies/movies.module.css";

export function MovieCollectionDetailPage() {
  const { t } = useTranslation("movies");
  const { slug } = useParams<{ slug: string }>();
  const { collection, loading, error, reload } = useMovieCollectionDetail(slug);

  if (loading) return <LoadingState />;
  if (error || !collection) {
    return (
      <ErrorState
        message={error ?? t("collectionNotFound")}
        onRetry={reload}
      />
    );
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>{collection.title}</h1>
      {collection.description && (
        <p className={styles.detailMeta}>{collection.description}</p>
      )}
      {collection.movies.length === 0 ? (
        <p className={styles.cardMeta}>{t("noMovies")}</p>
      ) : (
        <MovieGrid>
          {collection.movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </MovieGrid>
      )}
    </div>
  );
}
