import { and, desc, eq, sql } from "drizzle-orm";
import { mirrorReadToLegacy } from "./read-compatibility.js";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { ClubWorksService } from "./works.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import { generateId } from "../../security/crypto.js";
import {
  createClubReadSchema,
  updateClubReadSchema,
  type ClubRead,
} from "../../../shared/club-reads.js";
import { clubReadDefaultsSchema } from "../../../shared/clubs.js";

export function serializeClubRead(
  row: typeof schema.clubReads.$inferSelect,
): ClubRead {
  return {
    ...row,
    startDate: row.startDate?.toISOString() ?? null,
    targetEndDate: row.targetEndDate?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class ClubReadsService {
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly works: ClubWorksService,
  ) {}

  async list(user: AuthUser, clubId: string, before?: string) {
    await this.clubs.requireView(user, clubId);
    const rows = await this.db
      .select()
      .from(schema.clubReads)
      .where(
        and(
          eq(schema.clubReads.clubId, clubId),
          before ? sql`${schema.clubReads.id} < ${before}` : undefined,
        ),
      )
      .orderBy(desc(schema.clubReads.id))
      .limit(50);
    return {
      reads: rows.map(serializeClubRead),
      nextCursor: rows.length === 50 ? rows.at(-1)!.id : null,
    };
  }

  async get(user: AuthUser, clubId: string, readId: string) {
    await this.clubs.requireView(user, clubId);
    const row = await this.db.query.clubReads.findFirst({
      where: and(
        eq(schema.clubReads.clubId, clubId),
        eq(schema.clubReads.id, readId),
      ),
    });
    if (!row) throw new NotFoundError("Club Read not found");
    return serializeClubRead(row);
  }

  async current(user: AuthUser, clubId: string) {
    await this.clubs.requireView(user, clubId);
    const row = await this.db.query.clubReads.findFirst({
      where: and(
        eq(schema.clubReads.clubId, clubId),
        eq(schema.clubReads.status, "active"),
      ),
    });
    return row ? serializeClubRead(row) : null;
  }

  async create(user: AuthUser, clubId: string, input: unknown) {
    const body = createClubReadSchema.parse(input);
    const club = await this.clubs.requireView(user, clubId);
    if (!(await this.clubs.canModerate(user, club))) throw new ForbiddenError();
    const readDefaults = clubReadDefaultsSchema.parse(club.readDefaults);
    const targetEndDate =
      body.targetEndDate ??
      (body.startDate && readDefaults.durationDays
        ? new Date(
            new Date(body.startDate).getTime() +
              readDefaults.durationDays * 86400000,
          ).toISOString()
        : null);
    this.works.assertWorkTypeForContext(club.context, body.workSubjectType);
    if (body.workSubjectId)
      await this.works.assertWorkExists(
        body.workSubjectType,
        body.workSubjectId,
      );
    const id = generateId();
    await this.db.transaction(async (tx) => {
      // Serialize read lifecycle changes for a club, including concurrent requests.
      await tx.execute(sql`SELECT id FROM clubs WHERE id=${clubId} FOR UPDATE`);
      if (body.status === "active" || body.status === "scheduled") {
        const occupied = await tx.query.clubReads.findFirst({
          where: and(
            eq(schema.clubReads.clubId, clubId),
            eq(schema.clubReads.status, body.status),
          ),
        });
        if (occupied)
          throw new ConflictError(
            `The club already has an ${body.status} read`,
          );
      }
      const [created] = await tx
        .insert(schema.clubReads)
        .values({
          id,
          clubId,
          workSubjectType: body.workSubjectType,
          workSubjectId: body.workSubjectId ?? null,
          candidateSnapshot: body.candidateSnapshot ?? null,
          status: body.status,
          startDate: body.startDate ? new Date(body.startDate) : null,
          targetEndDate: targetEndDate ? new Date(targetEndDate) : null,
          completedAt: body.status === "completed" ? new Date() : null,
          createdBy: user.id,
        })
        .returning();
      await mirrorReadToLegacy(tx, created!, user.id);
    });
    return id;
  }

  async update(user: AuthUser, clubId: string, readId: string, input: unknown) {
    const body = updateClubReadSchema.parse(input);
    const club = await this.clubs.requireView(user, clubId);
    if (!(await this.clubs.canModerate(user, club))) throw new ForbiddenError();
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM clubs WHERE id=${clubId} FOR UPDATE`);
      const row = await tx.query.clubReads.findFirst({
        where: and(
          eq(schema.clubReads.clubId, clubId),
          eq(schema.clubReads.id, readId),
        ),
      });
      if (!row) throw new NotFoundError("Club Read not found");
      const next = body.status ?? row.status;
      const allowed = {
        scheduled: ["scheduled", "active", "cancelled"],
        active: ["active", "completed", "cancelled"],
        completed: ["completed"],
        cancelled: ["cancelled"],
      };
      if (!allowed[row.status].includes(next))
        throw new ValidationError(
          "Invalid Club Read transition; create a new occurrence for a reread",
        );
      if (next === "active" || next === "scheduled") {
        const occupied = await tx.query.clubReads.findFirst({
          where: and(
            eq(schema.clubReads.clubId, clubId),
            eq(schema.clubReads.status, next),
          ),
        });
        if (occupied && occupied.id !== readId)
          throw new ConflictError(`The club already has an ${next} read`);
      }
      const startDate =
        body.startDate === undefined
          ? row.startDate
          : body.startDate
            ? new Date(body.startDate)
            : null;
      const targetEndDate =
        body.targetEndDate === undefined
          ? row.targetEndDate
          : body.targetEndDate
            ? new Date(body.targetEndDate)
            : null;
      if (startDate && targetEndDate && targetEndDate < startDate)
        throw new ValidationError("End date must follow start date");
      await tx
        .update(schema.clubReads)
        .set({
          status: next,
          startDate,
          targetEndDate,
          completedAt:
            next === "completed"
              ? (row.completedAt ?? new Date())
              : row.completedAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.clubReads.id, readId));
      await mirrorReadToLegacy(
        tx,
        { ...row, status: next, startDate, targetEndDate },
        user.id,
      );
    });
  }
}
