import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  AppError,
  ValidationError,
} from "../../shared/errors.js";
import {
  readingProgressQuerySchema,
  readingProgressUpdateSchema,
} from "../../shared/reading-progress.js";
import { ensureProgressSyncEnabled } from "../modules/reading-progress/sync-preference.js";

const readingProgressPutSchema = readingProgressUpdateSchema.extend({
  representationId: z.string().uuid(),
});

export async function registerReadingProgressRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.get("/api/v1/representations/:id/reading-progress", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { id } = request.params as { id: string };
    await ctx.readingProgress.ensureRepresentationAccess(user.id, id);
    const progress = await ctx.readingProgress.getProgress(user.id, id);
    return { data: progress };
  });

  app.put("/api/v1/representations/:id/reading-progress", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    await ensureProgressSyncEnabled(ctx.db, user.id);
    const { id } = request.params as { id: string };
    const body = readingProgressUpdateSchema.parse(request.body);
    const result = await ctx.readingProgress.setProgress(user.id, id, body);
    if (!result.accepted) {
      throw new AppError("STALE_PROGRESS", "Stale progress", 409, {
        current: result.current,
      });
    }
    return {
      data: {
        accepted: true,
        idempotent: "idempotent" in result ? result.idempotent : false,
        progress: result.progress,
      },
    };
  });

  app.get("/api/v1/reading-progress", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const query = readingProgressQuerySchema.parse(request.query);
    if (query.representationId) {
      await ctx.readingProgress.ensureRepresentationAccess(
        user.id,
        query.representationId,
      );
      const progress = await ctx.readingProgress.getProgress(
        user.id,
        query.representationId,
      );
      return { data: progress };
    }
    if (query.workType && query.workId) {
      const items = await ctx.readingProgress.listProgressForWork(
        user.id,
        query.workType,
        query.workId,
      );
      return { data: items };
    }
    throw new ValidationError(
      "Provide representationId or workType and workId",
    );
  });

  app.put("/api/v1/reading-progress", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    await ensureProgressSyncEnabled(ctx.db, user.id);
    const body = readingProgressPutSchema.parse(request.body);
    const { representationId, ...update } = body;
    const result = await ctx.readingProgress.setProgress(
      user.id,
      representationId,
      update,
    );
    if (!result.accepted) {
      throw new AppError("STALE_PROGRESS", "Stale progress", 409, {
        current: result.current,
      });
    }
    return {
      data: {
        accepted: true,
        idempotent: "idempotent" in result ? result.idempotent : false,
        progress: result.progress,
      },
    };
  });
}
