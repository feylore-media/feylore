import { max, and, eq, desc } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { JobStatus } from "@shared/api.js";
import { resolveTaskLabels, taskMapKey } from "./task-labels.js";
import { deriveTaskKey } from "./task-key.js";
import type { JobType } from "./types.js";

type JobRunRow = typeof schema.jobRuns.$inferSelect;

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

function toJobRunDetail(row: JobRunRow): JobRunDetail {
  return {
    id: row.id,
    type: row.type,
    taskKey: row.taskKey,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    logExcerpt: row.logExcerpt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export function computeFailureStreak(runsNewestFirst: JobRunRow[]): number {
  const latest = runsNewestFirst[0];
  if (!latest || latest.status === "queued" || latest.status === "running") {
    return 0;
  }

  let streak = 0;
  for (const run of runsNewestFirst) {
    if (run.status === "failed") {
      streak++;
      continue;
    }
    break;
  }
  return streak;
}

function sortTaskSummaries(
  summaries: JobTaskSummary[],
): JobTaskSummary[] {
  return [...summaries].sort((a, b) => {
    const aKeepsFailing = a.failureStreak >= 2 ? 1 : 0;
    const bKeepsFailing = b.failureStreak >= 2 ? 1 : 0;
    if (aKeepsFailing !== bKeepsFailing) return bKeepsFailing - aKeepsFailing;

    const aFailed = a.latest.status === "failed" ? 1 : 0;
    const bFailed = b.latest.status === "failed" ? 1 : 0;
    if (aFailed !== bFailed) return bFailed - aFailed;

    const aActive =
      a.latest.status === "queued" || a.latest.status === "running" ? 1 : 0;
    const bActive =
      b.latest.status === "queued" || b.latest.status === "running" ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;

    return (
      new Date(b.latest.updatedAt).getTime() -
      new Date(a.latest.updatedAt).getTime()
    );
  });
}

function buildTaskSummaries(
  allRuns: JobRunRow[],
): {
  summaries: JobTaskSummary[];
  runsByTask: Map<string, JobRunRow[]>;
} {
  const latestByTask = new Map<string, JobRunRow>();
  const runCounts = new Map<string, number>();
  const runsByTask = new Map<string, JobRunRow[]>();

  for (const run of allRuns) {
    const key = taskMapKey(run.type, run.taskKey);
    runCounts.set(key, (runCounts.get(key) ?? 0) + 1);
    if (!latestByTask.has(key)) {
      latestByTask.set(key, run);
    }
    const history = runsByTask.get(key) ?? [];
    history.push(run);
    runsByTask.set(key, history);
  }

  const summaries: JobTaskSummary[] = [];
  for (const [key, latest] of latestByTask) {
    const runs = runsByTask.get(key) ?? [latest];
    summaries.push({
      type: latest.type,
      taskKey: latest.taskKey,
      taskLabel: "",
      latest: toJobRunDetail(latest),
      failureStreak: computeFailureStreak(runs),
      runCount: runCounts.get(key) ?? 1,
    });
  }

  return { summaries, runsByTask };
}

function computeGlobalSummary(summaries: JobTaskSummary[]): JobsTasksSummary {
  return {
    failedCount: summaries.filter((s) => s.latest.status === "failed").length,
    keepsFailingCount: summaries.filter((s) => s.failureStreak >= 2).length,
    activeCount: summaries.filter(
      (s) => s.latest.status === "queued" || s.latest.status === "running",
    ).length,
    totalTaskCount: summaries.length,
  };
}

export async function listJobTasks(
  db: Database,
  options?: {
    type?: string;
    status?: JobStatus;
    failuresOnly?: boolean;
    limit?: number;
    cursor?: string;
  },
): Promise<{
  data: JobTaskSummary[];
  nextCursor?: string;
  summary: JobsTasksSummary;
}> {
  const allRuns = await db
    .select()
    .from(schema.jobRuns)
    .orderBy(desc(schema.jobRuns.createdAt), desc(schema.jobRuns.id));

  const { summaries: rawSummaries } = buildTaskSummaries(allRuns);

  let filtered = rawSummaries;
  if (options?.type) {
    filtered = filtered.filter((s) => s.type === options.type);
  }
  if (options?.status) {
    filtered = filtered.filter((s) => s.latest.status === options.status);
  }
  if (options?.failuresOnly) {
    filtered = filtered.filter((s) => s.latest.status === "failed");
  }

  const summary = computeGlobalSummary(filtered);
  const sorted = sortTaskSummaries(filtered);

  const labels = await resolveTaskLabels(
    db,
    sorted.map((s) => ({ type: s.type, taskKey: s.taskKey })),
  );
  for (const task of sorted) {
    task.taskLabel =
      labels.get(taskMapKey(task.type, task.taskKey)) ?? task.taskKey;
  }

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  let startIndex = 0;
  if (options?.cursor) {
    const cursorIndex = sorted.findIndex((s) => s.latest.id === options.cursor);
    if (cursorIndex >= 0) startIndex = cursorIndex + 1;
  }

  const page = sorted.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sorted.length;
  const nextCursor = hasMore ? page[page.length - 1]?.latest.id : undefined;

  return { data: page, nextCursor, summary };
}

export async function nextAttemptNumber(
  db: Database,
  type: JobType | string,
  taskKey: string,
): Promise<number> {
  const [row] = await db
    .select({ maxAttempts: max(schema.jobRuns.attempts) })
    .from(schema.jobRuns)
    .where(
      and(eq(schema.jobRuns.type, type), eq(schema.jobRuns.taskKey, taskKey)),
    );
  return (row?.maxAttempts ?? 0) + 1;
}

export async function retryJob(
  db: Database,
  enqueue: (
    type: JobType,
    payload: Record<string, unknown>,
    options?: { singletonKey?: string },
  ) => Promise<string>,
  jobId: string,
): Promise<string | null> {
  const source = await db.query.jobRuns.findFirst({
    where: eq(schema.jobRuns.id, jobId),
  });
  if (!source) return null;
  if (source.status !== "failed" && source.status !== "cancelled") {
    return null;
  }

  const payload = { ...(source.payload ?? {}) };
  delete payload.feyloreJobId;

  const singletonKey =
    source.type === "podcast.feed.sync" && typeof payload.feedId === "string"
      ? `podcast-feed-${payload.feedId}`
      : undefined;

  return enqueue(source.type as JobType, payload, { singletonKey });
}

export { deriveTaskKey };
