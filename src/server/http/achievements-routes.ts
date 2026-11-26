import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { NotFoundError } from "../../shared/errors.js";
import {
  ACHIEVEMENT_LIST_LIMIT_MAX,
  achievementListQuerySchema,
} from "../../shared/achievements.js";

const recentQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ACHIEVEMENT_LIST_LIMIT_MAX)
    .default(10),
});

async function requireAchievementsEnabled(ctx: AppContext) {
  if (!(await ctx.achievements.isEnabled())) {
    throw new NotFoundError("Achievements are disabled");
  }
}

export async function registerAchievementsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  // ---- Own achievements ----
  app.get("/api/v1/achievements/me", async (request) => {
    const user = requireAuth(request);
    await requireAchievementsEnabled(ctx);
    const query = achievementListQuerySchema.parse(request.query);
    return {
      data: await ctx.achievements.listUserGrants({
        viewer: user,
        ownerId: user.id,
        viewerMaySeeProfile: true,
        limit: query.limit,
        offset: query.offset,
      }),
    };
  });

  app.get("/api/v1/achievements/me/recent", async (request) => {
    const user = requireAuth(request);
    await requireAchievementsEnabled(ctx);
    const query = recentQuerySchema.parse(request.query);
    return {
      data: await ctx.achievements.recentUserGrants({
        viewer: user,
        ownerId: user.id,
        viewerMaySeeProfile: true,
        limit: query.limit,
      }),
    };
  });

  app.get("/api/v1/achievements/me/count", async (request) => {
    const user = requireAuth(request);
    await requireAchievementsEnabled(ctx);
    return {
      data: {
        count: await ctx.achievements.countUserGrants({
          viewer: user,
          ownerId: user.id,
          viewerMaySeeProfile: true,
        }),
      },
    };
  });

  app.get(
    "/api/v1/achievements/me/definitions/:definitionId",
    async (request) => {
      const user = requireAuth(request);
      await requireAchievementsEnabled(ctx);
      const { definitionId } = z
        .object({ definitionId: z.string().uuid() })
        .parse(request.params);
      const grant = await ctx.achievements.getUserGrantForDefinition({
        viewer: user,
        ownerId: user.id,
        definitionId,
        viewerMaySeeProfile: true,
      });
      if (!grant) throw new NotFoundError("Achievement not found");
      return { data: grant };
    },
  );

  // ---- Someone's achievements (profile surface) ----
  async function resolveProfileTarget(username: string, viewerId: string) {
    const target = await ctx.profiles.findByUsername(username);
    if (!target) throw new NotFoundError("Profile not found");
    const canView = await ctx.profiles.canViewProfileAsync(target, viewerId);
    if (!canView) throw new NotFoundError("Profile not found");
    return target;
  }

  app.get("/api/v1/profiles/:username/achievements", async (request) => {
    const viewer = requireAuth(request);
    await requireAchievementsEnabled(ctx);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    const query = achievementListQuerySchema.parse(request.query);
    const target = await resolveProfileTarget(username, viewer.id);
    const viewerMaySeeProfile =
      viewer.id === target.id ||
      (await ctx.profiles.canViewProfileAsync(target, viewer.id));
    return {
      data: await ctx.achievements.listUserGrants({
        viewer,
        ownerId: target.id,
        viewerMaySeeProfile,
        limit: query.limit,
        offset: query.offset,
      }),
    };
  });

  app.get("/api/v1/profiles/:username/achievements/recent", async (request) => {
    const viewer = requireAuth(request);
    await requireAchievementsEnabled(ctx);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    const query = recentQuerySchema.parse(request.query);
    const target = await resolveProfileTarget(username, viewer.id);
    return {
      data: await ctx.achievements.recentUserGrants({
        viewer,
        ownerId: target.id,
        viewerMaySeeProfile: true,
        limit: query.limit,
      }),
    };
  });

  app.get("/api/v1/profiles/:username/achievements/count", async (request) => {
    const viewer = requireAuth(request);
    await requireAchievementsEnabled(ctx);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    const target = await resolveProfileTarget(username, viewer.id);
    return {
      data: {
        count: await ctx.achievements.countUserGrants({
          viewer,
          ownerId: target.id,
          viewerMaySeeProfile: true,
        }),
      },
    };
  });

  app.get(
    "/api/v1/profiles/:username/achievements/definitions/:definitionId",
    async (request) => {
      const viewer = requireAuth(request);
      await requireAchievementsEnabled(ctx);
      const { username, definitionId } = z
        .object({
          username: z.string().min(1),
          definitionId: z.string().uuid(),
        })
        .parse(request.params);
      const target = await resolveProfileTarget(username, viewer.id);
      const grant = await ctx.achievements.getUserGrantForDefinition({
        viewer,
        ownerId: target.id,
        definitionId,
        viewerMaySeeProfile: true,
      });
      if (!grant) throw new NotFoundError("Achievement not found");
      return { data: grant };
    },
  );
}
