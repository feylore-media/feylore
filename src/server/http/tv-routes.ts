import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { NotFoundError } from "../../shared/errors.js";
import * as schema from "../db/schema.js";
import {
  tvShowListQuerySchema,
  createTvShowSchema,
  updateTvShowSchema,
  createTvSeasonSchema,
  tvImportSchema,
  favoriteUpdateSchema,
  ratingUpdateSchema,
  createLiveTvPlaylistSchema,
  updateLiveTvPlaylistSchema,
  createLiveTvChannelSchema,
  updateLiveTvChannelSchema,
} from "../../shared/tv.js";
import { LiveTvService } from "../modules/tv/live-tv/service.js";

export async function registerTvRoutes(app: FastifyInstance, ctx: AppContext) {
  const liveTv = new LiveTvService(ctx.db);

  async function showFromSlug(userId: string, slug: string) {
    const show = await ctx.tv.getShowByRef(slug);
    await ctx.tv.ensureUserAccess(userId, show.id);
    return show;
  }

  async function seasonFromNumber(showId: string, seasonNumber: number) {
    const seasons = await ctx.tv.listSeasonsForShow(showId);
    const season = seasons.find((s) => s.seasonNumber === seasonNumber);
    if (!season) throw new NotFoundError("TV season not found");
    return season;
  }

  app.get("/api/v1/tv/shows", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const query = tvShowListQuerySchema.parse(request.query);
    const result = await ctx.tv.listShowsForUser(user.id, query);
    return {
      data: result.items,
      page: { nextCursor: result.nextCursor ?? null, prevCursor: null },
    };
  });

  app.post("/api/v1/tv/shows", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const body = createTvShowSchema.parse(request.body);
    const id = await ctx.tv.createShow(body);
    await ctx.libraryMembership.ensureWorkMembership(user.id, "show", id);
    const show = await ctx.tv.getShow(id);
    reply.status(201);
    return { data: ctx.tv.toShowPublic(show) };
  });

  app.get("/api/v1/tv/genres", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const memberships = await ctx.libraryMembership.listForUser(user.id, "show");
    if (memberships.length === 0) return { data: [] };
    const showIds = memberships.map((m) => m.targetId);
    const rows = await ctx.db
      .select({ name: schema.tvGenres.name })
      .from(schema.tvGenres)
      .where(inArray(schema.tvGenres.showId, showIds));
    return {
      data: [...new Set(rows.map((r) => r.name))].sort((a, b) =>
        a.localeCompare(b),
      ),
    };
  });

  app.post("/api/v1/tv/import", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const body = tvImportSchema.parse(request.body);
    const ingestItemIds: string[] = [];
    for (const fileId of body.fileIds) {
      const file = await ctx.files.getFile(fileId);
      const result = await ctx.ingest.items.reconcileDiscovered({
        sourceKind: "filesystem",
        sourceIdentity: `legacy:${fileId}`,
        sourcePath: file.relativePath,
        sourceStorageLocationId: file.storageLocationId,
        originalFilename: file.relativePath.split("/").pop() ?? file.relativePath,
        sourceChecksum: file.checksum,
        sourceSize: file.size,
        submittedByUserId: user.id,
      });
      await ctx.ingest.enqueueProcess(result.item.id);
      ingestItemIds.push(result.item.id);
    }
    reply.status(202);
    return { data: { ingestItemIds } };
  });

  app.get("/api/v1/tv/live/playlists", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const playlists = await liveTv.listPlaylists();
    return { data: playlists };
  });

  app.post("/api/v1/tv/live/playlists", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const body = createLiveTvPlaylistSchema.parse(request.body);
    const id = await liveTv.createPlaylist(body);
    const playlist = await liveTv.getPlaylist(id);
    reply.status(201);
    return { data: playlist };
  });

  app.get("/api/v1/tv/live/playlists/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const playlist = await liveTv.getPlaylist(id);
    return { data: playlist };
  });

  app.patch("/api/v1/tv/live/playlists/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateLiveTvPlaylistSchema.parse(request.body);
    await liveTv.updatePlaylist(id, body);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/tv/live/playlists/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await liveTv.deletePlaylist(id);
    return { data: { ok: true } };
  });

  app.post("/api/v1/tv/live/playlists/:id/sync", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const channelCount = await liveTv.syncPlaylist(id);
    reply.status(202);
    return { data: { channelCount } };
  });

  app.get("/api/v1/tv/live/playlists/:id/channels", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const channels = await liveTv.listChannels(id);
    return { data: channels };
  });

  app.post("/api/v1/tv/live/playlists/:id/channels", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createLiveTvChannelSchema.parse(request.body);
    const channelId = await liveTv.createChannel(id, body);
    const channel = await liveTv.getChannel(channelId);
    reply.status(201);
    return { data: channel };
  });

  app.get("/api/v1/tv/live/channels/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const channel = await liveTv.getChannel(id);
    return { data: channel };
  });

  app.patch("/api/v1/tv/live/channels/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateLiveTvChannelSchema.parse(request.body);
    await liveTv.updateChannel(id, body);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/tv/live/channels/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await liveTv.deleteChannel(id);
    return { data: { ok: true } };
  });

  app.get("/api/v1/tv/live/channels/:id/playback", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const manifest = await liveTv.getPlaybackManifest(id);
    return { data: manifest };
  });

  app.get("/api/v1/tv/episodes/:id/playback", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const { id } = z
      .object({ id: z.string().regex(/^[a-z0-9]{6}$/) })
      .parse(request.params);
    const episode = await ctx.tv.getEpisodeById(id);
    await ctx.tv.ensureUserAccess(user.id, episode.showId);
    const representationId = await ctx.tv.getPrimaryRepresentationId(
      episode.id,
      user.id,
    );
    if (!representationId) {
      throw new NotFoundError("No playback representation");
    }
    const manifest = await ctx.playback.getPlaybackManifest(
      user.id,
      representationId,
    );
    return { data: manifest };
  });

  app.get("/api/v1/tv/shows/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const { slug } = request.params as { slug: string };
    const show = await showFromSlug(user.id, slug);
    const detail = await ctx.tv.getShowDetail(show.id, user.id);
    return { data: detail };
  });

  app.patch("/api/v1/tv/shows/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { slug } = request.params as { slug: string };
    const show = await showFromSlug(user.id, slug);
    const body = updateTvShowSchema.parse(request.body);
    const { genres, ...update } = body;
    await ctx.tv.updateShow(show.id, update);
    if (genres) await ctx.tv.setGenres(show.id, genres);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/tv/shows/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { slug } = request.params as { slug: string };
    const show = await showFromSlug(user.id, slug);
    await ctx.tv.deleteShow(show.id);
    return { data: { ok: true } };
  });

  app.post("/api/v1/tv/shows/:slug/membership", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { slug } = request.params as { slug: string };
    const show = await ctx.tv.getShowByRef(slug);
    await ctx.libraryMembership.ensureWorkMembership(user.id, "show", show.id);
    reply.status(201);
    return { data: { ok: true } };
  });

  app.get("/api/v1/tv/shows/:slug/favorite", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const { slug } = request.params as { slug: string };
    const show = await showFromSlug(user.id, slug);
    const favorite = await ctx.userState.getFavorite(user.id, "show", show.id);
    return { data: { favorite } };
  });

  app.put("/api/v1/tv/shows/:slug/favorite", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { slug } = request.params as { slug: string };
    const show = await showFromSlug(user.id, slug);
    const body = favoriteUpdateSchema.parse(request.body);
    await ctx.tv.setFavorite(user.id, show.id, body.favorite);
    return { data: { favorite: body.favorite } };
  });

  app.get("/api/v1/tv/shows/:slug/rating", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const { slug } = request.params as { slug: string };
    const show = await showFromSlug(user.id, slug);
    const rating = await ctx.userState.getRating(user.id, "show", show.id);
    return { data: { rating } };
  });

  app.put("/api/v1/tv/shows/:slug/rating", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { slug } = request.params as { slug: string };
    const show = await showFromSlug(user.id, slug);
    const body = ratingUpdateSchema.parse(request.body);
    await ctx.tv.setRating(user.id, show.id, body.rating);
    return { data: { rating: body.rating } };
  });

  app.get("/api/v1/tv/shows/:slug/seasons", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const { slug } = request.params as { slug: string };
    const show = await showFromSlug(user.id, slug);
    const seasons = await ctx.tv.listSeasonsForShow(show.id);
    return {
      data: seasons.map((season) => ctx.tv.toSeasonPublic(season)),
    };
  });

  app.post("/api/v1/tv/shows/:slug/seasons", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_WRITE);
    const { slug } = request.params as { slug: string };
    const show = await showFromSlug(user.id, slug);
    const body = createTvSeasonSchema.parse(request.body);
    const seasonId = await ctx.tv.createSeason(show.id, body);
    const season = await ctx.tv.getSeason(show.id, seasonId);
    reply.status(201);
    return { data: ctx.tv.toSeasonPublic(season) };
  });

  app.get("/api/v1/tv/shows/:slug/s/:seasonNumber", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.TV_READ);
    const { slug, seasonNumber } = z
      .object({
        slug: z.string(),
        seasonNumber: z.coerce.number().int(),
      })
      .parse(request.params);
    const show = await showFromSlug(user.id, slug);
    const season = await seasonFromNumber(show.id, seasonNumber);
    const detail = await ctx.tv.getSeasonDetail(show.id, season.id, user.id);
    return { data: detail };
  });

  app.get(
    "/api/v1/tv/shows/:slug/s/:seasonNumber/e/:episodeNumber",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.TV_READ);
      const { slug, seasonNumber, episodeNumber } = z
        .object({
          slug: z.string(),
          seasonNumber: z.coerce.number().int(),
          episodeNumber: z.coerce.number().int(),
        })
        .parse(request.params);
      const sortOrder = z
        .object({
          sortOrder: z.coerce.number().int().min(0).optional().default(0),
        })
        .parse(request.query).sortOrder;
      await showFromSlug(user.id, slug);
      const { episode } = await ctx.tv.resolveEpisodeByNumbers(
        slug,
        seasonNumber,
        episodeNumber,
        sortOrder,
      );
      const detail = await ctx.tv.getEpisodeDetail(
        episode.showId,
        episode.id,
        user.id,
      );
      return { data: detail };
    },
  );
}
