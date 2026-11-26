import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  createIngestRootSchema,
  updateIngestRootSchema,
  updateLibrarySchema,
  ingestItemListQuerySchema,
} from "../../shared/ingest.js";
import {
  toIngestItemDetail,
  toIngestItemSummary,
} from "../modules/ingest/item-service.js";
import { generateId } from "../security/crypto.js";
import { NotFoundError, AppError } from "../../shared/errors.js";

export async function registerIngestRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/v1/ingest/upload-limits", async () => ({
    data: ctx.ingest.getUploadLimits(),
  }));

  app.get("/api/v1/ingest/items", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.INGEST_READ);
    const query = ingestItemListQuerySchema.parse(request.query);
    const result = await ctx.ingest.items.list({
      status: query.status,
      terminalState: query.terminalState,
      processing: query.processing,
      limit: query.limit,
      cursor: query.cursor,
    });
    return {
      data: result.data.map(toIngestItemSummary),
      page: { nextCursor: result.nextCursor },
    };
  });

  app.get("/api/v1/ingest/items/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.INGEST_READ);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const item = await ctx.ingest.items.getById(id);
    if (!item) throw new NotFoundError("Ingest item not found");
    return { data: toIngestItemDetail(item) };
  });

  app.post("/api/v1/ingest/items/:id/retry", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.INGEST_RETRY);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const item = await ctx.ingest.items.retry(id);
    if (!item) throw new NotFoundError("Ingest item cannot be retried");
    await ctx.ingest.enqueueProcess(item.id);
    reply.status(202);
    return { data: { id: item.id } };
  });

  app.post("/api/v1/ingest/upload", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.INGEST_WRITE);

    const limits = ctx.ingest.getUploadLimits();
    const parts = request.parts();
    const uploadId = generateId();
    const itemIds: string[] = [];
    let fileCount = 0;

    await ctx.files.loadStorageLocations();
    const storageLocationId = await ctx.files.getManagedStorageLocationId();
    if (!storageLocationId) {
      throw new AppError(
        "STORAGE_NOT_CONFIGURED",
        "No managed storage is configured. Set STORAGE_ROOT (and restart the API) or add a managed storage location.",
        503,
      );
    }

    for await (const part of parts) {
      if (part.type !== "file") continue;
      fileCount++;
      if (fileCount > limits.maxUploadFiles) {
        throw new Error(`Upload exceeds maximum of ${limits.maxUploadFiles} files`);
      }

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of part.file) {
        size += chunk.length;
        if (size > limits.maxUploadBytes) {
          throw new Error("Upload exceeds maximum file size for browser upload");
        }
        chunks.push(chunk);
      }

      const data = Buffer.concat(chunks);
      const stored = await ctx.ingest.storeUploadFile({
        uploadId,
        filename: part.filename,
        data,
        storageLocationId,
      });

      const result = await ctx.ingest.reconcileUpload({
        uploadId,
        storageLocationId,
        relativePath: stored.relativePath,
        originalFilename: stored.safeName,
        size: stored.size,
        checksum: stored.checksum,
        userId: user.id,
      });
      itemIds.push(result.item.id);
    }

    if (fileCount === 0) {
      throw new AppError("VALIDATION_ERROR", "No files received in upload", 400);
    }

    reply.status(202);
    return { data: { uploadId, ingestItemIds: itemIds } };
  });

  app.get("/api/v1/ingest/roots", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.INGEST_READ);
    const rows = await ctx.ingest.listRoots();
    return { data: rows };
  });

  app.post("/api/v1/ingest/roots", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.INGEST_WRITE);
    const body = createIngestRootSchema.parse(request.body);
    let defaultLibraryId = body.defaultLibraryId;
    if (!defaultLibraryId) {
      const library = await ctx.libraries.getDefaultBookLibrary();
      defaultLibraryId = library?.id;
    }
    const id = await ctx.ingest.createRoot({
      ...body,
      defaultLibraryId,
    });
    reply.status(201);
    return { data: { id } };
  });

  app.patch("/api/v1/ingest/roots/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.INGEST_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateIngestRootSchema.parse(request.body);
    await ctx.ingest.updateRoot(id, body);
    return { data: { id } };
  });

  app.delete("/api/v1/ingest/roots/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.INGEST_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ctx.ingest.deleteRoot(id);
    return { data: { id } };
  });

  app.patch("/api/v1/libraries/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.LIBRARIES_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateLibrarySchema.parse(request.body);
    await ctx.libraries.update(id, body);
    return { data: { id } };
  });

  app.post("/api/v1/libraries/:id/scan", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.STORAGE_SCAN);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const storageLocationId = await ctx.libraries.scanLibrary(id);
    const jobId = await ctx.jobs.enqueue("library.scan", {
      storageLocationId,
      userId: user.id,
      libraryId: id,
    });
    reply.status(202);
    return { data: { jobId, kind: "library_scan" } };
  });

  app.post("/api/v1/libraries/:id/validate", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.LIBRARIES_READ);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await ctx.libraries.validate(id);
    return { data: result };
  });
}
