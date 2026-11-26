import { and, eq, gte, lte, type SQL } from "drizzle-orm";
import {
  isAllTimeRange,
  isStatsMediaType,
  type StatsFactKind,
  type StatsMediaType,
  type StatsRange,
  type StatsRatingScale,
  type StatsResponse,
} from "../../../shared/stats.js";
import {
  resolveAllTimeRange,
  resolveStatsRange,
  STATS_MEDIA_TYPES,
  STATS_ALL_TIME_FROM,
} from "../../../shared/stats.js";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError } from "../../../shared/errors.js";
import type { ProfileService } from "../users/profile-service.js";

export interface FactRow {
  kind: StatsFactKind;
  mediaType: StatsMediaType;
  subjectType: string;
  subjectId: string;
  occurredAt: Date;
  value: number;
  unit: string;
  ratingScale: number | null;
  snapshot: Record<string, unknown>;
}

interface SnapshotData {
  title?: string;
  subtitle?: string | null;
  href?: string | null;
  releaseYear?: number | null;
  durationSeconds?: number | null;
  coverFileId?: string | null;
  creators?: Array<{ role?: string; name?: string; peopleId?: string | null }>;
  genres?: Array<{ name?: string }>;
}

/**
 * Resolve a stats request range. `from=1970-01-01` with no `to` is the
 * all-time range (unbounded above, labelled "All Time"); anything else
 * canonicalizes to the current-year-default range. See docs/STATS.md §2.
 */
export function resolveStatsRequestRange(
  from: string | null,
  to: string | null,
  now: Date = new Date(),
): StatsRange {
  if (isAllTimeRange(from, to)) return resolveAllTimeRange();
  return resolveStatsRange(from, to, now);
}

export class StatsService {
  constructor(
    private readonly db: Database,
    private readonly profiles: ProfileService,
  ) {}

  isStatsDomain(value: string): value is StatsMediaType {
    return isStatsMediaType(value);
  }

  async getForUser(
    username: string,
    viewerId: string | null,
    from: string | null,
    to: string | null,
    mediaType?: string,
  ): Promise<StatsResponse> {
    const user = await this.profiles.findByUsername(username);
    if (!user) throw new NotFoundError("Profile not found");

    const canView = await this.profiles.canViewProfileAsync(user, viewerId);
    if (!canView) throw new NotFoundError("Profile not found");

    const isOwner = viewerId != null && user.id === viewerId;

    const range = resolveStatsRequestRange(from, to);
    const rows = await this.queryFacts(
      user.id,
      isOwner,
      mediaType && isStatsMediaType(mediaType) ? mediaType : null,
      range.from ?? STATS_ALL_TIME_FROM,
      range.to,
    );

    return {
      profile: {
        username: user.username,
        displayName: user.displayName,
      },
      range,
      ...aggregateFacts(rows, range),
    };
  }

  private async queryFacts(
    userId: string,
    isOwner: boolean,
    mediaType: StatsMediaType | null,
    from: string,
    to: string | null,
  ): Promise<FactRow[]> {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = to === null ? null : new Date(`${to}T23:59:59.999Z`);

    const where: SQL[] = [
      eq(schema.userStatFacts.userId, userId),
      gte(schema.userStatFacts.occurredAt, fromDate),
    ];
    if (mediaType !== null) {
      where.push(eq(schema.userStatFacts.mediaType, mediaType));
    }
    if (toDate !== null) {
      where.push(lte(schema.userStatFacts.occurredAt, toDate));
    }
    if (!isOwner) {
      where.push(eq(schema.userStatFacts.visibility, "public"));
    }

    const rows = await this.db
      .select({
        kind: schema.userStatFacts.kind,
        mediaType: schema.userStatFacts.mediaType,
        subjectType: schema.userStatFacts.subjectType,
        subjectId: schema.userStatFacts.subjectId,
        occurredAt: schema.userStatFacts.occurredAt,
        value: schema.userStatFacts.value,
        unit: schema.userStatFacts.unit,
        ratingScale: schema.userStatFacts.ratingScale,
        snapshot: schema.userStatFacts.snapshot,
      })
      .from(schema.userStatFacts)
      .where(and(...where));

    return rows as unknown as FactRow[];
  }
}

