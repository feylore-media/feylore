import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  applicationAppearanceUpdateSchema,
  applicationGeneralUpdateSchema,
  applicationProfilesUpdateSchema,
} from "../../shared/application-config.js";
import { ValidationError } from "../../shared/errors.js";

async function serveBrandingAsset(
  ctx: AppContext,
  kind: "logo" | "favicon",
  reply: FastifyReply,
) {
  const fileId = await ctx.applicationConfig.getBrandingFileId(kind);
  if (!fileId) {
    return reply.status(404).send({
      error: { code: "NOT_FOUND", message: `${kind} not configured` },
    });
  }

  const file = await ctx.files.getFile(fileId);
  const { stream } = await ctx.files.getStream(fileId);
  reply.header("Content-Type", file.mediaType ?? "application/octet-stream");
  reply.header("Content-Length", file.size);
  reply.header("Cache-Control", "public, max-age=3600");
  reply.header("ETag", `"${file.checksum ?? file.id}"`);
  return reply.send(stream);
}

export async function registerApplicationConfigRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.get("/api/v1/instance", async () => {
    const data = await ctx.applicationConfig.getPublicConfig();
    return { data };
  });

  app.get("/api/v1/instance/logo", async (_request, reply) => {
    return serveBrandingAsset(ctx, "logo", reply);
  });

  app.get("/api/v1/instance/favicon", async (_request, reply) => {
    return serveBrandingAsset(ctx, "favicon", reply);
  });

  app.get("/api/v1/admin/system/configuration", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_READ);
    const config = await ctx.applicationConfig.getConfig();
    return { data: ctx.applicationConfig.getGeneral(config) };
  });

  app.patch("/api/v1/admin/system/configuration", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_WRITE);
    const body = applicationGeneralUpdateSchema.parse(request.body);
    const updated = await ctx.applicationConfig.updateGeneral(body);
    await ctx.audit.log(
      user.id,
      "system.application.updated",
      { section: "configuration", changes: Object.keys(body) },
      request.ip,
      "system_settings",
      "application",
    );
    return { data: updated };
  });

  app.get("/api/v1/admin/system/appearance", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_READ);
    const config = await ctx.applicationConfig.getConfig();
    return { data: ctx.applicationConfig.getAppearance(config) };
  });

  app.get("/api/v1/admin/system/profiles", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_READ);
    const config = await ctx.applicationConfig.getConfig();
    return { data: ctx.applicationConfig.getProfiles(config) };
  });

  app.patch("/api/v1/admin/system/appearance", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_WRITE);
    const body = applicationAppearanceUpdateSchema.parse(request.body);
    const updated = await ctx.applicationConfig.updateAppearance(body);
    await ctx.audit.log(
      user.id,
      "system.application.updated",
      { section: "appearance", changes: Object.keys(body) },
      request.ip,
      "system_settings",
      "application",
    );
    return { data: updated };
  });

  app.patch("/api/v1/admin/system/profiles", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_WRITE);
    const body = applicationProfilesUpdateSchema.parse(request.body);
    const updated = await ctx.applicationConfig.updateProfiles(body);
    await ctx.audit.log(
      user.id,
      "system.application.updated",
      { section: "profiles", changes: Object.keys(body) },
      request.ip,
      "system_settings",
      "application",
    );
    return { data: updated };
  });

  app.post("/api/v1/admin/system/appearance/logo", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_WRITE);
    const file = await request.file();
    if (!file) {
      throw new ValidationError("Logo file is required");
    }
    const buffer = await file.toBuffer();
    const updated = await ctx.applicationConfig.uploadLogo(
      buffer,
      file.mimetype,
    );
    await ctx.audit.log(
      user.id,
      "system.application.updated",
      { section: "appearance", action: "logo_upload" },
      request.ip,
      "system_settings",
      "application",
    );
    return { data: updated };
  });

  app.post("/api/v1/admin/system/appearance/favicon", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_WRITE);
    const file = await request.file();
    if (!file) {
      throw new ValidationError("Favicon file is required");
    }
    const buffer = await file.toBuffer();
    const updated = await ctx.applicationConfig.uploadFavicon(
      buffer,
      file.mimetype,
    );
    await ctx.audit.log(
      user.id,
      "system.application.updated",
      { section: "appearance", action: "favicon_upload" },
      request.ip,
      "system_settings",
      "application",
    );
    return { data: updated };
  });

  app.delete("/api/v1/admin/system/appearance/logo", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_WRITE);
    const updated = await ctx.applicationConfig.clearLogo();
    await ctx.audit.log(
      user.id,
      "system.application.updated",
      { section: "appearance", action: "logo_clear" },
      request.ip,
      "system_settings",
      "application",
    );
    return { data: updated };
  });

  app.delete("/api/v1/admin/system/appearance/favicon", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_WRITE);
    const updated = await ctx.applicationConfig.clearFavicon();
    await ctx.audit.log(
      user.id,
      "system.application.updated",
      { section: "appearance", action: "favicon_clear" },
      request.ip,
      "system_settings",
      "application",
    );
    return { data: updated };
  });
}
