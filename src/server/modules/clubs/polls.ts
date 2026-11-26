import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { ClubWorksService } from "./works.js";
import type { ClubPollDiscoveryService } from "./poll-discovery.js";
import { pickPollWinner } from "../../../shared/club-poll-discovery.js";
import type {
  ClubPollDiscoverySource,
  ClubPollOptionPublic,
  ClubPollPublic,
  ClubPollStatus,
} from "../../../shared/clubs.js";
import type { WorkSubjectType } from "../../../shared/subject.js";

export class ClubPollsService {
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly clubWorks: ClubWorksService,
    private readonly discovery: ClubPollDiscoveryService,
  ) {}

  private async requireModerate(user: AuthUser, clubId: string) {
    const club = await this.clubs.requireView(user, clubId);
    if (!(await this.clubs.canModerate(user, club))) {
      throw new ForbiddenError("Moderator access required");
    }
    return club;
  }

  private async requireParticipate(user: AuthUser, clubId: string) {
    const club = await this.clubs.requireView(user, clubId);
    const membership = await this.clubs.getMembership(clubId, user.id);
    if (!membership) {
      throw new ForbiddenError("Club membership required");
    }
    return { club, membership };
  }

  private async getPollRow(clubId: string, pollId: string) {
    const poll = await this.db.query.clubPolls.findFirst({
      where: and(
        eq(schema.clubPolls.id, pollId),
        eq(schema.clubPolls.clubId, clubId),
      ),
    });
    if (!poll) throw new NotFoundError("Poll not found");
    return poll;
  }

  async listForModerator(
    user: AuthUser,
    clubId: string,
  ): Promise<ClubPollPublic[]> {
    await this.requireModerate(user, clubId);
    const polls = await this.db
      .select()
      .from(schema.clubPolls)
      .where(eq(schema.clubPolls.clubId, clubId))
      .orderBy(sql`${schema.clubPolls.createdAt} DESC`);

    const result: ClubPollPublic[] = [];
    for (const poll of polls) {
      result.push(await this.toPublicPoll(poll, user.id));
    }
    return result;
  }

  async getActive(
    user: AuthUser,
    clubId: string,
  ): Promise<ClubPollPublic | null> {
    await this.clubs.requireView(user, clubId);
    const poll = await this.db.query.clubPolls.findFirst({
      where: and(
        eq(schema.clubPolls.clubId, clubId),
        eq(schema.clubPolls.status, "active"),
      ),
    });
    if (!poll) return null;
    return this.toPublicPoll(poll, user.id);
  }

  async getPoll(
    user: AuthUser,
    clubId: string,
    pollId: string,
  ): Promise<ClubPollPublic> {
    await this.clubs.requireView(user, clubId);
    const poll = await this.getPollRow(clubId, pollId);
    return this.toPublicPoll(poll, user.id);
  }

  async createDraft(
    user: AuthUser,
    clubId: string,
    input: { title: string },
  ): Promise<string> {
    await this.requireModerate(user, clubId);
    const id = generateId();
    const now = new Date();
    await this.db.insert(schema.clubPolls).values({
      id,
      clubId,
      title: input.title,
      status: "draft",
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async discoverCandidates(user: AuthUser, clubId: string, pollId: string) {
    const club = await this.requireModerate(user, clubId);
    const poll = await this.getPollRow(clubId, pollId);
    if (poll.status !== "draft") {
      throw new ValidationError(
        "Only draft polls can be updated with discovery",
      );
    }

    const candidates = await this.discovery.discoverForClub(
      clubId,
      club.context,
    );

    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.clubPollOptions)
        .where(
          and(
            eq(schema.clubPollOptions.pollId, pollId),
            inArray(schema.clubPollOptions.discoverySource, [
              "tbr",
              "club_queued",
              "library",
            ]),
          ),
        );

      const manualOptions = await tx
        .select()
        .from(schema.clubPollOptions)
        .where(
          and(
            eq(schema.clubPollOptions.pollId, pollId),
            eq(schema.clubPollOptions.discoverySource, "manual"),
            isNull(schema.clubPollOptions.removedAt),
          ),
        );
      const manualKeys = new Set(
        manualOptions.map(
          (option) => `${option.workSubjectType}:${option.workSubjectId}`,
        ),
      );

      let sortOrder = manualOptions.length;
      for (const candidate of candidates) {
        const key = `${candidate.workSubjectType}:${candidate.workSubjectId}`;
        if (manualKeys.has(key)) continue;

        await tx.insert(schema.clubPollOptions).values({
          id: generateId(),
          pollId,
          workSubjectType: candidate.workSubjectType,
          workSubjectId: candidate.workSubjectId,
          discoverySource: candidate.source,
          tbrMemberCount: candidate.tbrMemberCount ?? null,
          sortOrder: sortOrder++,
        });
      }

      await tx
        .update(schema.clubPolls)
        .set({ updatedAt: new Date() })
        .where(eq(schema.clubPolls.id, pollId));
    });
  }

  async addOption(
    user: AuthUser,
    clubId: string,
    pollId: string,
    input: { workSubjectType: WorkSubjectType; workSubjectId: string },
  ): Promise<string> {
    const club = await this.requireModerate(user, clubId);
    const poll = await this.getPollRow(clubId, pollId);
    if (poll.status !== "draft") {
      throw new ValidationError("Only draft polls can be edited");
    }

    this.clubWorks.assertWorkTypeForContext(
      club.context,
      input.workSubjectType,
    );
    await this.clubWorks.assertWorkExists(
      input.workSubjectType,
      input.workSubjectId,
    );

    const existing = await this.db.query.clubPollOptions.findFirst({
      where: and(
        eq(schema.clubPollOptions.pollId, pollId),
        eq(schema.clubPollOptions.workSubjectType, input.workSubjectType),
        eq(schema.clubPollOptions.workSubjectId, input.workSubjectId),
        isNull(schema.clubPollOptions.removedAt),
      ),
    });
    if (existing) {
      throw new ValidationError("This work is already a poll option");
    }

    const maxSort = await this.db
      .select({ sortOrder: schema.clubPollOptions.sortOrder })
      .from(schema.clubPollOptions)
      .where(eq(schema.clubPollOptions.pollId, pollId));
    const nextSort =
      maxSort.length > 0
        ? Math.max(...maxSort.map((row) => row.sortOrder)) + 1
        : 0;

    const id = generateId();
    await this.db.insert(schema.clubPollOptions).values({
      id,
      pollId,
      workSubjectType: input.workSubjectType,
      workSubjectId: input.workSubjectId,
      discoverySource: "manual",
      sortOrder: nextSort,
    });
    return id;
  }

  async removeOption(
    user: AuthUser,
    clubId: string,
    pollId: string,
    optionId: string,
  ) {
    await this.requireModerate(user, clubId);
    const poll = await this.getPollRow(clubId, pollId);
    if (poll.status !== "draft") {
      throw new ValidationError("Only draft polls can be edited");
    }

    const option = await this.db.query.clubPollOptions.findFirst({
      where: and(
        eq(schema.clubPollOptions.id, optionId),
        eq(schema.clubPollOptions.pollId, pollId),
      ),
    });
    if (!option) throw new NotFoundError("Poll option not found");

    await this.db
      .update(schema.clubPollOptions)
      .set({ removedAt: new Date() })
      .where(eq(schema.clubPollOptions.id, optionId));
  }

  async publish(user: AuthUser, clubId: string, pollId: string) {
    await this.requireModerate(user, clubId);
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM clubs WHERE id=${clubId} FOR UPDATE`);
      const poll = await tx.query.clubPolls.findFirst({
        where: and(
          eq(schema.clubPolls.id, pollId),
          eq(schema.clubPolls.clubId, clubId),
        ),
      });
      if (!poll) throw new NotFoundError("Poll not found");
      if (poll.status !== "draft")
        throw new ValidationError("Only draft polls can be published");
      const newRound = await tx.query.clubSelectionRounds.findFirst({
        where: and(
          eq(schema.clubSelectionRounds.clubId, clubId),
          isNull(schema.clubSelectionRounds.legacyPollId),
        ),
      });
      if (newRound)
        throw new ConflictError(
          "A Selection Round now governs this club's next read",
        );
      const active = await tx.query.clubPolls.findFirst({
        where: and(
          eq(schema.clubPolls.clubId, clubId),
          eq(schema.clubPolls.status, "active"),
        ),
      });
      if (active) throw new ValidationError("Another poll is already active");
      const options = await tx
        .select()
        .from(schema.clubPollOptions)
        .where(
          and(
            eq(schema.clubPollOptions.pollId, pollId),
            isNull(schema.clubPollOptions.removedAt),
          ),
        );
      if (options.length < 2)
        throw new ValidationError(
          "At least two options are required to publish",
        );
      const now = new Date();
      await tx
        .update(schema.clubPolls)
        .set({ status: "active", publishedAt: now, updatedAt: now })
        .where(eq(schema.clubPolls.id, pollId));
    });
  }

  async vote(user: AuthUser, clubId: string, pollId: string, optionId: string) {
    await this.requireParticipate(user, clubId);
    const poll = await this.getPollRow(clubId, pollId);
    if (poll.status !== "active") {
      throw new ValidationError("Poll is not open for voting");
    }

    const option = await this.db.query.clubPollOptions.findFirst({
      where: and(
        eq(schema.clubPollOptions.id, optionId),
        eq(schema.clubPollOptions.pollId, pollId),
        isNull(schema.clubPollOptions.removedAt),
      ),
    });
    if (!option) throw new NotFoundError("Poll option not found");

    await this.db
      .insert(schema.clubPollVotes)
      .values({
        pollId,
        optionId,
        userId: user.id,
      })
      .onConflictDoUpdate({
        target: [schema.clubPollVotes.pollId, schema.clubPollVotes.userId],
        set: { optionId, createdAt: new Date() },
      });
  }

  async close(user: AuthUser, clubId: string, pollId: string) {
    await this.requireModerate(user, clubId);
    const poll = await this.getPollRow(clubId, pollId);
    if (poll.status !== "active") {
      throw new ValidationError("Only active polls can be closed");
    }

    const publicPoll = await this.toPublicPoll(poll, user.id);
    const winner = pickPollWinner(
      publicPoll.options
        .filter((option) => !option.removed)
        .map((option) => ({
          id: option.id,
          voteCount: option.voteCount,
          sortOrder: option.sortOrder,
        })),
    );

    const now = new Date();
    await this.db
      .update(schema.clubPolls)
      .set({
        status: "closed",
        closedAt: now,
        winningOptionId: winner?.id ?? null,
        updatedAt: now,
      })
      .where(eq(schema.clubPolls.id, pollId));
  }

  async applyResult(user: AuthUser, clubId: string, pollId: string) {
    await this.requireModerate(user, clubId);
    const poll = await this.getPollRow(clubId, pollId);
    if (poll.status !== "closed") {
      throw new ValidationError(
        "Poll must be closed before applying the result",
      );
    }
    await this.assertNoNewSelectionRound(clubId);
    if (!poll.winningOptionId) {
      throw new ValidationError("Poll has no winning option");
    }

    const option = await this.db.query.clubPollOptions.findFirst({
      where: eq(schema.clubPollOptions.id, poll.winningOptionId),
    });
    if (!option) throw new NotFoundError("Winning option not found");

    await this.clubWorks.setCurrentWorkBySubject(
      user,
      clubId,
      option.workSubjectType as WorkSubjectType,
      option.workSubjectId,
    );

    const now = new Date();
    await this.db
      .update(schema.clubPolls)
      .set({
        status: "applied",
        appliedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.clubPolls.id, pollId));
  }

  private async assertNoNewSelectionRound(clubId: string) {
    const round = await this.db.query.clubSelectionRounds.findFirst({
      where: and(
        eq(schema.clubSelectionRounds.clubId, clubId),
        isNull(schema.clubSelectionRounds.legacyPollId),
      ),
    });
    if (round)
      throw new ConflictError(
        "A Selection Round now governs this club's next read",
      );
  }

  private async loadActiveOptions(pollId: string) {
    return this.db
      .select()
      .from(schema.clubPollOptions)
      .where(
        and(
          eq(schema.clubPollOptions.pollId, pollId),
          isNull(schema.clubPollOptions.removedAt),
        ),
      );
  }

  private async toPublicPoll(
    poll: typeof schema.clubPolls.$inferSelect,
    viewerUserId: string,
  ): Promise<ClubPollPublic> {
    const options = await this.db
      .select()
      .from(schema.clubPollOptions)
      .where(eq(schema.clubPollOptions.pollId, poll.id))
      .orderBy(schema.clubPollOptions.sortOrder);

    const optionIds = options.map((option) => option.id);
    const voteCounts = new Map<string, number>();
    const viewerVote = await this.db.query.clubPollVotes.findFirst({
      where: and(
        eq(schema.clubPollVotes.pollId, poll.id),
        eq(schema.clubPollVotes.userId, viewerUserId),
      ),
    });

    if (optionIds.length > 0) {
      const voteRows = await this.db
        .select({
          optionId: schema.clubPollVotes.optionId,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.clubPollVotes)
        .where(eq(schema.clubPollVotes.pollId, poll.id))
        .groupBy(schema.clubPollVotes.optionId);

      for (const row of voteRows) {
        voteCounts.set(row.optionId, row.count);
      }
    }

    const publicOptions: ClubPollOptionPublic[] = [];
    for (const option of options) {
      let title = option.workSubjectId;
      let coverFileId: string | null = null;
      let href = "/";
      try {
        const resolved = await this.clubWorks.resolveWorkSummary(
          option.workSubjectType as WorkSubjectType,
          option.workSubjectId,
        );
        title = resolved.title;
        coverFileId = resolved.coverFileId;
        href = resolved.href;
      } catch {
        // keep fallback title
      }

      publicOptions.push({
        id: option.id,
        workSubjectType: option.workSubjectType as WorkSubjectType,
        workSubjectId: option.workSubjectId,
        title,
        coverFileId,
        href,
        source: option.discoverySource as ClubPollDiscoverySource,
        tbrMemberCount: option.tbrMemberCount,
        voteCount: voteCounts.get(option.id) ?? 0,
        sortOrder: option.sortOrder,
        removed: !!option.removedAt,
        viewerVoted: viewerVote?.optionId === option.id,
      });
    }

    const totalVotes = [...voteCounts.values()].reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      id: poll.id,
      clubId: poll.clubId,
      title: poll.title,
      status: poll.status as ClubPollStatus,
      options: publicOptions,
      totalVotes,
      viewerVoteOptionId: viewerVote?.optionId ?? null,
      winningOptionId: poll.winningOptionId,
      createdAt: poll.createdAt.toISOString(),
      publishedAt: poll.publishedAt?.toISOString() ?? null,
      closedAt: poll.closedAt?.toISOString() ?? null,
      appliedAt: poll.appliedAt?.toISOString() ?? null,
    };
  }
}
