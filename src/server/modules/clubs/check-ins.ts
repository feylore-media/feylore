import { eq, and, sql } from "drizzle-orm";
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
import type { ClubScheduleService } from "./schedules.js";
import type {
  ClubCheckInSummary,
  ClubScheduleOccurrence,
  ClubScheduleView,
} from "../../../shared/clubs.js";

function isCheckInTargetActive(
  occurrence: ClubScheduleOccurrence,
  now: Date,
): boolean {
  if (occurrence.status === "completed" || occurrence.status === "skipped") {
    return false;
  }
  return new Date(occurrence.opensAt) <= now;
}

function resolveCheckInOccurrences(
  view: ClubScheduleView,
  now = new Date(),
): Pick<
  ClubCheckInSummary,
  "target" | "lastCheckIn" | "nextCheckIn" | "displayOccurrenceId"
> {
  const target =
    view.current && isCheckInTargetActive(view.current, now)
      ? view.current
      : null;

  const lastCheckIn =
    view.past.find((occurrence) => occurrence.status === "completed") ??
    view.past[0] ??
    null;

  const nextCheckIn = view.upcoming[0] ?? null;

  const displayOccurrenceId = target?.id ?? lastCheckIn?.id ?? null;

  return { target, lastCheckIn, nextCheckIn, displayOccurrenceId };
}

export class ClubCheckInService {
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly schedules: ClubScheduleService,
  ) {}

  private async requireMember(user: AuthUser, clubId: string) {
    const membership = await this.clubs.getMembership(clubId, user.id);
    if (!membership) {
      throw new ForbiddenError("Club membership required");
    }
  }

  private async getMemberCount(clubId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.clubMembers)
      .where(eq(schema.clubMembers.clubId, clubId));
    return row?.count ?? 0;
  }

  private async getCheckedInCount(occurrenceId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.clubOccurrenceCheckIns)
      .where(eq(schema.clubOccurrenceCheckIns.occurrenceId, occurrenceId));
    return row?.count ?? 0;
  }

  private async viewerHasCheckedIn(
    userId: string,
    occurrenceId: string,
  ): Promise<boolean> {
    const row = await this.db.query.clubOccurrenceCheckIns.findFirst({
      where: and(
        eq(schema.clubOccurrenceCheckIns.occurrenceId, occurrenceId),
        eq(schema.clubOccurrenceCheckIns.userId, userId),
      ),
    });
    return !!row;
  }

  async getSummary(user: AuthUser, clubId: string): Promise<ClubCheckInSummary> {
    await this.clubs.requireView(user, clubId);
    const view = await this.schedules.getScheduleView(user, clubId, {
      pastLimit: 20,
      upcomingLimit: 5,
    });
    const resolved = resolveCheckInOccurrences(view);
    const memberCount = await this.getMemberCount(clubId);

    let checkedInCount = 0;
    let viewerCheckedIn = false;
    if (resolved.displayOccurrenceId) {
      checkedInCount = await this.getCheckedInCount(resolved.displayOccurrenceId);
      viewerCheckedIn = await this.viewerHasCheckedIn(
        user.id,
        resolved.displayOccurrenceId,
      );
    }

    return {
      ...resolved,
      checkedInCount,
      memberCount,
      viewerCheckedIn,
    };
  }

  private async assertActiveTarget(
    user: AuthUser,
    clubId: string,
    occurrenceId: string,
  ) {
    const summary = await this.getSummary(user, clubId);
    if (!summary.target || summary.target.id !== occurrenceId) {
      throw new ValidationError("Check-in is not available for this occurrence");
    }
    return summary.target;
  }

  async checkIn(
    user: AuthUser,
    clubId: string,
    occurrenceId: string,
  ): Promise<ClubCheckInSummary> {
    await this.requireMember(user, clubId);
    await this.assertActiveTarget(user, clubId, occurrenceId);

    const occurrence = await this.db.query.clubScheduleOccurrences.findFirst({
      where: and(
        eq(schema.clubScheduleOccurrences.id, occurrenceId),
        eq(schema.clubScheduleOccurrences.clubId, clubId),
      ),
    });
    if (!occurrence) {
      throw new NotFoundError("Schedule occurrence not found");
    }

    await this.db
      .insert(schema.clubOccurrenceCheckIns)
      .values({
        id: generateId(),
        clubId,
        occurrenceId,
        userId: user.id,
      })
      .onConflictDoNothing();

    return this.getSummary(user, clubId);
  }

  async removeCheckIn(
    user: AuthUser,
    clubId: string,
    occurrenceId: string,
  ): Promise<ClubCheckInSummary> {
    await this.requireMember(user, clubId);
    await this.assertActiveTarget(user, clubId, occurrenceId);

    await this.db
      .delete(schema.clubOccurrenceCheckIns)
      .where(
        and(
          eq(schema.clubOccurrenceCheckIns.occurrenceId, occurrenceId),
          eq(schema.clubOccurrenceCheckIns.userId, user.id),
        ),
      );

    return this.getSummary(user, clubId);
  }
}
