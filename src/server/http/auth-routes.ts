import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { ForbiddenError } from "../../shared/errors.js";
import { usernameSchema } from "../../shared/username.js";
import * as schema from "../db/schema.js";

const AUTH_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: "1 minute",
    },
  },
};

function setSessionCookie(
  reply: FastifyReply,
  ctx: AppContext,
  token: string,
  expiresAt: Date,
) {
  reply.setCookie(ctx.auth.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: ctx.config.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

function loginRedirectUrl(appUrl: string | undefined, error: string): string {
  const base = appUrl?.replace(/\/$/, "") ?? "http://localhost:5173";
  return `${base}/login?auth_error=${encodeURIComponent(error)}`;
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/v1/auth/setup-required", async () => {
    const count = await ctx.auth.userCount();
    return { data: { required: count === 0 } };
  });

  app.get("/api/v1/auth/methods", async () => ({
    data: {
      ...ctx.authPolicy.getMethodsResponse(),
      passwordReset: ctx.mail.isConfigured(),
    },
  }));

  app.post(
    "/api/v1/auth/setup",
    AUTH_RATE_LIMIT,
    async (request, reply) => {
      const body = z
        .object({
          email: z.string().email(),
          username: usernameSchema,
          displayName: z.string().min(1),
          password: z.string().min(8),
        })
        .parse(request.body);

      const session = await ctx.auth.setup({
        ...body,
        locale: await ctx.applicationConfig.getDefaultLocale(),
      });
      setSessionCookie(reply, ctx, session.token, session.expiresAt);
      const user = await ctx.auth.resolveSession(session.token);
      return { data: { user } };
    },
  );

  app.post(
    "/api/v1/auth/login",
    AUTH_RATE_LIMIT,
    async (request, reply) => {
      if (!ctx.authPolicy.canPasswordLoginGlobally()) {
        throw new ForbiddenError("Password login is disabled");
      }

      const body = z
        .object({
          email: z.string().email(),
          password: z.string(),
          deviceId: z.string().uuid().optional(),
        })
        .parse(request.body);

      const dbUser = await ctx.db.query.users.findFirst({
        where: eq(schema.users.email, body.email),
      });
      if (
        !dbUser ||
        !ctx.authPolicy.canUserPasswordLogin({ passwordHash: dbUser.passwordHash })
      ) {
        throw new ForbiddenError("Password login is not available for this account");
      }

      const session = await ctx.auth.login(body.email, body.password, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
        deviceId: body.deviceId,
      });
      setSessionCookie(reply, ctx, session.token, session.expiresAt);
      const user = await ctx.auth.resolveSession(session.token);
      return { data: { user } };
    },
  );

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = request.cookies[ctx.auth.cookieName];
    if (token) await ctx.auth.logout(token);
    reply.clearCookie(ctx.auth.cookieName, { path: "/" });
    return { data: { ok: true } };
  });

  app.get("/api/v1/auth/me", async (request) => {
    if (!request.user) return { data: { user: null } };
    const hasPassword = await ctx.auth.userHasPassword(request.user.id);
    const row = await ctx.db.query.users.findFirst({
      where: eq(schema.users.id, request.user.id),
    });
    return {
      data: {
        user: {
          id: request.user.id,
          email: request.user.email,
          username: request.user.username,
          displayName: request.user.displayName,
          locale: request.user.locale,
          theme: (() => {
            const t = row?.theme;
            if (t === "light" || t === "dark" || t === "system") return t;
            return "system";
          })(),
          permissions: [...request.user.permissions],
          roleNames: request.user.roleNames,
          hasPassword,
        },
        profile: row ? await ctx.profiles.getSelfProfile(row) : null,
      },
    };
  });

  app.post("/api/v1/auth/password", async (request) => {
    const user = requireAuth(request);
    const body = z
      .object({
        currentPassword: z.string().optional(),
        newPassword: z.string().min(8),
      })
      .parse(request.body);

    const hasPassword = await ctx.auth.userHasPassword(user.id);
    if (!hasPassword && !ctx.authPolicy.canSetPassword()) {
      throw new ForbiddenError("Setting a local password is disabled");
    }

    await ctx.auth.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
    return { data: { ok: true } };
  });

  app.get("/api/v1/auth/sessions", async (request) => {
    const user = requireAuth(request);
    const sessions = await ctx.auth.listSessions(user.id, user.sessionId);
    return { data: sessions };
  });

  app.delete("/api/v1/auth/sessions/:id", async (request, reply) => {
    const user = requireAuth(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ctx.auth.revokeSession(user.id, id);
    if (id === user.sessionId) {
      reply.clearCookie(ctx.auth.cookieName, { path: "/" });
    }
    return { data: { ok: true } };
  });

  app.delete("/api/v1/auth/sessions", async (request) => {
    const user = requireAuth(request);
    const query = z
      .object({ others: z.enum(["true", "false"]).optional() })
      .parse(request.query ?? {});
    if (query.others === "true") {
      await ctx.auth.revokeOtherSessions(user.id, user.sessionId);
    }
    return { data: { ok: true } };
  });

  app.post(
    "/api/v1/auth/password-reset/request",
    AUTH_RATE_LIMIT,
    async (request) => {
      const body = z.object({ email: z.string().email() }).parse(request.body);
      await ctx.passwordReset.requestReset(body.email);
      return { data: { ok: true } };
    },
  );

  app.post(
    "/api/v1/auth/password-reset/confirm",
    AUTH_RATE_LIMIT,
    async (request) => {
      const body = z
        .object({
          token: z.string().min(1),
          newPassword: z.string().min(8),
        })
        .parse(request.body);
      await ctx.passwordReset.confirmReset(body.token, body.newPassword);
      return { data: { ok: true } };
    },
  );

  if (ctx.oidc) {
    const oidc = ctx.oidc;

    app.get(
      "/api/v1/auth/oidc/login",
      AUTH_RATE_LIMIT,
      async (request, reply) => {
        if (!ctx.authPolicy.isOidcLoginEnabled()) {
          throw new ForbiddenError("OIDC login is disabled");
        }
        const returnTo =
          typeof request.query === "object" &&
          request.query !== null &&
          "return_to" in request.query &&
          typeof request.query.return_to === "string"
            ? request.query.return_to
            : "/";
        const url = await oidc.startLogin({ mode: "login", returnTo });
        return reply.redirect(url);
      },
    );

    app.get(
      "/api/v1/auth/oidc/callback",
      AUTH_RATE_LIMIT,
      async (request, reply) => {
        if (!ctx.authPolicy.isOidcLoginEnabled()) {
          return reply.redirect(
            loginRedirectUrl(ctx.config.APP_URL, "OIDC login is disabled"),
          );
        }

        const errorParam =
          typeof request.query === "object" &&
          request.query !== null &&
          "error" in request.query &&
          typeof request.query.error === "string"
            ? request.query.error
            : null;
        if (errorParam) {
          return reply.redirect(
            loginRedirectUrl(ctx.config.APP_URL, errorParam),
          );
        }

        try {
          const callbackUrl = new URL(
            request.url,
            ctx.config.APP_URL ?? "http://localhost:3000",
          );
          const result = await oidc.handleCallback(callbackUrl, {
            userAgent: request.headers["user-agent"],
            ip: request.ip,
          });
          setSessionCookie(
            reply,
            ctx,
            result.session.token,
            result.session.expiresAt,
          );
          const appBase = ctx.config.APP_URL?.replace(/\/$/, "") ?? "";
          const destination = result.returnTo.startsWith("/")
            ? `${appBase}${result.returnTo}`
            : result.returnTo;
          return reply.redirect(destination || `${appBase}/`);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "OIDC authentication failed";
          return reply.redirect(loginRedirectUrl(ctx.config.APP_URL, message));
        }
      },
    );

    app.post("/api/v1/auth/oidc/link", async (request) => {
      const user = requireAuth(request);
      if (!ctx.authPolicy.isOidcLoginEnabled()) {
        throw new ForbiddenError("OIDC is not configured");
      }
      const url = await oidc.startLogin({
        mode: "link",
        userId: user.id,
        returnTo: "/settings/account",
      });
      return { data: { url } };
    });

    app.delete("/api/v1/auth/oidc/link", async (request) => {
      const user = requireAuth(request);
      const body = z
        .object({ providerKey: z.string().default("default") })
        .parse(request.body ?? {});
      await oidc.unlinkIdentity(user.id, body.providerKey);
      return { data: { ok: true } };
    });

    app.get("/api/v1/auth/identities", async (request) => {
      const user = requireAuth(request);
      const identities = await oidc.listIdentities(user.id);
      return { data: identities };
    });
  }
}
