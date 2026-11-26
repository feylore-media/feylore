import { eq, and, asc, lte, lt, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { ClubWorksService } from "./works.js";
import type { ClubDiscussionService } from "./discussion.js";
import {
  applyScheduleTemplate,
  formatConsumptionLabel,
  type ClubSchedule,
  type ClubScheduleOccurrence,
  type ClubScheduleView,
  type ConsumptionTarget,
} from "../../../shared/clubs.js";
import type { WorkSubjectType } from "../../../shared/subject.js";

const OCCURRENCE_HORIZON = 12;

export class ClubScheduleService {
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly works: ClubWorksService,
    private readonly discussion: ClubDiscussionService,
  ) {}

  private toSchedule(
    row: typeof schema.clubSchedules.$inferSelect,
  ): ClubSchedule {
    return {
      id: row.id,
      clubId: row.clubId,
      clubWorkId: row.clubWorkId,
      clubReadId: row.clubReadId,
      title: row.title,
      frequency: row.frequency,
      interval: row.interval,
      dayOfWeek: row.dayOfWeek,
      dayOfMonth: row.dayOfMonth,
      timeOfDay: row.timeOfDay,
      timezone: row.timezone,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      maxOccurrences: row.maxOccurrences,
      consumption: row.consumption as ConsumptionTarget,
      topicTitleTemplate: row.topicTitleTemplate,
      topicBodyTemplate: row.topicBodyTemplate,
      topicTiming: row.topicTiming,
      hoursBefore: row.hoursBefore,
      autoCreateTopic: row.autoCreateTopic,
      status: row.status,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toOccurrence(
    row: typeof schema.clubScheduleOccurrences.$inferSelect,
  ): ClubScheduleOccurrence {
    const consumption = row.consumption as ConsumptionTarget;
    return {
      id: row.id,
      scheduleId: row.scheduleId,
      clubReadId: row.clubReadId,
      clubId: row.clubId,
      workSubjectType: row.workSubjectType as WorkSubjectType | null,
      workSubjectId: row.workSubjectId,
      scheduledAt: row.scheduledAt.toISOString(),
      opensAt: row.opensAt.toISOString(),
      consumption,
      consumptionLabel: formatConsumptionLabel(consumption),
      title: row.title,
      topicId: row.topicId,
      status: row.status,
      sequenceNumber: row.sequenceNumber,
    };
  }

  resolveOccurrenceConsumption(
    base: ConsumptionTarget,
    sequenceNumber: number,
  ): ConsumptionTarget {
    const offset = sequenceNumber - 1;
    switch (base.kind) {
      case "chapter": {
        const increment = base.increment ?? 1;
        const count = base.count ?? 1;
        const start = base.start + offset * increment;
        return { kind: "chapter", start, count };
      }
      case "episode": {
        const increment = base.increment ?? 1;
        const count = base.count ?? 1;
        if (base.end !== undefined && base.increment === undefined) {
          const span = base.end - base.start + 1;
          const start = base.start + offset * span;
          return { kind: "episode", start, end: start + span - 1 };
        }
        const start = base.start + offset * increment;
        if (count === 1) return { kind: "episode", start };
        return { kind: "episode", start, end: start + count - 1 };
      }
      case "page": {
        const increment =
          base.increment ?? (base.end ? base.end - base.start + 1 : 1);
        const start = base.start + offset * increment;
        const end =
          base.end !== undefined ? start + (base.end - base.start) : undefined;
        return end !== undefined
          ? { kind: "page", start, end }
          : { kind: "page", start };
      }
      case "custom":
        return base;
    }
  }

  private computeOpensAt(
    scheduledAt: Date,
    timing: (typeof schema.clubSchedules.$inferSelect)["topicTiming"],
    hoursBefore: number | null,
  ): Date {
    if (timing === "immediate") {
      return new Date();
    }
    if (timing === "hours_before" && hoursBefore) {
      return new Date(scheduledAt.getTime() - hoursBefore * 60 * 60 * 1000);
    }
    return scheduledAt;
  }

  private parseTimeOfDay(timeOfDay: string): {
    hours: number;
    minutes: number;
  } {
    const [h, m] = timeOfDay.split(":").map(Number);
    return { hours: h ?? 19, minutes: m ?? 0 };
  }

  private applyTimeOfDay(date: Date, timeOfDay: string): Date {
    const { hours, minutes } = this.parseTimeOfDay(timeOfDay);
    const result = new Date(date);
    result.setUTCHours(hours, minutes, 0, 0);
    return result;
  }

  private nextOccurrenceDate(
    schedule: typeof schema.clubSchedules.$inferSelect,
    from: Date,
    sequenceNumber: number,
  ): Date {
    const base = new Date(schedule.startsAt);
    const { hours, minutes } = this.parseTimeOfDay(schedule.timeOfDay);

    if (schedule.frequency === "once") {
      const once = new Date(schedule.startsAt);
      once.setUTCHours(hours, minutes, 0, 0);
      return once;
    }

    const interval = schedule.interval;
    const result = new Date(base);
    result.setUTCHours(hours, minutes, 0, 0);

    switch (schedule.frequency) {
      case "daily": {
        result.setUTCDate(
          result.getUTCDate() + (sequenceNumber - 1) * interval,
        );
        return result;
      }
      case "weekly": {
        const targetDow = schedule.dayOfWeek ?? result.getUTCDay();
        const first = new Date(schedule.startsAt);
        first.setUTCHours(hours, minutes, 0, 0);
        const daysUntilFirst = (targetDow - first.getUTCDay() + 7) % 7;
        first.setUTCDate(first.getUTCDate() + daysUntilFirst);
        if (sequenceNumber > 1) {
          first.setUTCDate(
            first.getUTCDate() + (sequenceNumber - 1) * 7 * interval,
          );
        }
        return first;
      }
      case "monthly": {
        const dom = schedule.dayOfMonth ?? result.getUTCDate();
        result.setUTCMonth(
          result.getUTCMonth() + (sequenceNumber - 1) * interval,
        );
        const maxDom = new Date(
          Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
        ).getUTCDate();
        result.setUTCDate(Math.min(dom, maxDom));
        return result;
      }
      default:
        return from;
    }
  }

  async listSchedules(user: AuthUser, clubId: string): Promise<ClubSchedule[]> {
    await this.clubs.requireView(user, clubId);
    const rows = await this.db
      .select()
      .from(schema.clubSchedules)
      .where(eq(schema.clubSchedules.clubId, clubId))
      .orderBy(asc(schema.clubSchedules.startsAt));
    return rows.map((row) => this.toSchedule(row));
  }

  async getScheduleView(
    user: AuthUser,
    clubId: string,
    options?: { pastLimit?: number; upcomingLimit?: number },
  ): Promise<ClubScheduleView> {
    await this.clubs.requireView(user, clubId);
    const now = new Date();
    const upcomingLimit = options?.upcomingLimit ?? 20;
    const pastLimit = options?.pastLimit ?? 10;

    const allRows = await this.db
      .select()
      .from(schema.clubScheduleOccurrences)
      .where(eq(schema.clubScheduleOccurrences.clubId, clubId))
      .orderBy(asc(schema.clubScheduleOccurrences.scheduledAt));

    const occurrences = allRows.map((row) => this.toOccurrence(row));

    const current =
      occurrences.find(
        (o) =>
          (o.status === "open" || o.status === "upcoming") &&
          new Date(o.scheduledAt) <= now &&
          new Date(o.opensAt) <= now,
      ) ??
      occurrences.find((o) => o.status === "upcoming" || o.status === "open") ??
      null;

    const upcoming = occurrences
      .filter(
        (o) =>
          (o.status === "upcoming" || o.status === "open") &&
          o.id !== current?.id &&
          new Date(o.scheduledAt) > now,
      )
      .slice(0, upcomingLimit);

    const past = occurrences
      .filter((o) => o.status === "completed" || o.status === "open")
      .filter((o) => new Date(o.scheduledAt) < now && o.id !== current?.id)
      .slice(-pastLimit)
      .reverse();

    return { current, upcoming, past };
  }

  async createSchedule(
    user: AuthUser,
    clubId: string,
    input: {
      clubWorkId?: string | null;
      clubReadId?: string | null;
      title: string;
      eventKind?: "checkin" | "final_discussion";
      frequency: (typeof schema.clubSchedules.$inferSelect)["frequency"];
      interval: number;
      dayOfWeek?: number;
      dayOfMonth?: number;
      timeOfDay: string;
      timezone: string;
      startsAt: string;
      endsAt?: string | null;
      maxOccurrences?: number | null;
      consumption: ConsumptionTarget;
      topicTitleTemplate?: string;
      topicBodyTemplate?: string;
      topicTiming?: (typeof schema.clubSchedules.$inferSelect)["topicTiming"];
      hoursBefore?: number;
      autoCreateTopic?: boolean;
    },
  ): Promise<string> {
    const club = await this.clubs.getClub(clubId);
    if (!(await this.clubs.canModerate(user, club))) {
      throw new ForbiddenError();
    }

    if (input.frequency === "weekly" && input.dayOfWeek === undefined) {
      throw new ValidationError("dayOfWeek is required for weekly schedules");
    }
    if (input.frequency === "monthly" && input.dayOfMonth === undefined) {
      throw new ValidationError("dayOfMonth is required for monthly schedules");
    }
    if (
      input.eventKind === "final_discussion" &&
      (input.frequency !== "once" || !input.clubReadId)
    )
      throw new ValidationError(
        "A final discussion must be a one-time event for a Club Read",
      );
    if (
      input.topicTiming === "hours_before" &&
      (input.hoursBefore === undefined || input.hoursBefore < 1)
    ) {
      throw new ValidationError(
        "hoursBefore is required for hours_before timing",
      );
    }

    if (input.clubWorkId) {
      await this.works.getWorkRow(clubId, input.clubWorkId);
    }
    let clubReadId = input.clubReadId ?? null;
    if (clubReadId) {
      const read = await this.db.query.clubReads.findFirst({
        where: and(
          eq(schema.clubReads.clubId, clubId),
          eq(schema.clubReads.id, clubReadId),
        ),
      });
      if (!read) throw new NotFoundError("Club Read not found");
      if (read.status === "completed" || read.status === "cancelled")
        throw new ValidationError("Cannot schedule a closed Club Read");
      if (input.clubWorkId) {
        const work = await this.works.getWorkRow(clubId, input.clubWorkId);
        if (
          read.workSubjectType !== work.workSubjectType ||
          read.workSubjectId !== work.workSubjectId
        )
          throw new ValidationError("Schedule Work does not match Club Read");
      }
    } else if (input.clubWorkId) {
      const read = await this.db.query.clubReads.findFirst({
        where: and(
          eq(schema.clubReads.clubId, clubId),
          eq(schema.clubReads.legacyClubWorkId, input.clubWorkId),
          sql`${schema.clubReads.status} IN ('active','scheduled')`,
        ),
        orderBy: sql`CASE WHEN ${schema.clubReads.status}='active' THEN 0 ELSE 1 END`,
      });
      clubReadId = read?.id ?? null;
    }

    const id = generateId();
    const now = new Date();
    const startsAt = new Date(input.startsAt);

    await this.db.insert(schema.clubSchedules).values({
      id,
      clubId,
      clubWorkId: input.clubWorkId ?? null,
      clubReadId,
      title: input.title,
      eventKind: input.eventKind ?? "checkin",
      frequency: input.frequency,
      interval: input.interval,
      dayOfWeek: input.dayOfWeek ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      timeOfDay: input.timeOfDay,
      timezone: input.timezone,
      startsAt,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      maxOccurrences: input.maxOccurrences ?? null,
      consumption: input.consumption,
      topicTitleTemplate:
        input.topicTitleTemplate ?? "{{date}} — {{consumptionLabel}}",
      topicBodyTemplate:
        input.topicBodyTemplate ?? "Discussion for {{consumptionLabel}}.",
      topicTiming: input.topicTiming ?? "at_scheduled_time",
      hoursBefore: input.hoursBefore ?? null,
      autoCreateTopic: input.autoCreateTopic ?? true,
      status: "active",
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    await this.materializeOccurrences(id);
    await this.openDueTopics();
    return id;
  }

  async updateSchedule(
    user: AuthUser,
    clubId: string,
    scheduleId: string,
    input: {
      title?: string;
      status?: (typeof schema.clubSchedules.$inferSelect)["status"];
      endsAt?: string | null;
      maxOccurrences?: number | null;
      topicTitleTemplate?: string;
      topicBodyTemplate?: string;
      autoCreateTopic?: boolean;
    },
  ) {
    const club = await this.clubs.getClub(clubId);
    if (!(await this.clubs.canModerate(user, club))) {
      throw new ForbiddenError();
    }

    const schedule = await this.getScheduleRow(clubId, scheduleId);
    await this.db
      .update(schema.clubSchedules)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.endsAt !== undefined
          ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
          : {}),
        ...(input.maxOccurrences !== undefined
          ? { maxOccurrences: input.maxOccurrences }
          : {}),
        ...(input.topicTitleTemplate !== undefined
          ? { topicTitleTemplate: input.topicTitleTemplate }
          : {}),
        ...(input.topicBodyTemplate !== undefined
          ? { topicBodyTemplate: input.topicBodyTemplate }
          : {}),
        ...(input.autoCreateTopic !== undefined
          ? { autoCreateTopic: input.autoCreateTopic }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.clubSchedules.id, scheduleId));

    if (input.status === "active") {
      await this.materializeOccurrences(scheduleId);
    } else if (input.status === "paused" || input.status === "completed") {
      void schedule;
    }
  }

  async deleteSchedule(user: AuthUser, clubId: string, scheduleId: string) {
    const club = await this.clubs.getClub(clubId);
    if (!(await this.clubs.canModerate(user, club))) {
      throw new ForbiddenError();
    }
    await this.getScheduleRow(clubId, scheduleId);
    await this.db
      .delete(schema.clubSchedules)
      .where(eq(schema.clubSchedules.id, scheduleId));
  }

  private async getScheduleRow(clubId: string, scheduleId: string) {
    const row = await this.db.query.clubSchedules.findFirst({
      where: and(
        eq(schema.clubSchedules.id, scheduleId),
        eq(schema.clubSchedules.clubId, clubId),
      ),
    });
    if (!row) throw new NotFoundError("Schedule not found");
    return row;
  }

  async materializeOccurrences(scheduleId: string) {
    const schedule = await this.db.query.clubSchedules.findFirst({
      where: eq(schema.clubSchedules.id, scheduleId),
    });
    if (!schedule || schedule.status !== "active") return;

    const existing = await this.db
      .select({
        maxSeq: sql<number>`coalesce(max(${schema.clubScheduleOccurrences.sequenceNumber}), 0)::int`,
      })
      .from(schema.clubScheduleOccurrences)
      .where(eq(schema.clubScheduleOccurrences.scheduleId, scheduleId));
    const startSeq = (existing[0]?.maxSeq ?? 0) + 1;

    let workRef = await this.works.resolveWorkForClubWorkId(
      schedule.clubWorkId,
    );
    if (schedule.clubReadId) {
      const read = await this.db.query.clubReads.findFirst({
        where: and(
          eq(schema.clubReads.clubId, schedule.clubId),
          eq(schema.clubReads.id, schedule.clubReadId),
        ),
      });
      if (!read || read.status === "completed" || read.status === "cancelled")
        return;
      workRef = read.workSubjectId
        ? {
            workSubjectType: read.workSubjectType as WorkSubjectType,
            workSubjectId: read.workSubjectId,
          }
        : null;
    }

    const targetCount =
      schedule.frequency === "once"
        ? 1
        : Math.max(0, OCCURRENCE_HORIZON - (startSeq - 1));

    const now = new Date();
    for (let i = 0; i < targetCount; i++) {
      const sequenceNumber = startSeq + i;
      if (
        schedule.maxOccurrences !== null &&
        sequenceNumber > schedule.maxOccurrences
      ) {
        break;
      }

      const scheduledAt = this.nextOccurrenceDate(
        schedule,
        now,
        sequenceNumber,
      );
      if (schedule.endsAt && scheduledAt > schedule.endsAt) break;
      if (schedule.frequency === "once" && sequenceNumber > 1) break;

      const duplicate = await this.db.query.clubScheduleOccurrences.findFirst({
        where: and(
          eq(schema.clubScheduleOccurrences.scheduleId, scheduleId),
          eq(schema.clubScheduleOccurrences.sequenceNumber, sequenceNumber),
        ),
      });
      if (duplicate) continue;

      const consumption = this.resolveOccurrenceConsumption(
        schedule.consumption as ConsumptionTarget,
        sequenceNumber,
      );
      const consumptionLabel = formatConsumptionLabel(consumption);
      const dateLabel = scheduledAt.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
      const title = applyScheduleTemplate(schedule.topicTitleTemplate, {
        date: dateLabel,
        consumptionLabel,
        title: schedule.title,
      });
      const opensAt = this.computeOpensAt(
        scheduledAt,
        schedule.topicTiming,
        schedule.hoursBefore,
      );

      await this.db.insert(schema.clubScheduleOccurrences).values({
        id: generateId(),
        scheduleId,
        clubReadId: schedule.clubReadId,
        clubId: schedule.clubId,
        workSubjectType: workRef?.workSubjectType ?? null,
        workSubjectId: workRef?.workSubjectId ?? null,
        scheduledAt,
        opensAt,
        consumption,
        title,
        status: "upcoming",
        sequenceNumber,
      });
    }
  }

  async extendActiveSchedules() {
    const active = await this.db
      .select()
      .from(schema.clubSchedules)
      .where(eq(schema.clubSchedules.status, "active"));

    for (const schedule of active) {
      await this.materializeOccurrences(schedule.id);
    }
  }

  async openDueTopics() {
    const now = new Date();
    const due = await this.db
      .select({
        occurrence: schema.clubScheduleOccurrences,
        schedule: schema.clubSchedules,
      })
      .from(schema.clubScheduleOccurrences)
      .innerJoin(
        schema.clubSchedules,
        eq(schema.clubScheduleOccurrences.scheduleId, schema.clubSchedules.id),
      )
      .where(
        and(
          eq(schema.clubScheduleOccurrences.status, "upcoming"),
          isNull(schema.clubScheduleOccurrences.topicId),
          lte(schema.clubScheduleOccurrences.opensAt, now),
          eq(schema.clubSchedules.autoCreateTopic, true),
        ),
      );

    for (const { occurrence, schedule } of due) {
      const consumption = occurrence.consumption as ConsumptionTarget;
      const consumptionLabel = formatConsumptionLabel(consumption);
      const body = applyScheduleTemplate(schedule.topicBodyTemplate, {
        date: occurrence.scheduledAt.toLocaleDateString("en-US", {
          timeZone: "UTC",
        }),
        consumptionLabel,
        title: schedule.title,
      });

      const topicId = await this.discussion.createScheduledTopic({
        clubId: occurrence.clubId,
        clubReadId: occurrence.clubReadId,
        authorUserId: schedule.createdByUserId,
        title: occurrence.title,
        body,
        workSubjectType: occurrence.workSubjectType,
        workSubjectId: occurrence.workSubjectId,
        scheduleOccurrenceId: occurrence.id,
      });

      await this.db
        .update(schema.clubScheduleOccurrences)
        .set({
          topicId,
          status: "open",
          updatedAt: new Date(),
        })
        .where(eq(schema.clubScheduleOccurrences.id, occurrence.id));
    }
  }

  async completePastOccurrences() {
    const now = new Date();
    await this.db
      .update(schema.clubScheduleOccurrences)
      .set({ status: "completed", updatedAt: new Date() })
      .where(
        and(
          lt(schema.clubScheduleOccurrences.scheduledAt, now),
          eq(schema.clubScheduleOccurrences.status, "open"),
        ),
      );

    await this.db
      .update(schema.clubScheduleOccurrences)
      .set({ status: "completed", updatedAt: new Date() })
      .where(
        and(
          lt(schema.clubScheduleOccurrences.scheduledAt, now),
          eq(schema.clubScheduleOccurrences.status, "upcoming"),
          sql`${schema.clubScheduleOccurrences.topicId} IS NOT NULL`,
        ),
      );
  }

  async runScheduleTick() {
    await this.extendActiveSchedules();
    await this.openDueTopics();
    await this.completePastOccurrences();
  }
}
