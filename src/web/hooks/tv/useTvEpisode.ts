import { useCallback, useEffect, useState } from "react";
import type { TvEpisodeDetail } from "@shared/tv";
import { api } from "../../app/api";

export function useTvEpisode(
  slug: string | undefined,
  seasonNumber: string | undefined,
  episodeNumber: string | undefined,
) {
  const [episode, setEpisode] = useState<TvEpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug || !seasonNumber || !episodeNumber) return;
    setLoading(true);
    setError(null);
    void api<{ data: TvEpisodeDetail }>(
      `/tv/shows/${slug}/s/${seasonNumber}/e/${episodeNumber}`,
    )
      .then((r) => setEpisode(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setEpisode(null);
      })
      .finally(() => setLoading(false));
  }, [slug, seasonNumber, episodeNumber]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    episode,
    loading,
    error,
    reload: load,
  };
}
