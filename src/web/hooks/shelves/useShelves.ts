import { useCallback, useEffect, useState } from "react";
import type { ShelfPublic } from "@shared/shelves";
import type { ShelfScopeId } from "@shared/shelf-scopes";
import { api } from "../../app/api";

export function useShelves(scope?: ShelfScopeId) {
  const [shelves, setShelves] = useState<ShelfPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : "";
    void api<{ data: ShelfPublic[] }>(`/shelves${qs}`)
      .then((r) => setShelves(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  return { shelves, loading, error, reload: load };
}
