import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { NotFoundError } from "../../shared/errors.js";
import {
  BINGO_STYLE_REGISTRY,
  QUEST_STYLE_REGISTRY,
  challengeListQuerySchema,
} from "../../shared/challenges.js";

async function requireChallengesEnabled(ctx: AppContext) {
  if (!(await ctx.challenges.isEnabled())) {
    throw new NotFoundError("Challenges are disabled");
  }
}

export async function registerChallengesRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.get("/api/v1/challenges", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    const query = challengeListQuerySchema.parse(request.query);
    const items = await ctx.challenges.listAccessible(user, {
      clubId: query.clubId,
      state: query.state,
    });
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    return {
      data: items.slice(offset, offset + limit),
      page: { total: items.length },
    };
  });

  app.post("/api/v1/challenges", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    await requireChallengesEnabled(ctx);
    const created = await ctx.challenges.create(user, request.body);
    reply.status(201);
    return { data: created };
  });

  // Personal hub: yours · invited · discoverable · completed.
  app.get("/api/v1/challenges/hub", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    return { data: await ctx.challenges.getHub(user) };
  });

  // Pending invites for the viewer (the hub's Invited section).
  app.get("/api/v1/challenges/invites/mine", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    return { data: await ctx.challenges.listMyInvites(user) };
  });

  app.post("/api/v1/challenges/invites/:inviteId/accept", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    await requireChallengesEnabled(ctx);
    const { inviteId } = z
      .object({ inviteId: z.string().uuid() })
      .parse(request.params);
    return { data: await ctx.challenges.respondToInvite(user, inviteId, true) };
  });

  app.post("/api/v1/challenges/invites/:inviteId/decline", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    const { inviteId } = z
      .object({ inviteId: z.string().uuid() })
      .parse(request.params);
    return {
      data: await ctx.challenges.respondToInvite(user, inviteId, false),
    };
  });

  // Registry-backed board styles (curated set; Bingo-only presentation).
  app.get("/api/v1/challenges/board-styles", async (request) => {
    requireAuth(request);
    await requireChallengesEnabled(ctx);
    return { data: BINGO_STYLE_REGISTRY };
  });

  // Registry-backed map styles (curated set; Quest-only presentation).
  app.get("/api/v1/challenges/quest-styles", async (request) => {
    requireAuth(request);
    await requireChallengesEnabled(ctx);
    return { data: QUEST_STYLE_REGISTRY };
  });

  app.get("/api/v1/challenges/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await ctx.challenges.getDetail(user, id) };
  });

  app.patch("/api/v1/challenges/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await ctx.challenges.update(user, id, request.body) };
  });

  app.delete("/api/v1/challenges/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ctx.challenges.remove(user, id);
    return { data: { ok: true } };
  });

  app.post("/api/v1/challenges/:id/join", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await ctx.challenges.join(user, id) };
  });

  app.post("/api/v1/challenges/:id/leave", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ctx.challenges.leave(user, id);
    return { data: { ok: true } };
  });

  app.get("/api/v1/challenges/:id/participants", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await ctx.challenges.listParticipants(user, id) };
  });

  // Social summaries: per-format progress per participant (counts and
  // states only — counted items stay gated to self-or-manager).
  app.get(
    "/api/v1/challenges/:id/participants/summaries",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.GOALS_READ);
      await requireChallengesEnabled(ctx);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      return { data: await ctx.challenges.listParticipantSummaries(user, id) };
    },
  );

  app.get("/api/v1/challenges/:id/invites", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await ctx.challenges.listChallengeInvites(user, id) };
  });

  app.post("/api/v1/challenges/:id/invites", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(request.body);
    const invite = await ctx.challenges.invite(user, id, userId);
    reply.status(201);
    return { data: invite };
  });

  // Viewer progress within the challenge's own evaluation period.
  // Evaluating here may complete the participation and grant the optional
  // achievement exactly once (idempotent).
  app.get("/api/v1/challenges/:id/progress", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await ctx.challenges.evaluateViewerProgress(user, id) };
  });

  app.get("/api/v1/challenges/:id/candidates", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { objectiveId } = z
      .object({ objectiveId: z.string().uuid().optional() })
      .parse(request.query);
    return {
      data: await ctx.challenges.listEvaluatedCandidates(
        user,
        id,
        undefined,
        objectiveId,
      ),
    };
  });

  // Bingo participant board: shared config plus the viewer's square states.
  // Evaluating may complete the participation (idempotent, as with progress).
  app.get("/api/v1/challenges/:id/board", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await ctx.challenges.getBoardView(user, id) };
  });

  // Quest participant map: shared config plus the viewer's node states.
  // Evaluating may complete the participation (idempotent, as with progress).
  app.get("/api/v1/challenges/:id/quest", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { data: await ctx.challenges.getQuestView(user, id) };
  });

  app.get("/api/v1/challenges/:id/achievements", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    await requireChallengesEnabled(ctx);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ctx.challenges.requireView(user, id);
    return {
      data: await ctx.achievements.getSourceAchievements("challenge", id),
    };
  });

  // Small 1.0 profile surface: active + completed challenge participation.
  // Challenge visibility is enforced inside the service.
  app.get("/api/v1/profiles/:username/challenges", async (request) => {
    const viewer = requireAuth(request);
    await requireChallengesEnabled(ctx);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    const target = await ctx.profiles.findByUsername(username);
    if (!target) throw new NotFoundError("Profile not found");
    const canView = await ctx.profiles.canViewProfileAsync(target, viewer.id);
    if (!canView) throw new NotFoundError("Profile not found");
    return {
      data: await ctx.challenges.listForProfile(
        viewer,
        target.id,
        viewer.id === target.id,
      ),
    };
  });
}
