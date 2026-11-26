import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { isProcessingModuleId } from "../../shared/processing-policy.js";
import { ValidationError } from "../../shared/errors.js";

export async function registerProcessingRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.get("/api/v1/processing/modules", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_READ);
    const modules = await ctx.processing.listModules();
    return { data: modules };
  });

  app.get("/api/v1/processing/policies", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_READ);
    const modules = await ctx.processing.listModules();
    return { data: modules };
  });

  app.get("/api/v1/processing/policies/:moduleId/preview", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_READ);
    const { moduleId } = z
      .object({ moduleId: z.string() })
      .parse(request.params);
    if (!isProcessingModuleId(moduleId)) {
      throw new ValidationError("Invalid processing module");
    }
    const policy = await ctx.processing.getPolicy(moduleId);
    const preview = ctx.processing.preview(moduleId, policy);
    return { data: preview };
  });

  app.patch("/api/v1/processing/policies/:moduleId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_WRITE);
    const { moduleId } = z
      .object({ moduleId: z.string() })
      .parse(request.params);
    if (!isProcessingModuleId(moduleId)) {
      throw new ValidationError("Invalid processing module");
    }
    const updated = await ctx.processing.updatePolicy(
      moduleId,
      request.body,
    );
    return { data: updated };
  });
}
