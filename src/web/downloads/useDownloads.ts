import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DownloadPublic } from "@shared/downloads";
import { isJobActive, type JobStatus } from "@shared/api";
import { api } from "../app/api";
import { downloadManager } from "./manager";

const POLL_INTERVAL_MS = 2000;

async function pollJobUntilComplete(jobId: string): Promise<JobStatus> {
  for (;;) {
    const res = await api<{ data: { status: JobStatus; error?: string } }>(
      `/jobs/${jobId}`,
    );
    if (!isJobActive(res.data.status)) {
      if (res.data.status === "failed") {
        throw new Error(res.data.error ?? "Download preparation failed");
      }
      return res.data.status;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

export async function executeDownloadCaching(
  downloadId: string,
  jobId: string,
  onProgress?: (bytesDownloaded: number) => void,
): Promise<DownloadPublic> {
  await pollJobUntilComplete(jobId);

  const detail = await api<{ data: DownloadPublic }>(`/downloads/${downloadId}`);
  const urls = detail.data.preparePayload?.urls;
  if (!urls?.length) {
    throw new Error("Download has no prepared URLs");
  }

  await downloadManager.fetchAndCache(
    downloadId,
    detail.data.fileId,
    urls,
    async (bytesDownloaded) => {
      onProgress?.(bytesDownloaded);
      await api(`/downloads/${downloadId}`, {
        method: "PATCH",
        body: JSON.stringify({ bytesDownloaded }),
      });
    },
  );

  const completed = await api<{ data: DownloadPublic }>(
    `/downloads/${downloadId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "available" }),
    },
  );
  return completed.data;
}

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProgress, setActiveProgress] = useState<
    Record<string, number>
  >({});
  const runningRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: DownloadPublic[] }>("/downloads");
      setDownloads(
        res.data.filter((d) => d.status !== "removed"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startDownload = useCallback(
    async (fileId: string, representationId?: string) => {
      const res = await api<{ data: { id: string; jobId: string } }>(
        "/downloads",
        {
          method: "POST",
          body: JSON.stringify({ fileId, representationId }),
        },
      );
      const { id, jobId } = res.data;
      await refresh();

      if (runningRef.current.has(id)) return id;
      runningRef.current.add(id);

      void executeDownloadCaching(id, jobId, (bytes) => {
        setActiveProgress((prev) => ({ ...prev, [id]: bytes }));
      })
        .then(() => refresh())
        .catch(() => refresh())
        .finally(() => {
          runningRef.current.delete(id);
          setActiveProgress((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        });

      return id;
    },
    [refresh],
  );

  const removeDownload = useCallback(
    async (id: string) => {
      await api(`/downloads/${id}`, { method: "DELETE" });
      await downloadManager.removeDownload(id);
      await refresh();
    },
    [refresh],
  );

  const getDownloadForFile = useCallback(
    (fileId: string) =>
      downloads.find(
        (d) =>
          d.fileId === fileId &&
          d.status !== "removed" &&
          d.status !== "failed",
      ) ??
      downloads.find(
        (d) => d.fileId === fileId && d.status === "failed",
      ),
    [downloads],
  );

  const grouped = useMemo(() => {
    const active: DownloadPublic[] = [];
    const queued: DownloadPublic[] = [];
    const available: DownloadPublic[] = [];
    const failed: DownloadPublic[] = [];

    for (const d of downloads) {
      switch (d.status) {
        case "in_progress":
          active.push(d);
          break;
        case "queued":
          queued.push(d);
          break;
        case "available":
          available.push(d);
          break;
        case "failed":
          failed.push(d);
          break;
      }
    }

    return { active, queued, available, failed };
  }, [downloads]);

  return {
    downloads,
    grouped,
    loading,
    activeProgress,
    refresh,
    startDownload,
    removeDownload,
    getDownloadForFile,
  };
}
