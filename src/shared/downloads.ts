export type DownloadStatus =
  | "queued"
  | "in_progress"
  | "available"
  | "failed"
  | "removed";

export interface DownloadPreparePayload {
  representationId?: string;
  urls: string[];
}

export interface DownloadPublic {
  id: string;
  fileId: string;
  deviceId: string | null;
  status: DownloadStatus;
  bytesTotal: number | null;
  bytesDownloaded: number | null;
  preparePayload: DownloadPreparePayload | null;
  createdAt: string;
  title?: string | null;
  format?: string | null;
  representationId?: string | null;
}

export interface CreateDownloadResponse {
  id: string;
  jobId: string;
}
