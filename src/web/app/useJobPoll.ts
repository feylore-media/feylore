import { useEffect, useRef, useState } from "react";
import type { JobRun, JobStatus } from "@shared/api";
import { isJobActive } from "@shared/api";
import { api } from "./api";

const POLL_INTERVAL_MS = 2000;

interface UseJobPollOptions {
  onComplete?: () => void;
}

export function useJobPoll(
  jobId: string | null,
  options: UseJobPollOptions = {},
) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logExcerpt, setLogExcerpt] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const onCompleteRef = useRef(options.onComplete);
  onCompleteRef.current = options.onComplete;

  useEffect(() => {
    if (!jobId) {
      setStatus(null);
      setError(null);
      setLogExcerpt(null);
      setPolling(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      setPolling(true);
      try {
        const res = await api<{ data: JobRun }>(`/jobs/${jobId}`);
        if (cancelled) return;

        setStatus(res.data.status);
        setError(res.data.error);
        setLogExcerpt(res.data.logExcerpt);

        if (isJobActive(res.data.status)) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setPolling(false);
          if (res.data.status === "completed") {
            onCompleteRef.current?.();
          }
        }
      } catch {
        if (!cancelled) setPolling(false);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  return { status, error, logExcerpt, polling };
}
