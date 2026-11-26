import { useEffect, useState } from "react";
import type { HomeResponse } from "@shared/home";
import { api } from "../../app/api";

export function useHomeQuery() {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    void api<{ data: HomeResponse }>("/home")
      .then((res) => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
