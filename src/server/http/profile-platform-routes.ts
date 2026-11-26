import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { NotFoundError, UnauthorizedError } from "../../shared/errors.js";
import {
  extendedProfileUpdateSchema,
  guestbookEntryInputSchema,
  obsessionInputSchema,
  obsessionReorderSchema,
  profileArtifactInputSchema,
  profileArtifactPatchSchema,
  profileArtifactReorderSchema,
  profileLinkInputSchema,
  profileLinkReorderSchema,
} from "../../shared/profile-platform.js";
import {
  buildProfileCardView,
  buildViewerProfileView,
  filterFollowListForViewer,
} from "../modules/profiles/view.js";
import { normalizeProfileCosmetics } from "../../shared/profile-cosmetics.js";

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
});

export function registerProfilePlatformRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  const deps = () => ({
    db: ctx.db,
    profiles: ctx.profiles,
    platform: ctx.profilePlatform,
    goals: ctx.goals,
    achievements: ctx.achievements,
  });

  // Viewer-aware full profile. Authenticated Feylore surface only.
  app.get("/api/v1/profiles/:username/full", async (request) => {
    const viewer = requireAuth(request);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    return { data: await buildViewerProfileView(deps(), username, viewer) };
  });

  // Lightweight identity card for hover/focus previews. Identity only —
  // no activity or contextual event data. Same visibility gate as `/full`.
  app.get("/api/v1/profiles/:username/card", async (request) => {
    const viewer = requireAuth(request);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    return { data: await buildProfileCardView(deps(), username, viewer.id) };
  });

  // Extended self profile (pronouns, banner, appearance, guestbook pref)
  app.get("/api/v1/profiles/me/extended", async (request) => {
    const viewer = requireAuth(request);
    const row = await ctx.profilePlatform.getProfileRow(viewer.id);
    const links = await ctx.profilePlatform.listLinks(viewer.id);
    const artifacts = await ctx.profilePlatform.listArtifacts(viewer.id);
    const obsessions = await ctx.profilePlatform.listObsessions(viewer.id);
    return { data: { profile: row, links, artifacts, obsessions } };
  });

  app.patch("/api/v1/profiles/me", async (request) => {
    const viewer = requireAuth(request);
    const body = extendedProfileUpdateSchema.parse(request.body);
    // Banner must reference an existing file the user can read; file service
    // enforces storage containment and opaque IDs.
    if (body.bannerFileId) {
      await ctx.files.getFile(body.bannerFileId);
    }
    const updated = await ctx.profilePlatform.updateExtendedProfile(
      viewer.id,
      body,
    );
    return { data: updated };
  });

  // ---- Links ----
  app.get("/api/v1/profiles/me/links", async (request) => {
    const viewer = requireAuth(request);
    return { data: await ctx.profilePlatform.listLinks(viewer.id) };
  });

  app.post("/api/v1/profiles/me/links", async (request, reply) => {
    const viewer = requireAuth(request);
    const body = profileLinkInputSchema.parse(request.body);
    const created = await ctx.profilePlatform.addLink(
      viewer.id,
      body.label,
      body.url,
    );
    reply.status(201);
    return { data: created };
  });

  app.patch("/api/v1/profiles/me/links/:linkId", async (request) => {
    const viewer = requireAuth(request);
    const { linkId } = z
      .object({ linkId: z.string().uuid() })
      .parse(request.params);
    const body = profileLinkInputSchema.parse(request.body);
    const updated = await ctx.profilePlatform.updateLink(
      viewer.id,
      linkId,
      body.label,
      body.url,
    );
    if (!updated) throw new NotFoundError("Link not found");
    return { data: updated };
  });

  app.delete("/api/v1/profiles/me/links/:linkId", async (request, reply) => {
    const viewer = requireAuth(request);
    const { linkId } = z
      .object({ linkId: z.string().uuid() })
      .parse(request.params);
    await ctx.profilePlatform.deleteLink(viewer.id, linkId);
    reply.status(204);
    return null;
  });

  app.put("/api/v1/profiles/me/links/reorder", async (request) => {
    const viewer = requireAuth(request);
    const body = profileLinkReorderSchema.parse(request.body);
    return {
      data: await ctx.profilePlatform.reorderLinks(viewer.id, body.orderedIds),
    };
  });

  // ---- Follows ----
  app.post("/api/v1/profiles/:username/follow", async (request) => {
    const viewer = requireAuth(request);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    const target = await ctx.profiles.findByUsername(username);
    if (!target) throw new NotFoundError("Profile not found");
    // Follow target must itself be viewable; private profiles cannot be followed blindly.
    const canView = await ctx.profiles.canViewProfileAsync(target, viewer.id);
    if (!canView) throw new NotFoundError("Profile not found");
    return { data: await ctx.profilePlatform.follow(viewer.id, target.id) };
  });

  app.delete("/api/v1/profiles/:username/follow", async (request) => {
    const viewer = requireAuth(request);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    const target = await ctx.profiles.findByUsername(username);
    if (!target) throw new NotFoundError("Profile not found");
    return { data: await ctx.profilePlatform.unfollow(viewer.id, target.id) };
  });

  app.get("/api/v1/profiles/:username/followers", async (request) => {
    const viewer = requireAuth(request);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    const query = paginationSchema.parse(request.query);
    const target = await ctx.profiles.findByUsername(username);
    if (!target) throw new NotFoundError("Profile not found");
    const canView = await ctx.profiles.canViewProfileAsync(target, viewer.id);
    if (!canView) throw new NotFoundError("Profile not found");
    const rows = await ctx.profilePlatform.listFollowers(
      target.id,
      query.limit,
      query.offset,
    );
    return { data: await filterFollowListForViewer(deps(), viewer.id, rows) };
  });

  app.get("/api/v1/profiles/:username/following", async (request) => {
    const viewer = requireAuth(request);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    const query = paginationSchema.parse(request.query);
    const target = await ctx.profiles.findByUsername(username);
    if (!target) throw new NotFoundError("Profile not found");
    const canView = await ctx.profiles.canViewProfileAsync(target, viewer.id);
    if (!canView) throw new NotFoundError("Profile not found");
    const rows = await ctx.profilePlatform.listFollowing(
      target.id,
      query.limit,
      query.offset,
    );
    return { data: await filterFollowListForViewer(deps(), viewer.id, rows) };
  });

  // ---- Obsessions ----
  app.get("/api/v1/profiles/me/obsessions", async (request) => {
    const viewer = requireAuth(request);
    return { data: await ctx.profilePlatform.listObsessions(viewer.id) };
  });

  app.post("/api/v1/profiles/me/obsessions", async (request, reply) => {
    const viewer = requireAuth(request);
    const body = obsessionInputSchema.parse(request.body);
    const created = await ctx.profilePlatform.addObsession(
      viewer.id,
      body.targetType,
      body.targetId,
      body.note ?? null,
    );
    reply.status(201);
    return { data: created };
  });

  app.patch("/api/v1/profiles/me/obsessions/:id", async (request) => {
    const viewer = requireAuth(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({ note: z.string().max(140).nullable() })
      .parse(request.body);
    return {
      data: await ctx.profilePlatform.updateObsession(viewer.id, id, body.note),
    };
  });

  app.delete("/api/v1/profiles/me/obsessions/:id", async (request, reply) => {
    const viewer = requireAuth(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ctx.profilePlatform.deleteObsession(viewer.id, id);
    reply.status(204);
    return null;
  });

  app.put("/api/v1/profiles/me/obsessions/reorder", async (request) => {
    const viewer = requireAuth(request);
    const body = obsessionReorderSchema.parse(request.body);
    return {
      data: await ctx.profilePlatform.reorderObsessions(
        viewer.id,
        body.orderedIds,
      ),
    };
  });

  // ---- Artifacts ----
  app.get("/api/v1/profiles/me/artifacts", async (request) => {
    const viewer = requireAuth(request);
    return { data: await ctx.profilePlatform.listArtifacts(viewer.id) };
  });

  app.post("/api/v1/profiles/me/artifacts", async (request, reply) => {
    const viewer = requireAuth(request);
    const body = profileArtifactInputSchema.parse(request.body);
    const created = await ctx.profilePlatform.addArtifact(
      viewer.id,
      body.artifactType,
      body.config,
      body.size,
      body.isVisible,
    );
    reply.status(201);
    return { data: created };
  });

  app.patch("/api/v1/profiles/me/artifacts/:id", async (request) => {
    const viewer = requireAuth(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = profileArtifactPatchSchema.parse(request.body);
    return {
      data: await ctx.profilePlatform.patchArtifact(viewer.id, id, body),
    };
  });

  app.delete("/api/v1/profiles/me/artifacts/:id", async (request, reply) => {
    const viewer = requireAuth(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ctx.profilePlatform.deleteArtifact(viewer.id, id);
    reply.status(204);
    return null;
  });

  app.put("/api/v1/profiles/me/artifacts/reorder", async (request) => {
    const viewer = requireAuth(request);
    const body = profileArtifactReorderSchema.parse(request.body);
    return {
      data: await ctx.profilePlatform.reorderArtifacts(
        viewer.id,
        body.orderedIds,
      ),
    };
  });

  // ---- Guestbook ----
  app.get("/api/v1/profiles/:username/guestbook", async (request) => {
    const viewer = requireAuth(request);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    const query = paginationSchema.parse(request.query);
    const target = await ctx.profiles.findByUsername(username);
    if (!target) throw new NotFoundError("Profile not found");
    const canView = await ctx.profiles.canViewProfileAsync(target, viewer.id);
    if (!canView) throw new NotFoundError("Profile not found");
    const rows = await ctx.profilePlatform.listGuestbook(
      target.id,
      query.limit,
      query.offset,
    );
    return {
      data: rows.map((r) => ({
        id: r.entry.id,
        body: r.entry.body,
        authorUsername: r.author.username,
        authorDisplayName: r.author.displayName,
        authorAvatarUrl: ctx.profiles.avatarUrl(r.author.avatarFileId),
        authorCosmetics: normalizeProfileCosmetics(r.authorCosmetics),
        isOwn: r.entry.authorUserId === viewer.id,
        createdAt: r.entry.createdAt.toISOString(),
        updatedAt: r.entry.updatedAt.toISOString(),
      })),
    };
  });

  app.post("/api/v1/profiles/:username/guestbook", async (request, reply) => {
    const viewer = requireAuth(request);
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);
    const body = guestbookEntryInputSchema.parse(request.body);
    const target = await ctx.profiles.findByUsername(username);
    if (!target) throw new NotFoundError("Profile not found");
    const canView = await ctx.profiles.canViewProfileAsync(target, viewer.id);
    if (!canView) throw new NotFoundError("Profile not found");
    const created = await ctx.profilePlatform.postGuestbook(
      target.id,
      viewer.id,
      body.body,
    );
    if (!created) throw new NotFoundError("Entry not found");
    reply.status(201);
    return { data: created };
  });

  app.patch("/api/v1/profiles/guestbook/:entryId", async (request) => {
    const viewer = requireAuth(request);
    const { entryId } = z
      .object({ entryId: z.string().uuid() })
      .parse(request.params);
    const body = guestbookEntryInputSchema.parse(request.body);
    return {
      data: await ctx.profilePlatform.editGuestbookEntry(
        entryId,
        viewer.id,
        body.body,
      ),
    };
  });

  app.delete("/api/v1/profiles/guestbook/:entryId", async (request, reply) => {
    const viewer = requireAuth(request);
    const { entryId } = z
      .object({ entryId: z.string().uuid() })
      .parse(request.params);
    await ctx.profilePlatform.deleteGuestbookEntry(entryId, viewer.id);
    reply.status(204);
    return null;
  });

  // Banner upload (mirrors avatar upload; managed storage only)
  app.post("/api/v1/profiles/me/banner", async (request) => {
    const viewer = requireAuth(request);
    const file = await request.file();
    if (!file) throw new UnauthorizedError("Banner file is required");
    const buffer = await file.toBuffer();
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
    if (!allowed.has(file.mimetype)) {
      const { ValidationError: VE } = await import("../../shared/errors.js");
      throw new VE("Banner must be a JPEG, PNG, WebP, or GIF image");
    }
    if (buffer.length > 4 * 1024 * 1024) {
      const { ValidationError: VE } = await import("../../shared/errors.js");
      throw new VE("Banner must be 4 MB or smaller");
    }
    const storageLocationId = await ctx.files.getManagedStorageLocationId();
    if (!storageLocationId) {
      const { ValidationError: VE } = await import("../../shared/errors.js");
      throw new VE("Managed storage is not configured");
    }
    const ext =
      file.mimetype === "image/jpeg"
        ? ".jpg"
        : file.mimetype === "image/png"
          ? ".png"
          : file.mimetype === "image/webp"
            ? ".webp"
            : ".gif";
    const { generateId: genId } = await import("../security/crypto.js");
    const { default: path } = await import("node:path");
    const relativePath = path.posix.join(
      "banners",
      viewer.id,
      `${genId()}${ext}`,
    );
    const fileId = await ctx.files.storeDerivedFile({
      storageLocationId,
      relativePath,
      data: buffer,
      mediaType: file.mimetype,
    });
    await ctx.profilePlatform.updateExtendedProfile(viewer.id, {
      bannerFileId: fileId,
    });
    return {
      data: {
        bannerFileId: fileId,
        bannerUrl: ctx.profilePlatform.bannerUrl(fileId),
      },
    };
  });

  // Keep TS happy about unused import in some builds
  void eq;
}
