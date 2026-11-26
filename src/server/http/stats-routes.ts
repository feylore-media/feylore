import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { ValidationError } from "../../shared/errors.js";

const statsQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const statsParamsSchema = z.object({
  username: z.string().min(1),
});

const statsDomainParamsSchema = statsParamsSchema.extend({
  domain: z.string().min(1),
});

export function registerStatsRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/v1/profiles/:username/stats/:domain", async (request) => {
    const viewer = requireAuth(request);
    const { username, domain } = statsDomainParamsSchema.parse(request.params);
    const query = statsQuerySchema.parse(request.query);

    if (!ctx.stats.isStatsDomain(domain)) {
      throw new ValidationError("Unknown stats domain");
    }

    return {
      data: await ctx.stats.getForUser(
        username,
        viewer.id,
        query.from ?? null,
        query.to ?? null,
        domain,
      ),
    };
  });

  app.get("/api/v1/profiles/:username/stats", async (request) => {
    const viewer = requireAuth(request);
    const { username } = statsParamsSchema.parse(request.params);
    const query = statsQuerySchema.parse(request.query);

    return {
      data: await ctx.stats.getForUser(
        username,
        viewer.id,
        query.from ?? null,
        query.to ?? null,
      ),
    };
  });
}