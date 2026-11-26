import { useCallback, useEffect, useRef, useState } from "react";
import { useJobPoll } from "../../app/useJobPoll";
import { api } from "../../app/api";

export type PersonMetadataFetchStatus = "idle" | "fetching" | "done" | "error";

interface UsePersonMetadataFetchOptions {
  onComplete?: () => void;
}

export function usePersonMetadataFetch(
  slug: string | undefined,
  options: UsePersonMetadataFetchOptions = {},
) {
  const [status, setStatus] = useState<PersonMetadataFetchStatus>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);
  const onCompleteRef = useRef(options.onComplete);
  onCompleteRef.current = options.onComplete;

  const { status: jobStatus } = useJobPoll(jobId, {
    onComplete: () => {
      setStatus("done");
      onCompleteRef.current?.();
    },
  });

  useEffect(() => {
    if (jobStatus === "failed" || jobStatus === "cancelled") {
      setStatus("error");
    }
  }, [jobStatus]);

  useEffect(() => {
    if (status !== "fetching") return;

    const timeout = setTimeout(() => {
      if (jobStatus === "queued" || jobStatus === null) {
        setStatus("done");
        onCompleteRef.current?.();
      }
    }, 60_000);

    return () => clearTimeout(timeout);
  }, [status, jobStatus]);

  const triggerFetch = useCallback(() => {
    if (!slug) return;
    setStatus("fetching");
    setJobId(null);
    void api<{ data: { jobId: string } }>(`/people/${slug}/metadata/fetch`, {
      method: "POST",
    })
      .then((res) => {
        setJobId(res.data.jobId);
      })
      .catch(() => setStatus("error"));
  }, [slug]);

  useEffect(() => {
    if (!slug || fetchedRef.current === slug) return;
    fetchedRef.current = slug;
    triggerFetch();
  }, [slug, triggerFetch]);

  return { status, triggerFetch };
}