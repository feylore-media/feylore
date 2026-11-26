import { useCallback, useEffect, useState } from "react";
import type { AudiobookDetail } from "@shared/audiobooks";
import { api } from "../../app/api";

export function useAudiobookDetail(slug: string | undefined) {
  const [audiobook, setAudiobook] = useState<AudiobookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void api<{ data: AudiobookDetail }>(`/audiobooks/${slug}`)
      .then((r) => setAudiobook(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setAudiobook(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const updateAudiobook = useCallback((patch: Partial<AudiobookDetail>) => {
    setAudiobook((a) => (a ? { ...a, ...patch } : a));
  }, []);

  const updateUserState = useCallback(
    (patch: Partial<AudiobookDetail["userState"]>) => {
      setAudiobook((a) =>
        a ? { ...a, userState: { ...a.userState, ...patch } } : a,
      );
    },
    [],
  );

  return {
    audiobook,
    loading,
    error,
    reload: load,
    updateAudiobook,
    updateUserState,
  };
}
