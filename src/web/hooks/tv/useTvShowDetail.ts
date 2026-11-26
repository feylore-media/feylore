import { useCallback, useEffect, useState } from "react";
import type { TvSeasonDetail, TvShowDetail } from "@shared/tv";
import { api } from "../../app/api";

export function useTvShowDetail(slug: string | undefined) {
  const [show, setShow] = useState<TvShowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void api<{ data: TvShowDetail }>(`/tv/shows/${slug}`)
      .then((r) => setShow(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setShow(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const updateUserState = useCallback(
    (patch: Partial<TvShowDetail["userState"]>) => {
      setShow((s) =>
        s ? { ...s, userState: { ...s.userState, ...patch } } : s,
      );
    },
    [],
  );

  return {
    show,
    loading,
    error,
    reload: load,
    updateUserState,
  };
}

export function useTvSeasonDetail(
  slug: string | undefined,
  seasonNumber: string | undefined,
) {
  const [season, setSeason] = useState<TvSeasonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug || !seasonNumber) return;
    setLoading(true);
    setError(null);
    void api<{ data: TvSeasonDetail }>(`/tv/shows/${slug}/s/${seasonNumber}`)
      .then((r) => setSeason(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setSeason(null);
      })
      .finally(() => setLoading(false));
  }, [slug, seasonNumber]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    season,
    loading,
    error,
    reload: load,
  };
}
