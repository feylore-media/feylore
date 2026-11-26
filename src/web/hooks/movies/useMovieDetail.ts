import { useCallback, useEffect, useState } from "react";
import type { MovieDetail } from "@shared/movies";
import { api } from "../../app/api";

export function useMovieDetail(slug: string | undefined) {
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void api<{ data: MovieDetail }>(`/movies/${slug}`)
      .then((r) => setMovie(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setMovie(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const updateUserState = useCallback(
    (patch: Partial<MovieDetail["userState"]>) => {
      setMovie((m) =>
        m ? { ...m, userState: { ...m.userState, ...patch } } : m,
      );
    },
    [],
  );

  return {
    movie,
    loading,
    error,
    reload: load,
    updateUserState,
  };
}