function snapshotOf(snapshot: Record<string, unknown>): SnapshotData {
  return snapshot as SnapshotData;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function aggregateFacts(
  rows: FactRow[],
  range: { from: string | null; to: string | null },
): Omit<StatsResponse, "profile" | "range"> {
  const completed = rows.filter((r) => r.kind === "completed");
  const rated = rows.filter((r) => r.kind === "rated");
  const sessions = rows.filter((r) => r.kind === "session");

  const domainCounts = STATS_MEDIA_TYPES.map((mediaType) => ({
    mediaType,
    count: completed.filter((r) => r.mediaType === mediaType).length,
  })).filter((d) => d.count > 0);

  const totalCompleted = completed.length;
  const readingSeconds = sessions.reduce((sum, r) => sum + (r.value || 0), 0);

  const activeDays = new Set(rows.map((r) => dayKey(r.occurredAt))).size;

  const media = STATS_MEDIA_TYPES.filter((mt) =>
    rows.some((r) => r.mediaType === mt),
  ).map((mediaType) => ({
    mediaType,
    label: mediaType,
  }));

  const { ticks, buckets } = buildTimeSeries(rows, range.from, range.to);

  const rating = buildRating(rated);

  const genres = buildGenres(completed);
  const creators = buildCreators(completed);
  const releaseYears = buildReleaseYears(completed);
  const duration = buildDuration(completed);
  const highlights = buildHighlights(rated);
  const heatmap = buildHeatmap(rows, range);

  return {
    headline: {
      domainCounts,
      totalCompleted,
      activeDays,
      readingSeconds,
    },
    media,
    timeSeries: { ticks, buckets },
    rating,
    genres,
    creators,
    releaseYears,
    duration,
    highlights,
    heatmap,
  };
}

function buildTimeSeries(
  rows: FactRow[],
  from: string | null,
  to: string | null,
): {
  ticks: { key: string; label: string }[];
  buckets: { key: string; completed: number; sessions: number; plays: number; readingSeconds: number }[];
} {
  const byMonth = new Map<
    string,
    { completed: number; sessions: number; plays: number; readingSeconds: number }
  >();

  for (const row of rows) {
    const key = monthKey(row.occurredAt);
    let bucket = byMonth.get(key);
    if (!bucket) {
      bucket = { completed: 0, sessions: 0, plays: 0, readingSeconds: 0 };
      byMonth.set(key, bucket);
    }
    if (row.kind === "completed") bucket.completed += 1;
    else if (row.kind === "session") {
      bucket.sessions += 1;
      bucket.readingSeconds += row.value || 0;
    } else if (row.kind === "play") bucket.plays += 1;
  }

  const start = new Date(from ?? STATS_ALL_TIME_FROM);
  const endDate =
    to === null ? new Date() : new Date(`${to}T00:00:00.000Z`);
  const stream = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1),
  );

  const ticks: { key: string; label: string }[] = [];
  const buckets = [];

  while (stream.getTime() <= end.getTime()) {
    const key = monthKey(stream);
    const label = `${MONTHS[stream.getUTCMonth()]} ${String(
      stream.getUTCFullYear(),
    ).slice(2)}`;
    ticks.push({ key, label });
    buckets.push({
      key,
      completed: 0,
      sessions: 0,
      plays: 0,
      readingSeconds: 0,
      ...(byMonth.get(key) ?? {}),
    });
    stream.setUTCMonth(stream.getUTCMonth() + 1);
  }

  return { ticks, buckets };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function buildRating(facts: FactRow[]): StatsResponse["rating"] {
  if (facts.length === 0) {
    return { bucketSize: 5, avg: null, count: 0, distribution: [] };
  }
  const bucketSize = pickBucketSize(facts);
  const distribution = new Map<number, number>();
  let sum = 0;
  for (const fact of facts) {
    const value = Math.round(fact.value);
    sum += fact.value;
    distribution.set(value, (distribution.get(value) ?? 0) + 1);
  }
  return {
    bucketSize,
    avg: sum / facts.length,
    count: facts.length,
    distribution: Array.from(distribution.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([value, count]) => ({ value, count })),
  };
}

