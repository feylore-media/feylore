import { useCallback, useEffect, useState } from "react";
import { api } from "../../app/api";

export interface BookHistoryEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export function useBookHistory(slug: string | undefined) {
  const [events, setEvents] = useState<BookHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    void api<{ data: BookHistoryEvent[] }>(`/books/${slug}/history`)
      .then((r) => setEvents(r.data))
      .catch((e: Error) => {
        setError(e.message);
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { events, loading, error, reload: load };
}
