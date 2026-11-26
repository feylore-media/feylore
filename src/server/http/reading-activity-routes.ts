import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  readingActivityCreateSchema,
  readingActivityListQuerySchema,
} from "../../shared/reading-activity.js";
import { ensureProgressSyncEnabled } from "../modules/reading-progress/sync-preference.js";

export async function registerReadingActivityRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.post(
    "/api/v1/representations/:id/reading-activity",
    async (request, reply) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
      await ensureProgressSyncEnabled(ctx.db, user.id);
      const { id } = request.params as { id: string };
      const body = readingActivityCreateSchema.parse(request.body);
      const result = await ctx.readingActivity.recordActivity(user.id, id, body);
      reply.status(201);
      return { data: result };
    },
  );

  app.get("/api/v1/reading-activity", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const query = readingActivityListQuerySchema.parse(request.query);
    const items = await ctx.readingActivity.listActivity(user.id, query);
    return { data: items };
  });
}
