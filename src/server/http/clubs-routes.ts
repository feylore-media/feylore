import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  createClubSchema,
  updateClubSchema,
  createClubInviteSchema,
  updateClubMemberRoleSchema,
  createClubTopicSchema,
  updateClubTopicSchema,
  createClubPostSchema,
  setClubReactionSchema,
  createClubWorkSchema,
  updateClubWorkSchema,
  createClubScheduleSchema,
  updateClubScheduleSchema,
  createClubPollSchema,
  addClubPollOptionSchema,
  voteClubPollSchema,
  createClubQuoteSchema,
} from "../../shared/clubs.js";

export async function registerClubsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.get("/api/v1/upcoming", async (request) => {
    const user = requireAuth(request);
    return { data: await ctx.calendar.home(user) };
  });
  app.get("/api/v1/clubs/:id/reads", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const { cursor } = request.query as { cursor?: string };
    return { data: await ctx.clubReads.list(user, id, cursor) };
  });
  app.get("/api/v1/clubs/:id/reads/current", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    return {
      data: await ctx.clubReads.current(
        user,
        (request.params as { id: string }).id,
      ),
    };
  });
  app.get("/api/v1/clubs/:id/reads/:readId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id, readId } = request.params as { id: string; readId: string };
    return { data: await ctx.clubReads.get(user, id, readId) };
  });
  app.post("/api/v1/clubs/:id/reads", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const id = await ctx.clubReads.create(
      user,
      (request.params as { id: string }).id,
      request.body,
    );
    reply.status(201);
    return { data: { id } };
  });
  app.patch("/api/v1/clubs/:id/reads/:readId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, readId } = request.params as { id: string; readId: string };
    await ctx.clubReads.update(user, id, readId, request.body);
    return { data: { ok: true } };
  });

  app.get("/api/v1/clubs/:id/selection-rounds/experience", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const query = z
      .object({
        roundId: z.string().uuid().optional(),
        cursor: z.string().uuid().optional(),
      })
      .parse(request.query);
    return {
      data: await ctx.clubSelectionExperience.experience(
        user,
        id,
        query.roundId,
        query.cursor,
      ),
    };
  });
  app.get("/api/v1/clubs/:id/selection-candidates/search", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const { q } = z
      .object({ q: z.string().trim().min(2).max(200) })
      .parse(request.query);
    return { data: await ctx.clubSelectionExperience.search(user, id, q) };
  });
  app.get(
    "/api/v1/clubs/:id/selection-rounds/:roundId/candidates/:candidateId",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
      const { id, roundId, candidateId } = z
        .object({
          id: z.string().uuid(),
          roundId: z.string().uuid(),
          candidateId: z.string().uuid(),
        })
        .parse(request.params);
      return {
        data: await ctx.clubSelectionExperience.candidate(
          user,
          id,
          roundId,
          candidateId,
        ),
      };
    },
  );
  app.get(
    "/api/v1/clubs/:id/selection-rounds/:roundId/pool",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
      const { id, roundId } = request.params as { id: string; roundId: string };
      const query = z
        .object({ cursor: z.string().uuid().optional() })
        .parse(request.query);
      return {
        data: await ctx.clubSelectionExperience.candidates(
          user,
          id,
          roundId,
          query.cursor,
          true,
        ),
      };
    },
  );
  app.get(
    "/api/v1/clubs/:id/selection-rounds/:roundId/audit",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
      const { id, roundId } = request.params as { id: string; roundId: string };
      return {
        data: await ctx.clubSelectionExperience.audit(user, id, roundId),
      };
    },
  );
  app.post(
    "/api/v1/clubs/:id/selection-rounds/:roundId/close-voting",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, roundId } = request.params as { id: string; roundId: string };
      await ctx.clubSelection.closeVoting(user, id, roundId);
      return { data: { ok: true } };
    },
  );
  app.get("/api/v1/clubs/:id/selection-rounds", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    return {
      data: await ctx.clubSelection.list(
        user,
        (request.params as { id: string }).id,
      ),
    };
  });
  app.get("/api/v1/clubs/:id/selection-rounds/current", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    return {
      data: await ctx.clubSelection.current(
        user,
        (request.params as { id: string }).id,
      ),
    };
  });
  app.get("/api/v1/clubs/:id/selection-rounds/:roundId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id, roundId } = request.params as { id: string; roundId: string };
    return { data: await ctx.clubSelection.get(user, id, roundId) };
  });
  app.post("/api/v1/clubs/:id/selection-rounds", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const id = await ctx.clubSelection.create(
      user,
      (request.params as { id: string }).id,
      request.body,
    );
    reply.status(201);
    return { data: { id } };
  });
  app.patch("/api/v1/clubs/:id/selection-rounds/:roundId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, roundId } = request.params as { id: string; roundId: string };
    await ctx.clubSelection.configure(user, id, roundId, request.body);
    return { data: { ok: true } };
  });
  app.post(
    "/api/v1/clubs/:id/selection-rounds/:roundId/nominations",
    async (request, reply) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, roundId } = request.params as { id: string; roundId: string };
      const candidateId = await ctx.clubSelection.nominate(
        user,
        id,
        roundId,
        request.body,
      );
      reply.status(201);
      return { data: { id: candidateId } };
    },
  );
  app.post(
    "/api/v1/clubs/:id/selection-rounds/:roundId/ballot",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, roundId } = request.params as { id: string; roundId: string };
      await ctx.clubSelection.ballot(user, id, roundId, request.body);
      return { data: { ok: true } };
    },
  );
  app.post(
    "/api/v1/clubs/:id/selection-rounds/:roundId/transition",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, roundId } = request.params as { id: string; roundId: string };
      const { phase } = z.object({ phase: z.string() }).parse(request.body);
      await ctx.clubSelection.transition(user, id, roundId, phase);
      return { data: { ok: true } };
    },
  );
  app.post(
    "/api/v1/clubs/:id/selection-rounds/:roundId/shelf",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, roundId } = request.params as { id: string; roundId: string };
      const { shelfId } = z
        .object({ shelfId: z.string().uuid() })
        .parse(request.body);
      await ctx.clubSelection.importShelf(user, id, roundId, shelfId);
      return { data: { ok: true } };
    },
  );
  app.post(
    "/api/v1/clubs/:id/selection-rounds/:roundId/finalize",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, roundId } = request.params as { id: string; roundId: string };
      return {
        data: await ctx.clubSelection.finalize(
          user,
          id,
          roundId,
          request.body ?? {},
        ),
      };
    },
  );

  app.post("/api/v1/clubs/:id/reads/:readId/check-in", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, readId } = request.params as { id: string; readId: string };
    const body = z.object({ checkedIn: z.boolean() }).parse(request.body);
    return {
      data: await ctx.clubExperience.setCheckIn(
        user,
        id,
        readId,
        body.checkedIn,
      ),
    };
  });
  app.get("/api/v1/clubs/:id/library", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const { cursor } = z
      .object({ cursor: z.string().uuid().optional() })
      .parse(request.query);
    return { data: await ctx.clubExperience.library(user, id, cursor) };
  });
  app.get("/api/v1/clubs/:id/reads/:readId/experience", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id, readId } = request.params as { id: string; readId: string };
    return { data: await ctx.clubExperience.detail(user, id, readId) };
  });
  app.get("/api/v1/clubs", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const clubs = await ctx.clubs.listAccessible(user);
    return { data: clubs };
  });

  app.post("/api/v1/clubs", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const body = createClubSchema.parse(request.body);
    const id = await ctx.clubs.create(user, body);
    reply.status(201);
    return { data: { id } };
  });

  app.get("/api/v1/clubs/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const detail = await ctx.clubs.getDetailForUser(user, id);
    return { data: detail };
  });

  app.patch("/api/v1/clubs/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    const body = updateClubSchema.parse(request.body);
    await ctx.clubs.update(user, id, body);
    return { data: { ok: true } };
  });

  app.patch("/api/v1/clubs/:id/defaults", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    await ctx.clubs.updateDefaults(user, id, request.body);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/clubs/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    await ctx.clubs.delete(user, id);
    return { data: { ok: true } };
  });

  app.post("/api/v1/clubs/:id/join", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    await ctx.clubs.join(user, id);
    return { data: { ok: true } };
  });

  app.post("/api/v1/clubs/:id/leave", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    await ctx.clubs.leave(user, id);
    return { data: { ok: true } };
  });

  app.get("/api/v1/clubs/:id/members", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    await ctx.clubs.requireView(user, id);
    const members = await ctx.clubs.listMembers(id);
    return { data: members };
  });

  app.get("/api/v1/clubs/:id/members/experience", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    return { data: await ctx.clubPresence.members(user, id) };
  });

  app.get("/api/v1/clubs/:id/members/:userId/experience", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id, userId } = request.params as { id: string; userId: string };
    const { cursor } = z
      .object({ cursor: z.string().uuid().optional() })
      .parse(request.query);
    return { data: await ctx.clubPresence.member(user, id, userId, cursor) };
  });

  app.get("/api/v1/clubs/:id/stats", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    return { data: await ctx.clubPresence.stats(user, id) };
  });

  app.patch("/api/v1/clubs/:id/members/:userId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, userId } = request.params as { id: string; userId: string };
    const body = updateClubMemberRoleSchema.parse(request.body);
    await ctx.clubs.updateMemberRole(user, id, userId, body.role);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/clubs/:id/members/:userId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, userId } = request.params as { id: string; userId: string };
    await ctx.clubs.removeMember(user, id, userId);
    return { data: { ok: true } };
  });

  app.post("/api/v1/clubs/:id/invites", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    const body = createClubInviteSchema.parse(request.body);
    const inviteId = await ctx.clubs.createInvite(user, id, body);
    reply.status(201);
    return { data: { id: inviteId } };
  });

  app.get("/api/v1/clubs/:id/invites", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    const invites = await ctx.clubs.listInvites(user, id);
    return { data: invites };
  });

  app.delete("/api/v1/clubs/:id/invites/:inviteId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, inviteId } = request.params as {
      id: string;
      inviteId: string;
    };
    await ctx.clubs.revokeInvite(user, id, inviteId);
    return { data: { ok: true } };
  });

  app.post("/api/v1/clubs/invites/:token/accept", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { token } = request.params as { token: string };
    const clubId = await ctx.clubs.acceptInvite(user, token);
    return { data: { clubId } };
  });

  app.get("/api/v1/clubs/:id/feed", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const query = request.query as { cursor?: string; limit?: string };
    const feed = await ctx.clubDiscussion.getFeed(user, id, {
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return { data: feed };
  });

  // Club Challenges tab: active · upcoming · past + creation affordance.
  // Club-created Simple, Bingo, and Quest challenges all work here with
  // no special variants; creation follows club permissions.
  app.get("/api/v1/clubs/:id/challenges", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await ctx.challenges.listForClub(user, id) };
  });

  // Recent challenge activity for the club tab. Consumes lifecycle
  // events (joined/started/milestone/completed/achievement/ended) —
  // never raw objective progress.
  app.get("/api/v1/clubs/:id/challenges/activity", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(50).optional() })
      .parse(request.query);
    return {
      data: await ctx.challenges.listClubChallengeActivity(user, id, limit),
    };
  });

  app.get("/api/v1/clubs/:id/topics/index", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const query = z
      .object({
        clubReadId: z.string().uuid().optional(),
        cursor: z.string().uuid().optional(),
        quoteCursor: z.string().uuid().optional(),
        unread: z.enum(["true", "false"]).optional(),
      })
      .parse(request.query);
    return {
      data: await ctx.clubDiscussion.index(user, id, {
        ...query,
        unread: query.unread === "true",
      }),
    };
  });
  app.get("/api/v1/clubs/:id/topics", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const query = request.query as { cursor?: string; limit?: string };
    const result = await ctx.clubDiscussion.listTopics(user, id, {
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return { data: result };
  });

  app.post("/api/v1/clubs/:id/topics", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    const body = createClubTopicSchema.parse(request.body);
    const topicId = await ctx.clubDiscussion.createTopic(user, id, body);
    reply.status(201);
    return { data: { id: topicId } };
  });

  app.get("/api/v1/clubs/:id/topics/:topicId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id, topicId } = request.params as {
      id: string;
      topicId: string;
    };
    const query = request.query as { cursor?: string; limit?: string };
    const detail = await ctx.clubDiscussion.getTopic(user, id, topicId, {
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
    return { data: detail };
  });

  app.patch("/api/v1/clubs/:id/topics/:topicId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, topicId } = request.params as {
      id: string;
      topicId: string;
    };
    const body = updateClubTopicSchema.parse(request.body);
    await ctx.clubDiscussion.updateTopic(user, id, topicId, body);
    return { data: { ok: true } };
  });

  app.post(
    "/api/v1/clubs/:id/topics/:topicId/posts",
    async (request, reply) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, topicId } = request.params as {
        id: string;
        topicId: string;
      };
      const body = createClubPostSchema.parse(request.body);
      const postId = await ctx.clubDiscussion.createPost(
        user,
        id,
        topicId,
        body,
      );
      reply.status(201);
      return { data: { id: postId } };
    },
  );

  app.delete(
    "/api/v1/clubs/:id/topics/:topicId/posts/:postId",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, topicId, postId } = request.params as {
        id: string;
        topicId: string;
        postId: string;
      };
      await ctx.clubDiscussion.deletePost(user, id, topicId, postId);
      return { data: { ok: true } };
    },
  );

  app.post(
    "/api/v1/clubs/:id/topics/:topicId/posts/:postId/reactions",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, topicId, postId } = request.params as {
        id: string;
        topicId: string;
        postId: string;
      };
      const body = setClubReactionSchema.parse(request.body ?? {});
      const result = await ctx.clubDiscussion.toggleReaction(
        user,
        id,
        topicId,
        postId,
        body.reaction,
      );
      return { data: result };
    },
  );

  app.get("/api/v1/clubs/:id/works/current", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const work = await ctx.clubWorks.getCurrentWorkDetail(user, id);
    return { data: work };
  });

  app.get("/api/v1/clubs/:id/works", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const works = await ctx.clubWorks.listWorks(user, id);
    return { data: works };
  });

  app.post("/api/v1/clubs/:id/works", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    const body = createClubWorkSchema.parse(request.body);
    const workId = await ctx.clubWorks.addWork(user, id, body);
    reply.status(201);
    return { data: { id: workId } };
  });

  app.patch("/api/v1/clubs/:id/works/:workId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, workId } = request.params as { id: string; workId: string };
    const body = updateClubWorkSchema.parse(request.body);
    await ctx.clubWorks.updateWork(user, id, workId, body);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/clubs/:id/works/:workId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, workId } = request.params as { id: string; workId: string };
    await ctx.clubWorks.removeWork(user, id, workId);
    return { data: { ok: true } };
  });

  app.get("/api/v1/clubs/:id/schedule", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const query = request.query as {
      pastLimit?: string;
      upcomingLimit?: string;
    };
    const view = await ctx.clubSchedules.getScheduleView(user, id, {
      pastLimit: query.pastLimit ? Number(query.pastLimit) : undefined,
      upcomingLimit: query.upcomingLimit
        ? Number(query.upcomingLimit)
        : undefined,
    });
    return { data: view };
  });

  app.get("/api/v1/clubs/:id/schedules", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const schedules = await ctx.clubSchedules.listSchedules(user, id);
    return { data: schedules };
  });

  app.post("/api/v1/clubs/:id/schedules", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    const body = createClubScheduleSchema.parse(request.body);
    const scheduleId = await ctx.clubSchedules.createSchedule(user, id, body);
    reply.status(201);
    return { data: { id: scheduleId } };
  });

  app.patch("/api/v1/clubs/:id/schedules/:scheduleId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, scheduleId } = request.params as {
      id: string;
      scheduleId: string;
    };
    const body = updateClubScheduleSchema.parse(request.body);
    await ctx.clubSchedules.updateSchedule(user, id, scheduleId, body);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/clubs/:id/schedules/:scheduleId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, scheduleId } = request.params as {
      id: string;
      scheduleId: string;
    };
    await ctx.clubSchedules.deleteSchedule(user, id, scheduleId);
    return { data: { ok: true } };
  });

  app.get("/api/v1/clubs/:id/overview", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const overview = await ctx.clubOverview.getOverview(user, id);
    return { data: overview };
  });

  app.get("/api/v1/clubs/:id/check-in", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const summary = await ctx.clubCheckIns.getSummary(user, id);
    return { data: summary };
  });

  app.post(
    "/api/v1/clubs/:id/schedule/occurrences/:occurrenceId/check-in",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, occurrenceId } = request.params as {
        id: string;
        occurrenceId: string;
      };
      const summary = await ctx.clubCheckIns.checkIn(user, id, occurrenceId);
      return { data: summary };
    },
  );

  app.delete(
    "/api/v1/clubs/:id/schedule/occurrences/:occurrenceId/check-in",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, occurrenceId } = request.params as {
        id: string;
        occurrenceId: string;
      };
      const summary = await ctx.clubCheckIns.removeCheckIn(
        user,
        id,
        occurrenceId,
      );
      return { data: summary };
    },
  );

  app.get("/api/v1/clubs/:id/discussion-anchors", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number(query.limit) : 5;
    const anchors = await ctx.clubDiscussionAnchors.listDefault(
      user,
      id,
      limit,
    );
    return { data: { anchors } };
  });

  app.get("/api/v1/clubs/:id/discussion-anchors/all", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const data = await ctx.clubDiscussionAnchors.listAll(user, id);
    return { data };
  });

  app.post(
    "/api/v1/clubs/:id/schedule/occurrences/:occurrenceId/discussion",
    async (request, reply) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, occurrenceId } = request.params as {
        id: string;
        occurrenceId: string;
      };
      const result = await ctx.clubDiscussionAnchors.ensureOccurrenceDiscussion(
        user,
        id,
        occurrenceId,
      );
      reply.status(201);
      return { data: result };
    },
  );

  app.get("/api/v1/clubs/:id/polls", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const polls = await ctx.clubPolls.listForModerator(user, id);
    return { data: polls };
  });

  app.get("/api/v1/clubs/:id/polls/active", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const poll = await ctx.clubPolls.getActive(user, id);
    return { data: poll };
  });

  app.get("/api/v1/clubs/:id/polls/:pollId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id, pollId } = request.params as { id: string; pollId: string };
    const poll = await ctx.clubPolls.getPoll(user, id, pollId);
    return { data: poll };
  });

  app.post("/api/v1/clubs/:id/polls", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    const body = createClubPollSchema.parse(request.body ?? {});
    const pollId = await ctx.clubPolls.createDraft(user, id, body);
    reply.status(201);
    return { data: { id: pollId } };
  });

  app.post("/api/v1/clubs/:id/polls/:pollId/discover", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, pollId } = request.params as { id: string; pollId: string };
    await ctx.clubPolls.discoverCandidates(user, id, pollId);
    const poll = await ctx.clubPolls.getPoll(user, id, pollId);
    return { data: poll };
  });

  app.post(
    "/api/v1/clubs/:id/polls/:pollId/options",
    async (request, reply) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, pollId } = request.params as { id: string; pollId: string };
      const body = addClubPollOptionSchema.parse(request.body);
      const optionId = await ctx.clubPolls.addOption(user, id, pollId, body);
      reply.status(201);
      return { data: { id: optionId } };
    },
  );

  app.delete(
    "/api/v1/clubs/:id/polls/:pollId/options/:optionId",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
      const { id, pollId, optionId } = request.params as {
        id: string;
        pollId: string;
        optionId: string;
      };
      await ctx.clubPolls.removeOption(user, id, pollId, optionId);
      return { data: { ok: true } };
    },
  );

  app.post("/api/v1/clubs/:id/polls/:pollId/publish", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, pollId } = request.params as { id: string; pollId: string };
    await ctx.clubPolls.publish(user, id, pollId);
    const poll = await ctx.clubPolls.getPoll(user, id, pollId);
    return { data: poll };
  });

  app.post("/api/v1/clubs/:id/polls/:pollId/votes", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, pollId } = request.params as { id: string; pollId: string };
    const body = voteClubPollSchema.parse(request.body);
    await ctx.clubPolls.vote(user, id, pollId, body.optionId);
    const poll = await ctx.clubPolls.getPoll(user, id, pollId);
    return { data: poll };
  });

  app.post("/api/v1/clubs/:id/polls/:pollId/close", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, pollId } = request.params as { id: string; pollId: string };
    await ctx.clubPolls.close(user, id, pollId);
    const poll = await ctx.clubPolls.getPoll(user, id, pollId);
    return { data: poll };
  });

  app.post("/api/v1/clubs/:id/polls/:pollId/apply-result", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, pollId } = request.params as { id: string; pollId: string };
    await ctx.clubPolls.applyResult(user, id, pollId);
    const poll = await ctx.clubPolls.getPoll(user, id, pollId);
    return { data: poll };
  });

  app.get("/api/v1/clubs/:id/quotes", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number(query.limit) : 5;
    const quotes = await ctx.clubQuotes.listOverview(user, id, limit);
    return { data: { quotes } };
  });

  app.get("/api/v1/clubs/:id/quotes/all", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const quotes = await ctx.clubQuotes.listAll(user, id);
    return { data: { quotes } };
  });

  app.get("/api/v1/clubs/:id/quotes/shareable-annotations", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_READ);
    const { id } = request.params as { id: string };
    const annotations = await ctx.clubQuotes.listShareableAnnotations(user, id);
    return { data: { annotations } };
  });

  app.post("/api/v1/clubs/:id/quotes", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id } = request.params as { id: string };
    const body = createClubQuoteSchema.parse(request.body);
    const quoteId = await ctx.clubQuotes.createQuote(user, id, body);
    reply.status(201);
    return { data: { id: quoteId } };
  });

  app.delete("/api/v1/clubs/:id/quotes/:quoteId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.CLUBS_WRITE);
    const { id, quoteId } = request.params as { id: string; quoteId: string };
    await ctx.clubQuotes.deleteQuote(user, id, quoteId);
    return { data: { ok: true } };
  });
}
