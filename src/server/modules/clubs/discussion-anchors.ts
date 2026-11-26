import { safeLocationLabel } from "./safe-projection.js";
import { eq, and, asc, isNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { ClubCheckInService } from "./check-ins.js";
import type { ClubDiscussionService } from "./discussion.js";
import {
  formatConsumptionLabel,
  type ClubDiscussionAnchor,
  type ClubDiscussionAnchorEmphasis,
  type ClubDiscussionAnchorsAll,
  type ClubGeneralDiscussion,
  type ConsumptionTarget,
} from "../../../shared/clubs.js";

function topicMessageCount(replyCount: number): number {
  return replyCount + 1;
}

export function prioritizeDiscussionAnchors(
  anchors: ClubDiscussionAnchor[],
  currentOccurrenceId: string | null,
  lastCheckInOccurrenceId: string | null,
  limit: number,
): ClubDiscussionAnchor[] {
  const byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const picked = new Set<string>();
  const result: ClubDiscussionAnchor[] = [];

  const add = (
    occurrenceId: string | null,
    emphasis: ClubDiscussionAnchorEmphasis,
  ) => {
    if (!occurrenceId || picked.has(occurrenceId)) return;
    const anchor = byId.get(occurrenceId);
    if (!anchor) return;
    picked.add(occurrenceId);
    result.push({ ...anchor, emphasis });
  };

  add(currentOccurrenceId, "current");
  add(lastCheckInOccurrenceId, "last_check_in");

  const remaining = anchors
    .filter((anchor) => !picked.has(anchor.id))
    .filter((anchor) => anchor.messageCount > 0 && anchor.lastActivityAt)
    .sort((a, b) =>
      (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
    );

  for (const anchor of remaining) {
    if (result.length >= limit) break;
    add(anchor.id, "recent");
  }

  return result.slice(0, limit);
}

export class ClubDiscussionAnchorsService {
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly checkIns: ClubCheckInService,
    private readonly discussion: ClubDiscussionService,
  ) {}

  private async loadOccurrenceAnchors(
    clubId: string,
  ): Promise<ClubDiscussionAnchor[]> {
    const rows = await this.db
      .select()
      .from(schema.clubScheduleOccurrences)
      .where(eq(schema.clubScheduleOccurrences.clubId, clubId))
      .orderBy(asc(schema.clubScheduleOccurrences.scheduledAt));

    const topics = await this.db
      .select()
      .from(schema.clubTopics)
      .where(eq(schema.clubTopics.clubId, clubId));

    const topicByOccurrenceId = new Map<string, (typeof topics)[number]>();
    for (const topic of topics) {
      if (topic.scheduleOccurrenceId) {
        topicByOccurrenceId.set(topic.scheduleOccurrenceId, topic);
      }
    }

    return rows.map((row) => {
      const consumption = row.consumption as ConsumptionTarget;
      const linkedTopic =
        topicByOccurrenceId.get(row.id) ??
        (row.topicId
          ? (topics.find((topic) => topic.id === row.topicId) ?? null)
          : null);

      return {
        id: row.id,
        occurrenceId: row.id,
        consumption:
          consumption.kind === "custom"
            ? { kind: "custom", label: "Unordered location" }
            : { ...consumption, label: undefined },
        label: safeLocationLabel(null, consumption),
        topicId: linkedTopic?.id ?? row.topicId ?? null,
        messageCount: linkedTopic
          ? topicMessageCount(linkedTopic.replyCount)
          : 0,
        lastActivityAt: linkedTopic
          ? linkedTopic.lastActivityAt.toISOString()
          : null,
        emphasis: null,
      };
    });
  }

  async listDefault(
    user: AuthUser,
    clubId: string,
    limit = 5,
  ): Promise<ClubDiscussionAnchor[]> {
    await this.clubs.requireView(user, clubId);
    const checkIn = await this.checkIns.getSummary(user, clubId);
    const anchors = await this.loadOccurrenceAnchors(clubId);
    return prioritizeDiscussionAnchors(
      anchors,
      checkIn.target?.id ?? null,
      checkIn.lastCheckIn?.id ?? null,
      limit,
    );
  }

  async listAll(
    user: AuthUser,
    clubId: string,
  ): Promise<ClubDiscussionAnchorsAll> {
    await this.clubs.requireView(user, clubId);
    const anchors = await this.loadOccurrenceAnchors(clubId);

    const topics = await this.db
      .select()
      .from(schema.clubTopics)
      .where(
        and(
          eq(schema.clubTopics.clubId, clubId),
          isNull(schema.clubTopics.scheduleOccurrenceId),
          isNull(schema.clubTopics.clubReadId),
        ),
      );

    const general: ClubGeneralDiscussion[] = topics.map((topic) => ({
      topicId: topic.id,
      title: topic.title,
      kind: topic.kind,
      messageCount: topicMessageCount(topic.replyCount),
      lastActivityAt: topic.lastActivityAt.toISOString(),
      pinned: topic.pinned,
    }));

    general.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastActivityAt.localeCompare(a.lastActivityAt);
    });

    return { anchors, general };
  }

  async ensureOccurrenceDiscussion(
    user: AuthUser,
    clubId: string,
    occurrenceId: string,
  ): Promise<{ topicId: string }> {
    const membership = await this.clubs.getMembership(clubId, user.id);
    if (!membership) {
      throw new ForbiddenError("Club membership required");
    }

    const occurrenceRow = await this.db.query.clubScheduleOccurrences.findFirst(
      {
        where: and(
          eq(schema.clubScheduleOccurrences.id, occurrenceId),
          eq(schema.clubScheduleOccurrences.clubId, clubId),
        ),
      },
    );
    if (!occurrenceRow) {
      throw new NotFoundError("Schedule occurrence not found");
    }

    if (occurrenceRow.topicId) {
      return { topicId: occurrenceRow.topicId };
    }

    const existingTopic = await this.db.query.clubTopics.findFirst({
      where: and(
        eq(schema.clubTopics.clubId, clubId),
        eq(schema.clubTopics.scheduleOccurrenceId, occurrenceId),
      ),
    });
    if (existingTopic) {
      if (!occurrenceRow.topicId) {
        await this.db
          .update(schema.clubScheduleOccurrences)
          .set({ topicId: existingTopic.id, updatedAt: new Date() })
          .where(eq(schema.clubScheduleOccurrences.id, occurrenceId));
      }
      return { topicId: existingTopic.id };
    }

    const consumption = occurrenceRow.consumption as ConsumptionTarget;
    const consumptionLabel = formatConsumptionLabel(consumption);
    const topicId = await this.discussion.createScheduledTopic({
      clubId,
      authorUserId: user.id,
      title: occurrenceRow.title,
      body: `Discussion for ${consumptionLabel}.`,
      workSubjectType: occurrenceRow.workSubjectType,
      workSubjectId: occurrenceRow.workSubjectId,
      scheduleOccurrenceId: occurrenceId,
    });

    await this.db
      .update(schema.clubScheduleOccurrences)
      .set({
        topicId,
        status:
          occurrenceRow.status === "upcoming" ? "open" : occurrenceRow.status,
        updatedAt: new Date(),
      })
      .where(eq(schema.clubScheduleOccurrences.id, occurrenceId));

    return { topicId };
  }
}
