import { useCallback, useEffect, useState } from "react";
import type {
  MovieCollectionPublic,
  MovieListItem,
} from "@shared/movies";
import { api } from "../../app/api";

export function useMovieCollections() {
  const [collections, setCollections] = useState<MovieCollectionPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void api<{ data: MovieCollectionPublic[] }>("/movies/collections")
      .then((r) => setCollections(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setCollections([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { collections, loading, error, reload: load };
}

export type MovieCollectionDetail = MovieCollectionPublic & {
  movies: MovieListItem[];
};

export function useMovieCollectionDetail(slug: string | undefined) {
  const [collection, setCollection] = useState<MovieCollectionDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void api<{ data: MovieCollectionDetail }>(`/movies/collections/${slug}`)
      .then((r) => setCollection(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setCollection(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { collection, loading, error, reload: load };
}
