export interface PaginatedResponse<T> {
  data: T[];
  page: { nextCursor: string | null; prevCursor: string | null };
}

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobRun {
  id: string;
  type: string;
  taskKey?: string;
  status: JobStatus;
  error: string | null;
  logExcerpt: string | null;
}

export interface JobRunDetail {
  id: string;
  type: string;
  taskKey: string;
  status: JobStatus;
  attempts: number;
  error: string | null;
  logExcerpt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface JobTaskSummary {
  type: string;
  taskKey: string;
  taskLabel: string;
  latest: JobRunDetail;
  failureStreak: number;
  runCount: number;
}

export interface JobsTasksSummary {
  failedCount: number;
  keepsFailingCount: number;
  activeCount: number;
  totalTaskCount: number;
}

export interface JobsTasksResponse {
  data: JobTaskSummary[];
  page: { nextCursor?: string };
  summary: JobsTasksSummary;
}

export function isJobActive(status: JobStatus | null | undefined): boolean {
  return status === "queued" || status === "running";
}