function pickBucketSize(facts: FactRow[]): StatsRatingScale {
  const scales = facts
    .map((f) => f.ratingScale)
    .filter((s): s is StatsRatingScale => s === 5 || s === 10);
  if (scales.length === 0) return 5;
  const min = Math.min(...scales);
  return min === 10 ? 10 : 5;
}

function buildGenres(completed: FactRow[]): StatsResponse["genres"] {
  const counts = new Map<string, number>();
  for (const fact of completed) {
    for (const genre of snapshotOf(fact.snapshot).genres ?? []) {
      if (!genre.name) continue;
      counts.set(genre.name, (counts.get(genre.name) ?? 0) + 1);
    }
  }
  const total = completed.length || 1;
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({
      name,
      count,
      share: Math.round((count / total) * 1000) / 10,
    }));
}

function buildCreators(completed: FactRow[]): StatsResponse["creators"] {
  const counts = new Map<string, { role: string; name: string; peopleId: string | null; count: number }>();
  for (const fact of completed) {
    for (const creator of snapshotOf(fact.snapshot).creators ?? []) {
      if (!creator.name) continue;
      const key = `${creator.role ?? "creator"}\u0000${creator.name}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, {
          role: creator.role ?? "creator",
          name: creator.name,
          peopleId: creator.peopleId ?? null,
          count: 1,
        });
      }
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map(({ role, name, peopleId, count }) => ({ role, name, peopleId, count }));
}

function buildReleaseYears(completed: FactRow[]): StatsResponse["releaseYears"] {
  const counts = new Map<number, number>();
  for (const fact of completed) {
    const year = snapshotOf(fact.snapshot).releaseYear;
    if (!year) continue;
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, count]) => ({ year, count }));
}

function buildDuration(completed: FactRow[]): StatsResponse["duration"] {
  if (completed.length === 0) return null;
  const durations = completed
    .map((fact) => snapshotOf(fact.snapshot).durationSeconds)
    .filter((d): d is number => typeof d === "number" && d > 0);
  if (durations.length === 0) return null;
  const total = durations.reduce((sum, d) => sum + d, 0);
  return {
    completedCount: durations.length,
    avgSeconds: Math.round(total / durations.length),
    totalSeconds: total,
  };
}

function buildHighlights(facts: FactRow[]): StatsResponse["highlights"] {
  const sorted = [...facts]
    .filter((fact) => fact.value > 0)
    .sort(
      (a, b) =>
        b.value - a.value ||
        b.occurredAt.getTime() - a.occurredAt.getTime(),
    );
  return sorted.slice(0, 8).map((fact) => {
    const s = snapshotOf(fact.snapshot);
    return {
      subjectType: fact.subjectType,
      subjectId: fact.subjectId,
      title: s.title ?? fact.subjectId,
      subtitle: s.subtitle ?? null,
      href: s.href ?? null,
      rating: fact.value,
      ratingScale: fact.ratingScale === 10 ? 10 : 5,
      coverFileId: s.coverFileId ?? null,
    };
  });
}

function buildHeatmap(
  rows: FactRow[],
  range: { from: string | null; to: string | null },
): StatsResponse["heatmap"] {
  const toDate =
    range.to === null
      ? new Date()
      : new Date(`${range.to}T23:59:59.999Z`);
  const windowStart = new Date(
    Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1),
  );
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 1);

  const days = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(row.occurredAt);
    if (key >= dayKey(windowStart)) {
      days.set(key, (days.get(key) ?? 0) + 1);
    }
  }

  const result: { day: string; count: number }[] = [];
  const cursor = new Date(windowStart);
  while (cursor.getTime() <= toDate.getTime()) {
    const key = dayKey(cursor);
    result.push({ day: key, count: days.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}