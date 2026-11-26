import { useCallback, useEffect, useState } from "react";
import type { PlaylistDetail, PlaylistPublic } from "@shared/music";
import { api } from "../../app/api";

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<PlaylistPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void api<{ data: PlaylistPublic[] }>("/music/playlists")
      .then((r) => setPlaylists(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setPlaylists([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { playlists, loading, error, reload: load };
}

export function usePlaylistDetail(slug: string | undefined) {
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void api<{ data: PlaylistDetail }>(`/music/playlists/${slug}`)
      .then((r) => setPlaylist(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setPlaylist(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { playlist, loading, error, reload: load };
}
