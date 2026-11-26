import { useCallback, useEffect, useState } from "react";
import type { AlbumDetail } from "@shared/music";
import { api } from "../../app/api";

export function useAlbumDetail(slug: string | undefined) {
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void api<{ data: AlbumDetail }>(`/music/albums/${slug}`)
      .then((r) => setAlbum(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setAlbum(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const updateUserState = useCallback(
    (patch: Partial<AlbumDetail["userState"]>) => {
      setAlbum((a) =>
        a ? { ...a, userState: { ...a.userState, ...patch } } : a,
      );
    },
    [],
  );

  return {
    album,
    loading,
    error,
    reload: load,
    updateUserState,
  };
}
