import { useCallback, useEffect, useState } from "react";
import type { JobsTasksResponse } from "@shared/api";
import { isJobActive } from "@shared/api";
import { api } from "../../../app/api";

export function useJobsTasks(failuresOnly: boolean) {
  const [response, setResponse] = useState<JobsTasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (failuresOnly) params.set("failuresOnly", "true");
      const res = await api<JobsTasksResponse>(`/jobs/tasks?${params.toString()}`);
      setResponse(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [failuresOnly]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const hasActive = response?.data.some((task) =>
      isJobActive(task.latest.status),
    );
    if (!hasActive) return;
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [load, response?.data]);

  return { response, loading, error, reload: load };
}
