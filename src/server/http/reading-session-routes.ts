import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { NotFoundError } from "../../shared/errors.js";
import {
  readingSessionListQuerySchema,
  readingSessionPatchSchema,
} from "../../shared/reading-sessions.js";
import { readingLocatorSchema } from "../../shared/reading-progress.js";
import { ensureProgressSyncEnabled } from "../modules/reading-progress/sync-preference.js";

export async function registerReadingSessionRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.get("/api/v1/reading-sessions/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { id } = request.params as { id: string };
    const session = await ctx.readingSessions.getSession(user.id, id);
    if (!session) throw new NotFoundError("Reading session not found");
    return { data: session };
  });

  app.get("/api/v1/reading-sessions", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const query = readingSessionListQuerySchema.parse(request.query);
    const sessions = await ctx.readingSessions.listSessions(user.id, query);
    return { data: sessions };
  });

  app.patch("/api/v1/reading-sessions/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    await ensureProgressSyncEnabled(ctx.db, user.id);
    const { id } = request.params as { id: string };
    const body = readingSessionPatchSchema.parse(request.body);
    if (body.ended) {
      const endingLocator = body.endingLocator
        ? readingLocatorSchema.parse(body.endingLocator)
        : undefined;
      const session = await ctx.readingSessions.endSession(user.id, id, {
        endingLocator,
      });
      if (!session) throw new NotFoundError("Reading session not found");
      return { data: session };
    }
    const session = await ctx.readingSessions.getSession(user.id, id);
    if (!session) throw new NotFoundError("Reading session not found");
    return { data: session };
  });
}
