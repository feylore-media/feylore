import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { createPool, createDb } from "../db/client.js";
import { bootstrapRbac } from "../db/bootstrap.js";
import { createContext } from "../context.js";
import { bootstrapIngestStorage } from "../modules/ingest/service.js";
import { ensureDefaultMetadataProviders } from "../modules/metadata/ensure-default-providers.js";
import { registerAuthHooks } from "./auth-hooks.js";
import { registerRoutes } from "./routes.js";
import { errorHandler } from "./errors.js";
import multipart from "@fastify/multipart";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  const db = createDb(pool);
  await bootstrapRbac(db);
  const ctx = createContext(config, db);
  await ensureDefaultMetadataProviders(ctx.metadata, ctx.metadataRegistry);
  await ctx.files.loadStorageLocations();
  if (config.NODE_ENV === "production") await ctx.jobs.start();
  await bootstrapIngestStorage(db, config, ctx.files, ctx.libraries);
  await ctx.files.loadStorageLocations();

  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  await app.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === "production",
  });
  await app.register(cors, {
    origin: config.APP_URL ? [config.APP_URL, "http://localhost:5173"] : true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: {
      fileSize: config.MAX_UPLOAD_BYTES,
      files: config.MAX_UPLOAD_FILES,
    },
  });

  registerAuthHooks(app, ctx.auth, config);
  app.setErrorHandler(errorHandler);
  await registerRoutes(app, ctx);

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ok" };
    } catch {
      return reply.status(503).send({ status: "unavailable" });
    }
  });

  if (config.NODE_ENV === "production") {
    const webRoot = path.resolve(__dirname, "../../../web");
    await app.register(fastifyStatic, { root: webRoot, prefix: "/" });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.url.startsWith("/api/") ||
        request.url.startsWith("/health/") ||
        request.method !== "GET" ||
        !request.headers.accept?.includes("text/html")
      ) {
        return reply
          .status(404)
          .send({ error: { code: "NOT_FOUND", message: "Not found" } });
      }
      return reply.sendFile("index.html");
    });
  }

  app.addHook("onClose", async () => {
    await ctx.jobs.stop();
    await pool.end();
  });

  return { app, ctx, pool };
}
