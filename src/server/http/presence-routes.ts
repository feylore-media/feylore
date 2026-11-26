import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { NotFoundError } from "../../shared/errors.js";
import {
  presenceEndSchema,
  presenceHeartbeatSchema,
  presencePolicyUpdateSchema,
  presencePreferencesUpdateSchema,
  presenceStartSchema,
  presenceTouchSchema,
} from "../../shared/presence.js";
import { PERMISSIONS } from "../../shared/permissions.js";

function toPublicSession(row: {
  id: string;
  kind: string;
  workType: string;
  workId: string;
  expressionId: string | null;
  manifestationId: string | null;
  representationId: string | null;
  source: string;
  sourceInstance: string | null;
  startedAt: Date;
  lastEngagedAt: Date;
  lastHeartbeatAt: Date | null;
  endedAt: Date | null;
  metadata: unknown;
}) {
  return {
    id: row.id,
    kind: row.kind,
    workType: row.workType,
    workId: row.workId,
    expressionId: row.expressionId,
    manifestationId: row.manifestationId,
    representationId: row.representationId,
    source: row.source,
    sourceInstance: row.sourceInstance,
    startedAt: row.startedAt.toISOString(),
    lastEngagedAt: row.lastEngagedAt.toISOString(),
    lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    metadata: row.metadata ?? {},
  };
}

export function registerPresenceRoutes(app: FastifyInstance, ctx: AppContext) {
  // Internal producer API: Feylore Reader uses start/touch/end;
  // audio/video players use start/heartbeat/end.
  app.post("/api/v1/presence/start", async (request, reply) => {
    const user = requireAuth(request);
    const body = presenceStartSchema.parse(request.body);
    const session = await ctx.presence.startPresence(user.id, body);
    reply.status(201);
    return { data: toPublicSession(session) };
  });

  app.post("/api/v1/presence/touch", async (request) => {
    const user = requireAuth(request);
    const body = presenceTouchSchema.parse(request.body);
    const session = await ctx.presence.touchPresence(user.id, body.sessionId, body.metadata);
    return { data: toPublicSession(session) };
  });

  app.post("/api/v1/presence/heartbeat", async (request) => {
    const user = requireAuth(request);
    const body = presenceHeartbeatSchema.parse(request.body);
    const session = await ctx.presence.heartbeatPresence(user.id, body.sessionId, body.metadata);
    return { data: toPublicSession(session) };
  });

  app.post("/api/v1/presence/end", async (request) => {
    const user = requireAuth(request);
    const body = presenceEndSchema.parse(request.body);
    const session = await ctx.presence.endPresence(user.id, body.sessionId);
    return { data: toPublicSession(session) };
  });

  app.get("/api/v1/presence/me", async (request) => {
    const user = requireAuth(request);
    const presence = await ctx.presence.resolvePresenceForViewer(user.id, user.id);
    const active = await ctx.presence.listActiveForViewer(user.id, user.id);
    return { data: { presence, active } };
  });

  // Profile presence: enforced server-side (profile visibility + presence prefs).
  app.get("/api/v1/profiles/:username/presence", async (request) => {
    const { username } = z.object({ username: z.string().min(1) }).parse(request.params);
    const viewerId = request.user?.id ?? null;
    if (!viewerId) {
      throw new NotFoundError("Profile not found");
    }
    const profileUser = await ctx.profiles.findByUsername(username);
    if (!profileUser) throw new NotFoundError("Profile not found");
    const canView = await ctx.profiles.canViewProfileAsync(profileUser, viewerId);
    if (!canView) throw new NotFoundError("Profile not found");
    const presence = await ctx.presence.resolvePresenceForViewer(profileUser.id, viewerId);
    if (!presence) return { data: null };
    return { data: presence };
  });

  // User settings: presence is separate from profile/activity privacy.
  app.get("/api/v1/settings/presence", async (request) => {
    const user = requireAuth(request);
    const prefs = await ctx.presence.getPreferences(user.id);
    return { data: prefs };
  });

  app.patch("/api/v1/settings/presence", async (request) => {
    const user = requireAuth(request);
    const body = presencePreferencesUpdateSchema.parse(request.body);
    const prefs = await ctx.presence.updatePreferences(user.id, body);
    return { data: prefs };
  });

  // Admin policy (small): enabled flag + timeouts. Heartbeat frequency is an
  // implementation contract, not an admin preference.
  app.get("/api/v1/admin/system/presence", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_READ);
    const policy = await ctx.presence.getPolicy();
    return { data: policy };
  });

  app.patch("/api/v1/admin/system/presence", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_WRITE);
    const body = presencePolicyUpdateSchema.parse(request.body);
    const policy = await ctx.presence.updatePolicy(body);
    return { data: policy };
  });
}
