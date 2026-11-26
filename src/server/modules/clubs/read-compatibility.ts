import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import type { ClubWorkStatus } from "../../../shared/clubs.js";
import { ConflictError } from "../../../shared/errors.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Called inside the legacy Work mutation transaction, with the club row locked. */
export async function mirrorLegacyWork(
  tx: Transaction,
  clubId: string,
  workId: string,
  status: ClubWorkStatus,
  userId: string,
) {
  const work = await tx.query.clubWorks.findFirst({
    where: and(
      eq(schema.clubWorks.clubId, clubId),
      eq(schema.clubWorks.id, workId),
    ),
  });
  if (!work) return;
  const previous = await tx.query.clubReads.findFirst({
    where: and(
      eq(schema.clubReads.clubId, clubId),
      eq(schema.clubReads.legacyClubWorkId, workId),
    ),
    orderBy: [
      sql`CASE WHEN ${schema.clubReads.status}='active' THEN 0 WHEN ${schema.clubReads.status}='scheduled' THEN 1 ELSE 2 END`,
      desc(schema.clubReads.createdAt),
      desc(schema.clubReads.id),
    ],
  });
  const now = new Date();
  if (status === "associated") {
    await tx
      .update(schema.clubReads)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(schema.clubReads.clubId, clubId),
          eq(schema.clubReads.legacyClubWorkId, workId),
          sql`${schema.clubReads.status} IN ('active','scheduled')`,
        ),
      );
    return;
  }
  const next =
    status === "current"
      ? "active"
      : status === "queued"
        ? "scheduled"
        : "completed";
  if (previous && previous.status === next) return;
  if (
    previous &&
    (previous.status === "active" || previous.status === "scheduled")
  ) {
    if (next === "scheduled") {
      const occupied = await tx.query.clubReads.findFirst({
        where: and(
          eq(schema.clubReads.clubId, clubId),
          eq(schema.clubReads.status, "scheduled"),
        ),
      });
      if (occupied && occupied.id !== previous.id)
        throw new ConflictError("The club already has an upcoming read");
    }
    await tx
      .update(schema.clubReads)
      .set({
        status: next,
        completedAt: next === "completed" ? now : null,
        updatedAt: now,
      })
      .where(eq(schema.clubReads.id, previous.id));
    return;
  }
  if (next === "scheduled") {
    const occupied = await tx.query.clubReads.findFirst({
      where: and(
        eq(schema.clubReads.clubId, clubId),
        eq(schema.clubReads.status, "scheduled"),
      ),
    });
    if (occupied) return; // Additional legacy queue items remain Work associations.
  }
  // Completed/cancelled occurrences are immutable history; promotion creates a reread.
  await tx
    .insert(schema.clubReads)
    .values({
      id: generateId(),
      clubId,
      workSubjectType: work.workSubjectType,
      workSubjectId: work.workSubjectId,
      status: next,
      legacyClubWorkId: workId,
      completedAt: next === "completed" ? now : null,
      createdBy: userId,
    });
}

/** Preserve old Current Work consumers while the new read routes are adopted. */
export async function mirrorReadToLegacy(
  tx: Transaction,
  read: typeof schema.clubReads.$inferSelect,
  userId: string,
) {
  const now = new Date();
  let legacyId = read.legacyClubWorkId;
  if (read.status === "active") {
    await tx
      .update(schema.clubWorks)
      .set({ status: "associated", updatedAt: now })
      .where(
        and(
          eq(schema.clubWorks.clubId, read.clubId),
          eq(schema.clubWorks.status, "current"),
        ),
      );
  }
  if (
    read.workSubjectId &&
    (read.status === "active" || read.status === "scheduled")
  ) {
    const existing = await tx.query.clubWorks.findFirst({
      where: and(
        eq(schema.clubWorks.clubId, read.clubId),
        eq(schema.clubWorks.workSubjectType, read.workSubjectType),
        eq(schema.clubWorks.workSubjectId, read.workSubjectId),
      ),
    });
    legacyId = existing?.id ?? generateId();
    if (!existing)
      await tx
        .insert(schema.clubWorks)
        .values({
          id: legacyId,
          clubId: read.clubId,
          workSubjectType: read.workSubjectType,
          workSubjectId: read.workSubjectId,
          status: read.status === "active" ? "current" : "queued",
          addedByUserId: userId,
        });
    else if (read.status === "active" || existing.status !== "current")
      await tx
        .update(schema.clubWorks)
        .set({
          status: read.status === "active" ? "current" : "queued",
          updatedAt: now,
        })
        .where(eq(schema.clubWorks.id, existing.id));
    await tx
      .update(schema.clubReads)
      .set({ legacyClubWorkId: legacyId })
      .where(eq(schema.clubReads.id, read.id));
  } else if (
    legacyId &&
    (read.status === "completed" || read.status === "cancelled")
  ) {
    const ongoing = await tx.query.clubReads.findFirst({
      where: and(
        eq(schema.clubReads.clubId, read.clubId),
        eq(schema.clubReads.legacyClubWorkId, legacyId),
        sql`${schema.clubReads.status} IN ('active','scheduled')`,
        sql`${schema.clubReads.id} <> ${read.id}`,
      ),
    });
    if (!ongoing || ongoing.status === "scheduled")
      await tx
        .update(schema.clubWorks)
        .set({
          status: ongoing
            ? "queued"
            : read.status === "completed"
              ? "completed"
              : "associated",
          updatedAt: now,
        })
        .where(eq(schema.clubWorks.id, legacyId));
  }
}
