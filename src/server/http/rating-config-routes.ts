import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  deleteRatingDimensionSchema,
  setGenreDefinitionSchema,
  updateRatingSettingsSchema,
  upsertCoreDimensionSchema,
  upsertGenreDimensionSchema,
} from "../../shared/ratings.js";

export async function registerRatingConfigRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.get("/api/v1/admin/ratings/config", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.RATINGS_READ);
    const [settings, coreDimensions, genreDefinitions, genreTerms, externalProviders] =
      await Promise.all([
        ctx.ratingsConfig.getSettings(),
        ctx.ratingsConfig.listCoreDimensions(),
        ctx.ratingsConfig.listAllGenreDefinitions(),
        ctx.metadataFormatting.listTerms("genre", "books"),
        ctx.externalPosting.listProviders(),
      ]);
    return {
      data: { settings, coreDimensions, genreDefinitions, genreTerms, externalProviders },
    };
  });

  app.patch("/api/v1/admin/ratings/settings", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.RATINGS_WRITE);
    const body = updateRatingSettingsSchema.parse(request.body);
    const settings = await ctx.ratingsConfig.patchSettings(body);
    return { data: { settings } };
  });

  app.put("/api/v1/admin/ratings/dimensions/core", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.RATINGS_WRITE);
    const body = upsertCoreDimensionSchema.parse(request.body);
    const dimension = await ctx.ratingsConfig.upsertCoreDimension(body);
    return { data: { dimension } };
  });

  app.put("/api/v1/admin/ratings/dimensions/genre", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.RATINGS_WRITE);
    const body = upsertGenreDimensionSchema.parse(request.body);
    const dimension = await ctx.ratingsConfig.upsertGenreDimension(body);
    return { data: { dimension } };
  });

  app.delete("/api/v1/admin/ratings/dimensions/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.RATINGS_WRITE);
    const { id } = deleteRatingDimensionSchema.parse(request.params);
    await ctx.ratingsConfig.deleteDimension(id);
    return { data: { removed: true } };
  });

  app.put("/api/v1/admin/ratings/genres/:termId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.RATINGS_WRITE);
    const { termId } = request.params as { termId: string };
    const body = setGenreDefinitionSchema.parse({
      ...(request.body as Record<string, unknown>),
      genreTermId: termId,
    });
    await ctx.ratingsConfig.setGenreDefinition(body);
    const genreDefinitions = await ctx.ratingsConfig.listAllGenreDefinitions();
    return { data: { genreDefinitions } };
  });
}
