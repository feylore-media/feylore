import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import type { AuthUser } from "../modules/authorization/service.js";
import { UnauthorizedError } from "../../shared/errors.js";
import { validateCsrfOrigin } from "../security/csrf.js";
import type { AppConfig } from "../config.js";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export function registerAuthHooks(
  app: FastifyInstance,
  authService: AuthService,
  config: AppConfig,
) {
  app.addHook("preHandler", async (request) => {
    const token = request.cookies[authService.cookieName];
    const session = await authService.resolveSession(token);
    request.user = session
      ? {
          id: session.id,
          email: session.email,
          username: session.username,
          displayName: session.displayName,
          locale: session.locale,
          permissions: session.permissions,
          roleNames: session.roleNames,
          sessionId: session.sessionId,
        }
      : null;
  });

  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/api/")) {
      validateCsrfOrigin(request, config.APP_URL);
    }
  });
}

export function requireAuth(request: FastifyRequest): AuthUser {
  if (!request.user) throw new UnauthorizedError();
  return request.user;
}
