import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  isNotificationType,
  type NotificationPreferenceUpdate,
  type NotificationSettingsUpdate,
  type NotificationType,
} from "../../shared/notifications.js";
import { ValidationError } from "../../shared/errors.js";

export async function registerNotificationsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.get("/api/v1/notifications", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.NOTIFICATIONS_READ_OWN);
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        type: z.string().optional(),
      })
      .parse(request.query);
    const types = query.type && isNotificationType(query.type) ? [query.type] : undefined;
    const result = await ctx.notifications.listForUser(user.id, {
      cursor: query.cursor,
      limit: query.limit,
      types,
    });
    return {
      data: result.items,
      page: { nextCursor: result.nextCursor, prevCursor: null },
    };
  });

  app.get("/api/v1/notifications/unread-count", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.NOTIFICATIONS_READ_OWN);
    const count = await ctx.notifications.unreadCountForUser(user.id);
    return { data: { count } };
  });

  app.post("/api/v1/notifications/read-all", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.NOTIFICATIONS_READ_OWN);
    const updated = await ctx.notifications.markAllRead(user.id);
    return { data: { updated } };
  });

  app.post("/api/v1/notifications/:id/read", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.NOTIFICATIONS_READ_OWN);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ctx.notifications.markRead(user.id, id);
    return { data: { read: true } };
  });

  app.post("/api/v1/notifications/:id/seen", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.NOTIFICATIONS_READ_OWN);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ctx.notifications.markSeen(user.id, id);
    return { data: { seen: true } };
  });

  app.get("/api/v1/settings/notifications", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.NOTIFICATIONS_READ_OWN);
    const settings = await ctx.notifications.getSettings(user.id);
    return { data: { ...settings, emailAvailable: ctx.mail.isConfigured() } };
  });

  app.patch("/api/v1/settings/notifications", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.NOTIFICATIONS_READ_OWN);
    const body = z
      .object({
        preferences: z
          .array(
            z
              .object({
                type: z.string(),
                enabled: z.boolean().optional(),
                emailEnabled: z.boolean().optional(),
              })
              .refine(
                (p) => p.enabled !== undefined || p.emailEnabled !== undefined,
                {
                  message:
                    "Each preference update must set enabled or emailEnabled",
                },
              ),
          )
          .optional(),
        paused: z.boolean().optional(),
      })
      .refine((b) => (b.preferences?.length ?? 0) > 0 || b.paused !== undefined, {
        message: "At least one of preferences or paused is required",
      })
      .parse(request.body as unknown);
    const updates: NotificationSettingsUpdate = {};
    if (body.paused !== undefined) updates.paused = body.paused;
    if (body.preferences) {
      updates.preferences = body.preferences.map((p) => {
        if (!isNotificationType(p.type)) {
          throw new ValidationError(
            `Unknown notification type "${p.type}"`,
          );
        }
        const update: NotificationPreferenceUpdate = {
          type: p.type as NotificationType,
        };
        if (p.enabled !== undefined) update.enabled = p.enabled;
        if (p.emailEnabled !== undefined) update.emailEnabled = p.emailEnabled;
        return update;
      });
    }
    const settings = await ctx.notifications.setSettings(user.id, updates);
    return { data: { ...settings, emailAvailable: ctx.mail.isConfigured() } };
  });

  app.post("/api/v1/admin/notifications", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.NOTIFICATIONS_SEND);
    const body = z
      .object({
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().max(2000).optional(),
        target: z.enum(["admins", "users"]).default("admins"),
      })
      .parse(request.body as unknown);
    await ctx.domainEvents.publish(
      "system.announcement",
      {
        title: body.title,
        body: body.body,
        target: body.target,
      },
      { actorUserId: user.id },
    );
    return { data: { ok: true } };
  });
}