import type { FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";

export function validateCsrfOrigin(
  request: FastifyRequest,
  appUrl?: string,
): void {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return;

  const origin = request.headers.origin;
  const referer = request.headers.referer;

  const allowedOrigins = new Set<string>();
  if (appUrl) allowedOrigins.add(new URL(appUrl).origin);
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://127.0.0.1:5173");
  allowedOrigins.add("http://localhost:3000");

  if (origin) {
    if (!allowedOrigins.has(origin)) {
      throw new ForbiddenError("Invalid origin");
    }
    return;
  }

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!allowedOrigins.has(refOrigin)) {
        throw new ForbiddenError("Invalid referer");
      }
      return;
    } catch {
      throw new ForbiddenError("Invalid referer");
    }
  }

  if (process.env.NODE_ENV === "production") {
    throw new ForbiddenError("Missing origin header");
  }
}
