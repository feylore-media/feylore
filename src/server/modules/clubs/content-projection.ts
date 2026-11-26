import { inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as s from "../../db/schema.js";
import type { UserStateService } from "../user-state/service.js";
import type { ReadingProgressService } from "../reading-progress/service.js";
import type { ProgressLocator } from "../../../shared/progress-locator.js";
import type { ConsumptionTarget } from "../../../shared/clubs.js";
import { canSeeClubLocation, safeLocationLabel } from "./safe-projection.js";
export class ClubContentProjection {
  constructor(
    private db: Database,
    private state: UserStateService,
    private primary?: ReadingProgressService,
  ) {}
  async progress(
    userId: string,
    read: typeof s.clubReads.$inferSelect,
  ): Promise<ProgressLocator | null> {
    if (!read.workSubjectId) return null;
    const primary = await this.primary?.getPrimaryProgressForWork(
      userId,
      read.workSubjectType,
      read.workSubjectId,
    );
    if (primary) return { kind: "reading", ...primary.progress.locator };
    return (
      (
        await this.state.getProgress(
          userId,
          read.workSubjectType,
          read.workSubjectId,
        )
      )?.locator ?? null
    );
  }
  async topics(userId: string, topics: (typeof s.clubTopics.$inferSelect)[]) {
    const ids = [
      ...new Set(
        topics.map((t) => t.clubReadId).filter((id): id is string => !!id),
      ),
    ];
    const occurrenceIds = topics
      .map((t) => t.scheduleOccurrenceId)
      .filter((id): id is string => !!id);
    const [reads, occurrences] = await Promise.all([
      ids.length
        ? this.db.select().from(s.clubReads).where(inArray(s.clubReads.id, ids))
        : [],
      occurrenceIds.length
        ? this.db
            .select()
            .from(s.clubScheduleOccurrences)
            .where(inArray(s.clubScheduleOccurrences.id, occurrenceIds))
        : [],
    ]);
    const progress = new Map(
      await Promise.all(
        reads.map(
          async (read) => [read.id, await this.progress(userId, read)] as const,
        ),
      ),
    );
    const legacy = new Map<string, ProgressLocator | null>();
    for (const topic of topics)
      if (
        !topic.clubReadId &&
        topic.workSubjectId &&
        !legacy.has(topic.workSubjectId)
      )
        legacy.set(
          topic.workSubjectId,
          (
            await this.state.getProgress(
              userId,
              topic.workSubjectType ?? "book",
              topic.workSubjectId,
            )
          )?.locator ?? null,
        );
    return new Map(
      topics.map((topic) => {
        const occurrence = occurrences.find(
            (o) => o.id === topic.scheduleOccurrenceId,
          ),
          consumption = occurrence?.consumption as
            ConsumptionTarget | undefined;
        const visible =
          (!occurrence || occurrence.opensAt.getTime() <= Date.now()) &&
          ((!topic.clubReadId && !consumption) ||
            canSeeClubLocation(
              (topic.clubReadId
                ? progress.get(topic.clubReadId)
                : legacy.get(topic.workSubjectId ?? "")) ?? null,
              topic.spoilerBoundary,
              consumption,
            ));
        return [
          topic.id,
          {
            visible,
            label: safeLocationLabel(topic.mediaLocation, consumption),
            progress: progress.get(topic.clubReadId ?? "") ?? null,
            consumption: consumption
              ? consumption.kind === "custom"
                ? { kind: "custom" as const, label: "Unordered location" }
                : { ...consumption, label: undefined }
              : null,
          },
        ];
      }),
    );
  }
  async quotes(userId: string, quotes: (typeof s.clubQuotes.$inferSelect)[]) {
    const ids = [
      ...new Set(
        quotes.map((q) => q.clubReadId).filter((id): id is string => !!id),
      ),
    ];
    const reads = ids.length
      ? await this.db
          .select()
          .from(s.clubReads)
          .where(inArray(s.clubReads.id, ids))
      : [];
    const progress = new Map(
      await Promise.all(
        reads.map(
          async (read) => [read.id, await this.progress(userId, read)] as const,
        ),
      ),
    );
    const legacy = new Map<string, ProgressLocator | null>();
    for (const quote of quotes)
      if (!quote.clubReadId && !legacy.has(quote.workSubjectId))
        legacy.set(
          quote.workSubjectId,
          (
            await this.state.getProgress(
              userId,
              quote.workSubjectType,
              quote.workSubjectId,
            )
          )?.locator ?? null,
        );
    return new Map(
      quotes.map((quote) => {
        const locator = quote.locatorJson as {
          totalProgression?: number;
        } | null;
        const boundary =
          quote.spoilerBoundary ??
          (locator?.totalProgression !== undefined
            ? {
                kind: "chapter" as const,
                progression: locator.totalProgression,
              }
            : { kind: "final" as const });
        return [
          quote.id,
          {
            visible: canSeeClubLocation(
              quote.clubReadId
                ? (progress.get(quote.clubReadId) ?? null)
                : (legacy.get(quote.workSubjectId) ?? null),
              boundary,
            ),
            label: safeLocationLabel(quote.mediaLocation ?? boundary),
            boundary,
          },
        ];
      }),
    );
  }
  async quote(userId: string, quote: typeof s.clubQuotes.$inferSelect) {
    return (await this.quotes(userId, [quote])).get(quote.id)!;
  }
}
