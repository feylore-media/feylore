import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { UnauthorizedError, ValidationError } from "../../shared/errors.js";
import {
  profileBioSchema,
  profileVisibilitySchema,
} from "../../shared/profile.js";
import { usernameSchema } from "../../shared/username.js";

export function registerProfileRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/v1/profiles/:username", async (request) => {
    const { username } = z
      .object({ username: z.string().min(1) })
      .parse(request.params);

    const viewerId = request.user?.id ?? null;
    if (!viewerId) {
      throw new UnauthorizedError("Sign in to view profiles");
    }

    const profile = await ctx.profiles.getPublicProfile(username, viewerId);
    return { data: profile };
  });

  app.get("/api/v1/auth/me/profile", async (request) => {
    const user = requireAuth(request);
    const row = await ctx.db.query.users.findFirst({
      where: (u, { eq: eqFn }) => eqFn(u.id, user.id),
    });
    if (!row) throw new UnauthorizedError("User not found");
    return { data: await ctx.profiles.getSelfProfile(row) };
  });

  app.patch("/api/v1/auth/me", async (request) => {
    const user = requireAuth(request);
    const body = z
      .object({
        displayName: z.string().min(1).optional(),
        locale: z.enum(["en", "en-GB", "fr", "de"]).optional(),
        bio: profileBioSchema,
        profileVisibility: profileVisibilitySchema.optional(),
        avatarFileId: z.string().uuid().nullable().optional(),
        profileJson: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    const updated = await ctx.profiles.updateProfile(user.id, body);
    if (!updated) throw new UnauthorizedError("User not found");

    const sessionUser = await ctx.auth.resolveSession(
      request.cookies[ctx.auth.cookieName],
    );
    const hasPassword = await ctx.auth.userHasPassword(user.id);
    return {
      data: {
        user: sessionUser ? { ...sessionUser, hasPassword } : null,
        profile: await ctx.profiles.getSelfProfile(updated),
      },
    };
  });

  app.patch("/api/v1/auth/me/username", async (request) => {
    const user = requireAuth(request);
    const body = z
      .object({ username: usernameSchema })
      .parse(request.body);

    const updated = await ctx.profiles.changeUsername(user.id, body.username);
    if (!updated) throw new UnauthorizedError("User not found");

    const sessionUser = await ctx.auth.resolveSession(
      request.cookies[ctx.auth.cookieName],
    );
    const hasPassword = await ctx.auth.userHasPassword(user.id);
    return {
      data: {
        user: sessionUser ? { ...sessionUser, hasPassword } : null,
        profile: await ctx.profiles.getSelfProfile(updated),
      },
    };
  });

  app.post("/api/v1/auth/me/avatar", async (request) => {
    const user = requireAuth(request);
    const file = await request.file();
    if (!file) {
      throw new ValidationError("Avatar file is required");
    }

    const buffer = await file.toBuffer();
    const fileId = await ctx.profiles.uploadAvatar(
      user.id,
      buffer,
      file.mimetype,
    );
    const row = await ctx.db.query.users.findFirst({
      where: (u, { eq: eqFn }) => eqFn(u.id, user.id),
    });
    if (!row) throw new UnauthorizedError("User not found");

    return {
      data: {
        avatarFileId: fileId,
        avatarUrl: ctx.profiles.selfAvatarUrl(fileId),
        profile: await ctx.profiles.getSelfProfile(row),
      },
    };
  });

  app.get("/api/v1/auth/me/avatar", async (request, reply) => {
    const user = requireAuth(request);
    const row = await ctx.db.query.users.findFirst({
      where: (u, { eq: eqFn }) => eqFn(u.id, user.id),
    });
    if (!row?.avatarFileId) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Avatar not found" },
      });
    }

    const file = await ctx.files.getFile(row.avatarFileId);
    const { stream } = await ctx.files.getStream(row.avatarFileId);
    reply.header("Content-Type", file.mediaType ?? "application/octet-stream");
    reply.header("Content-Length", file.size);
    reply.header("Cache-Control", "private, max-age=300");
    return reply.send(stream);
  });
}
