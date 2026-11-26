import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import {
  resolveSuggestionSchema,
  setVocabularyAliasesSchema,
  updateVocabularyTermSchema,
  VOCABULARY_KINDS,
  createVocabularyTermSchema,
  metadataFormattingSettingsSchema,
  GENRE_MEDIA_TYPES,
} from "../../shared/metadata-formatting.js";
import {
  createCustomFieldSchema,
  updateCustomFieldSchema,
  reorderCustomFieldsSchema,
  isCustomFieldMediaModule,
  isCustomFieldEntityType,
  CUSTOM_FIELD_GLOBAL_MODULE,
} from "../../shared/custom-metadata-fields.js";
import { ValidationError, NotFoundError } from "../../shared/errors.js";

function parseKind(value: string | undefined) {
  const parsed = z.enum(VOCABULARY_KINDS).safeParse(value);
  if (!parsed.success) throw new ValidationError("Invalid vocabulary kind");
  return parsed.data;
}

function parseCustomFieldScope(query: {
  mediaModule?: string;
  entityType?: string;
}) {
  const mediaModule = query.mediaModule;
  const entityType = query.entityType;
  if (!mediaModule || !isCustomFieldMediaModule(mediaModule)) {
    throw new ValidationError("Invalid media module");
  }
  if (!entityType || !isCustomFieldEntityType(entityType)) {
    throw new ValidationError("Invalid entity type");
  }
  return { mediaModule, entityType };
}

export async function registerFormattingRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  app.get("/api/v1/metadata/formatting/settings", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_READ);
    const settings = await ctx.metadataFormatting.getSettings();
    return { data: settings };
  });

  app.patch("/api/v1/metadata/formatting/settings", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_WRITE);
    const body = metadataFormattingSettingsSchema.partial().parse(request.body);
    const settings = await ctx.metadataFormatting.updateSettings(body);
    return { data: settings };
  });

  app.get("/api/v1/metadata/formatting/terms", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_READ);
    const query = request.query as { kind?: string; mediaType?: string };
    const kind = parseKind(query.kind);
    const mediaType = query.mediaType
      ? z.enum(GENRE_MEDIA_TYPES).parse(query.mediaType)
      : undefined;
    const terms = await ctx.metadataFormatting.listTerms(kind, mediaType);
    return { data: terms };
  });

  app.get("/api/v1/metadata/formatting/terms/search", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_READ);
    const query = request.query as { kind?: string; q?: string };
    const kind = parseKind(query.kind);
    const q = query.q?.trim() ?? "";
    const matches = await ctx.metadataFormatting.searchTerms(kind, q);
    return { data: matches };
  });

  app.post("/api/v1/metadata/formatting/terms", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_WRITE);
    const body = createVocabularyTermSchema.parse(request.body);
    const id = await ctx.metadataFormatting.createTerm(body);
    return { data: { id } };
  });

  app.patch("/api/v1/metadata/formatting/terms/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateVocabularyTermSchema.parse(request.body);
    await ctx.metadataFormatting.updateTerm(id, body);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/metadata/formatting/terms/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await ctx.metadataFormatting.deleteTerm(id);
    return { data: { ok: true } };
  });

  app.put("/api/v1/metadata/formatting/terms/:id/aliases", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = setVocabularyAliasesSchema.parse(request.body);
    await ctx.metadataFormatting.setAliases(id, body.aliases);
    return { data: { ok: true } };
  });

  app.get("/api/v1/metadata/formatting/suggestions", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_READ);
    const query = request.query as { kind?: string; status?: string };
    const kind = parseKind(query.kind);
    const status = z
      .enum(["open", "resolved", "ignored"])
      .default("open")
      .parse(query.status ?? "open");
    const suggestions = await ctx.metadataFormatting.listSuggestions(kind, status);
    return { data: suggestions };
  });

  app.get("/api/v1/metadata/formatting/suggestions/similar", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_READ);
    const query = request.query as { kind?: string; value?: string };
    const kind = parseKind(query.kind);
    const value = query.value?.trim() ?? "";
    const similar = await ctx.metadataFormatting.findSimilarTerms(kind, value);
    return { data: similar };
  });

  app.post("/api/v1/metadata/formatting/suggestions/:id/resolve", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = resolveSuggestionSchema.parse(request.body);
    await ctx.metadataFormatting.resolveSuggestion(id, body.action, body.termId);
    return { data: { ok: true } };
  });

  app.get("/api/v1/metadata/formatting/custom-fields", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_READ);
    const scope = parseCustomFieldScope(request.query as {
      mediaModule?: string;
      entityType?: string;
    });
    const fields = await ctx.customFields.listByScope(
      scope.mediaModule,
      scope.entityType,
    );
    return { data: fields };
  });

  app.post("/api/v1/metadata/formatting/custom-fields", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_WRITE);
    const body = createCustomFieldSchema.parse(request.body);
    const id = await ctx.customFields.create(body);
    reply.status(201);
    return { data: { id } };
  });

  app.patch("/api/v1/metadata/formatting/custom-fields/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await ctx.customFields.getById(id);
    if (!existing) throw new NotFoundError("Custom field not found");
    const body = updateCustomFieldSchema.parse(request.body);
    await ctx.customFields.update(id, body);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/metadata/formatting/custom-fields/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await ctx.customFields.getById(id);
    if (!existing) throw new NotFoundError("Custom field not found");
    await ctx.customFields.delete(id);
    return { data: { ok: true } };
  });

  app.put("/api/v1/metadata/formatting/custom-fields/reorder", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_WRITE);
    const body = reorderCustomFieldsSchema.parse(request.body);
    await ctx.customFields.reorder(
      body.mediaModule,
      body.entityType,
      body.orderedIds,
    );
    return { data: { ok: true } };
  });

  app.get("/api/v1/metadata/formatting/custom-fields/modules", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_FORMATTING_READ);
    const enabledModules = await ctx.systemSettings.getEnabledModules();
    return {
      data: {
        modules: [CUSTOM_FIELD_GLOBAL_MODULE, ...enabledModules],
      },
    };
  });
}
