import type { FastifyInstance } from "fastify";
import path from "node:path";
import { z } from "zod";
import { eq, inArray, and, asc, desc } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { registerAuthRoutes } from "./auth-routes.js";
import { registerProfileRoutes } from "./profile-routes.js";
import { registerProfilePlatformRoutes } from "./profile-platform-routes.js";
import { registerStatsRoutes } from "./stats-routes.js";
import { PERMISSIONS, ROLE_NAMES } from "../../shared/permissions.js";
import { usernameSchema } from "../../shared/username.js";
import {
  ForbiddenError,
  ValidationError,
  AppError,
} from "../../shared/errors.js";
import { generateId } from "../security/crypto.js";
import * as schema from "../db/schema.js";
import {
  listStorageLocationsForAdmin,
  patchStorageLocation,
} from "../modules/storage/admin-service.js";
import {
  bookListQuerySchema,
  createBookSchema,
  updateBookSchema,
  setAuthorsSchema,
  setGenresSchema,
  setSeriesSchema,
  fieldOverrideSchema,
  updateBookMetadataFieldsSchema,
  progressUpdateSchema,
  ratingUpdateSchema,
  favoriteUpdateSchema,
  bookmarkCreateSchema,
  annotationCreateSchema,
  annotationUpdateSchema,
  relationshipCreateSchema,
  bookImportSchema,
  physicalHoldingCreateSchema,
  physicalHoldingIdentifySchema,
  physicalHoldingIsbnSchema,
  physicalHoldingsQuerySchema,
} from "../../shared/books.js";
import {
  audiobookListQuerySchema,
  createAudiobookSchema,
  updateAudiobookSchema,
  setAuthorsSchema as setAudiobookAuthorsSchema,
  setNarratorsSchema,
  setGenresSchema as setAudiobookGenresSchema,
  setSeriesSchema as setAudiobookSeriesSchema,
  ratingUpdateSchema as audiobookRatingUpdateSchema,
  favoriteUpdateSchema as audiobookFavoriteUpdateSchema,
  relationshipCreateSchema as audiobookRelationshipCreateSchema,
  audiobookImportSchema,
} from "../../shared/audiobooks.js";
import {
  relatedGroupsQuerySchema,
  relationshipEntityTypeSchema,
} from "../../shared/relationships.js";
import {
  albumListQuerySchema,
  createAlbumSchema,
  updateAlbumSchema,
  setAlbumArtistsSchema,
  setAlbumGenresSchema,
  favoriteUpdateSchema as musicFavoriteUpdateSchema,
  musicImportSchema,
  createPlaylistSchema,
  updatePlaylistSchema,
  playlistTrackMutationSchema,
  playlistReorderSchema,
} from "../../shared/music.js";
import {
  movieListQuerySchema,
  createMovieSchema,
  updateMovieSchema,
  setMovieGenresSchema,
  setMovieCreditsSchema,
  createMovieCollectionSchema,
  updateMovieCollectionSchema,
  movieCollectionMembershipSchema,
  movieCollectionReorderSchema,
  favoriteUpdateSchema as movieFavoriteUpdateSchema,
  ratingUpdateSchema as movieRatingUpdateSchema,
  movieImportSchema,
} from "../../shared/movies.js";
import {
  subscribePodcastSchema,
  podcastListQuerySchema,
  podcastEpisodeListQuerySchema,
} from "../../shared/podcasts.js";
import {
  shelfItemOrderSchema,
  shelfItemRefSchema,
  createShelfSchema,
  updateShelfSchema,
  shelfEditorsSchema,
} from "../../shared/shelves.js";
import {
  goalCreateSchema,
  goalUpdateSchema,
  GOAL_RULE_FIELDS,
} from "../../shared/goals.js";
import { listGoalCapabilities } from "../../shared/goal-registry.js";
import { isShelfScopeId } from "../../shared/shelf-scopes.js";
import {
  readerSettingsUpdateSchema,
  playbackSettingsUpdateSchema,
  appearanceSettingsUpdateSchema,
  privacySettingsUpdateSchema,
} from "../../shared/settings.js";
import { metadataSettingsUpdateSchema } from "../../shared/metadata-edition-preference.js";
import {
  playbackProgressQuerySchema,
  playbackProgressUpdateSchema,
  playbackHistoryQuerySchema,
} from "../../shared/playback.js";
import {
  MEDIA_MODULE_IDS,
  isMediaModuleId,
} from "../../shared/media-modules.js";
import {
  FEATURE_MODULE_IDS,
  isFeatureModuleId,
} from "../../shared/feature-modules.js";
import {
  updateFieldPrioritiesSchema,
  updateMatchingRulesSchema,
  updateMetadataPersistenceSchema,
  providerConfigPatchSchema,
  providerConfigTestSchema,
} from "../../shared/metadata-settings.js";
import { setCustomFieldValuesSchema } from "../../shared/custom-metadata-fields.js";
import {
  FIELD_GROUP_LABELS,
  FIELD_GROUP_ORDER,
  getCanonicalFieldsForModule,
  type CanonicalFieldId,
} from "../../shared/metadata-fields.js";
import { isBookUserFacingField } from "../../shared/book-metadata-field-kinds.js";
import { isPersonUserFacingField } from "../../shared/person-metadata-field-kinds.js";
import {
  setPersonMetadataFieldsSchema,
  setPersonFieldLockSchema,
  personLinkInputSchema,
  updatePersonIdentitySchema,
  personProviderIdentifierSchema,
  mergePeopleSchema,
} from "../../shared/person-metadata-editor.js";
import { METADATA_PROVIDER_CONTRACT } from "../../shared/metadata-contract/index.js";
import { NotFoundError } from "../../shared/errors.js";
import { ACTIVITY_TYPES } from "../../shared/activity.js";
import { JOB_TYPES } from "../modules/jobs/types.js";
import {
  buildBookMetadataEditor,
  resolveAdoptSourceCategory,
} from "../modules/metadata/book-metadata-editor.js";
import { reextractBookImportedMetadata } from "../modules/metadata/book-reextract-metadata.js";
import { getPeopleBySlug } from "../modules/people/identity.js";
import { buildPersonMetadataEditor } from "../modules/people/person-metadata-editor.js";
import { adoptPersonPhoto } from "../modules/people/person-photo.js";
import { registerIngestRoutes } from "./ingest-routes.js";
import { registerProcessingRoutes } from "./processing-routes.js";
import { registerFormattingRoutes } from "./formatting-routes.js";
import { registerTvRoutes } from "./tv-routes.js";
import { registerClubsRoutes } from "./clubs-routes.js";
import { registerCalendarRoutes } from "./calendar-routes.js";
import { registerApplicationConfigRoutes } from "./application-config-routes.js";
import { registerReadingProgressRoutes } from "./reading-progress-routes.js";
import { registerReadingActivityRoutes } from "./reading-activity-routes.js";
import { registerReadingSessionRoutes } from "./reading-session-routes.js";
import { registerRatingsRoutes } from "./ratings-routes.js";
import { registerRatingConfigRoutes } from "./rating-config-routes.js";
import { registerPresenceRoutes } from "./presence-routes.js";
import { registerNotificationsRoutes } from "./notifications-routes.js";
import { registerAchievementsRoutes } from "./achievements-routes.js";
import { registerChallengesRoutes } from "./challenges-routes.js";
import { ensureProgressSyncEnabled } from "../modules/reading-progress/sync-preference.js";

export async function registerRoutes(app: FastifyInstance, ctx: AppContext) {
  async function bookFromSlug(userId: string, slug: string) {
    const book = await ctx.books.getBookByRef(slug);
    await ctx.books.ensureUserAccess(userId, book.id);
    return book;
  }

  async function personProviderPayload(personId: string, sourceKey: string) {
    const record = await ctx.db.query.metadataRecords.findFirst({
      where: and(
        eq(schema.metadataRecords.subjectType, "person"),
        eq(schema.metadataRecords.subjectId, personId),
        eq(schema.metadataRecords.providerKey, sourceKey),
      ),
      orderBy: desc(schema.metadataRecords.fetchedAt),
    });
    if (!record) throw new ValidationError("Provider evidence is unavailable");
    return record.payload;
  }

  async function audiobookFromSlug(userId: string, slug: string) {
    const audiobook = await ctx.audiobooks.getAudiobookByRef(slug);
    await ctx.audiobooks.ensureUserAccess(userId, audiobook.id);
    return audiobook;
  }

  async function ensureRelationshipTargetAccess(
    userId: string,
    targetType: string,
    targetId: string,
  ) {
    const type = relationshipEntityTypeSchema.parse(targetType);
    if (type === "book") {
      await ctx.books.ensureUserAccess(userId, targetId);
      return;
    }
    await ctx.audiobooks.ensureUserAccess(userId, targetId);
  }

  async function albumFromSlug(userId: string, slug: string) {
    const album = await ctx.music.getAlbumByRef(slug);
    await ctx.music.ensureUserAccess(userId, album.id);
    return album;
  }

  async function movieFromSlug(userId: string, slug: string) {
    const movie = await ctx.movies.getMovieByRef(slug);
    await ctx.movies.ensureUserAccess(userId, movie.id);
    return movie;
  }

  async function artistFromSlug(userId: string, slug: string) {
    const artist = await ctx.music.getArtistByRef(slug);
    const memberships = await ctx.libraryMembership.listForUser(
      userId,
      "album",
    );
    const albumIds = memberships.map((m) => m.targetId);
    if (albumIds.length === 0) {
      throw new ForbiddenError("Artist not in your library");
    }
    const rows = await ctx.db
      .select({ albumId: schema.albumArtists.albumId })
      .from(schema.albumArtists)
      .where(
        and(
          eq(schema.albumArtists.artistId, artist.id),
          inArray(schema.albumArtists.albumId, albumIds),
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      throw new ForbiddenError("Artist not in your library");
    }
    return artist;
  }

  app.get("/api/v1/health", async () => ({ data: { status: "ok" } }));

  registerAuthRoutes(app, ctx);
  registerProfileRoutes(app, ctx);
  registerProfilePlatformRoutes(app, ctx);
  registerStatsRoutes(app, ctx);

  app.get("/api/v1/roles", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.ROLES_READ);
    const rows = await ctx.roleAdmin.listRolesWithPermissions();
    return { data: rows };
  });

  app.get("/api/v1/roles/:name", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.ROLES_READ);
    const { name } = request.params as { name: string };
    const row = await ctx.roleAdmin.getRole(name);
    return { data: row };
  });

  app.put("/api/v1/roles/:name/permissions", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.ROLES_WRITE);
    const { name } = request.params as { name: string };
    const body = z
      .object({
        permissions: z.array(z.string()),
      })
      .parse(request.body);
    const row = await ctx.roleAdmin.setRolePermissions(name, body.permissions);
    return { data: row };
  });

  app.get("/api/v1/permissions", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.ROLES_READ);
    const rows = await ctx.db.select().from(schema.permissions);
    return { data: rows };
  });

  app.get("/api/v1/users", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.USERS_READ);
    const rows = await ctx.userAdmin.listUsers();
    return { data: rows };
  });

  app.get("/api/v1/users/search", async (request) => {
    const user = requireAuth(request);
    const { q } = request.query as { q?: string };
    const results = await ctx.shelves.searchUsers(user, q ?? "");
    return { data: results };
  });

  app.get("/api/v1/users/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.USERS_READ);
    const { id } = request.params as { id: string };
    const row = await ctx.userAdmin.getUser(id);
    return { data: row };
  });

  app.post("/api/v1/users", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.USERS_WRITE);
    const body = z
      .object({
        email: z.string().email(),
        username: usernameSchema,
        displayName: z.string().min(1),
        password: z.string().min(8).optional(),
        roleNames: z.array(z.string()).default(["member"]),
      })
      .parse(request.body);

    const isDefaultMemberOnly =
      body.roleNames.length === 1 && body.roleNames[0] === ROLE_NAMES.MEMBER;
    if (!isDefaultMemberOnly) {
      ctx.authz.require(user, PERMISSIONS.USERS_ROLES_ASSIGN);
    }

    const result = await ctx.userAdmin.createUser(
      {
        email: body.email,
        username: body.username,
        displayName: body.displayName,
        password: body.password,
        roleNames: body.roleNames,
      },
      user.id,
    );
    return { data: result };
  });

  app.patch("/api/v1/users/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.USERS_WRITE);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        email: z.string().email().optional(),
        username: usernameSchema.optional(),
        displayName: z.string().min(1).optional(),
        password: z.string().min(8).optional(),
      })
      .parse(request.body);
    const row = await ctx.userAdmin.updateUser(id, body, user.id);
    return { data: row };
  });

  app.post("/api/v1/users/:id/disable", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.USERS_WRITE);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        disabled: z.boolean(),
      })
      .parse(request.body);
    const row = await ctx.userAdmin.setDisabled(id, body.disabled, user.id);
    return { data: row };
  });

  app.delete("/api/v1/users/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.USERS_WRITE);
    const { id } = request.params as { id: string };
    const _body = z
      .object({
        confirm: z.literal(true),
      })
      .parse(request.body ?? {});
    void _body;
    await ctx.userAdmin.deleteUser(id, user.id);
    return { data: { deleted: true } };
  });

  app.put("/api/v1/users/:id/roles", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.USERS_ROLES_ASSIGN);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        roleNames: z.array(z.string()).min(1),
      })
      .parse(request.body);
    const result = await ctx.userAdmin.setUserRoles(
      id,
      body.roleNames,
      user.id,
    );
    return { data: result };
  });

  app.get("/api/v1/libraries", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.LIBRARIES_READ);
    const rows = await ctx.db.select().from(schema.libraries);
    return { data: rows };
  });

  app.post("/api/v1/libraries", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.LIBRARIES_WRITE);
    const body = z
      .object({
        name: z.string(),
        description: z.string().optional(),
        intendedDomain: z.string().optional(),
        contentType: z.enum(["book"]).optional(),
        enabled: z.boolean().optional(),
        storageLocationId: z.string().uuid().optional(),
        organizationPolicy: z
          .object({
            mode: z.enum(["in_place", "managed"]),
            template: z.string().optional(),
          })
          .optional(),
        normalizationPolicy: z
          .object({
            epub: z
              .object({
                enabled: z.boolean(),
                target: z.literal("epub-3.3"),
              })
              .optional(),
          })
          .optional(),
        supportedFormats: z.array(z.string()).optional(),
      })
      .parse(request.body);
    const id = await ctx.libraries.create({
      name: body.name,
      description: body.description,
      contentType: body.contentType,
      enabled: body.enabled,
      storageLocationId: body.storageLocationId,
      organizationPolicy: body.organizationPolicy,
      normalizationPolicy: body.normalizationPolicy,
      supportedFormats: body.supportedFormats,
    });
    return { data: { id } };
  });

  app.get("/api/v1/storage/locations", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.STORAGE_READ);
    const rows = await listStorageLocationsForAdmin(ctx.db, ctx.files);
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        rootPath: row.rootPath,
        watchEnabled: row.watchEnabled,
        createdAt: row.createdAt.toISOString(),
        health: row.health,
      })),
    };
  });

  app.patch("/api/v1/storage/locations/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.STORAGE_WRITE);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        watchEnabled: z.boolean().optional(),
      })
      .parse(request.body);
    await patchStorageLocation(ctx.db, id, body);
    await ctx.files.loadStorageLocations();
    await ctx.audit.log(
      user.id,
      "storage.updated",
      { resourceId: id },
      request.ip,
    );
    return { data: { id } };
  });

  app.post("/api/v1/storage/locations", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.STORAGE_WRITE);
    const body = z
      .object({
        name: z.string(),
        kind: z.enum(["managed", "external", "read_only"]),
        rootPath: z.string(),
        watchEnabled: z.boolean().optional(),
      })
      .parse(request.body);
    const id = generateId();
    const resolvedRoot = path.resolve(body.rootPath);
    await ctx.db.insert(schema.storageLocations).values({
      id,
      name: body.name,
      kind: body.kind,
      rootPath: resolvedRoot,
      watchEnabled: body.watchEnabled ?? false,
    });
    await ctx.audit.log(
      user.id,
      "storage.created",
      { resourceId: id },
      request.ip,
    );
    return { data: { id } };
  });

  app.post("/api/v1/storage/scans", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.STORAGE_SCAN);
    const body = z
      .object({ storageLocationId: z.string().uuid() })
      .parse(request.body);
    const jobId = await ctx.jobs.enqueue("library.scan", {
      storageLocationId: body.storageLocationId,
      userId: user.id,
    });
    reply.status(202);
    return { data: { jobId } };
  });

  app.post("/api/v1/storage/associations", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const body = z
      .object({
        storageLocationId: z.string().uuid().optional(),
        fileIds: z.array(z.string().uuid()).optional(),
      })
      .parse(request.body);
    const jobId = await ctx.jobs.enqueue("library.associate", {
      storageLocationId: body.storageLocationId,
      fileIds: body.fileIds,
      userId: user.id,
    });
    reply.status(202);
    return { data: { jobId } };
  });

  app.get("/api/v1/settings/reader", async (request) => {
    const user = requireAuth(request);
    const settings = await ctx.settings.getReaderSettings(user.id);
    return { data: settings };
  });

  app.patch("/api/v1/settings/reader", async (request) => {
    const user = requireAuth(request);
    const body = readerSettingsUpdateSchema.parse(request.body);
    const settings = await ctx.settings.updateReaderSettings(user.id, body);
    return { data: settings };
  });

  app.get("/api/v1/settings/playback", async (request) => {
    const user = requireAuth(request);
    const settings = await ctx.settings.getPlaybackSettings(user.id);
    return { data: settings };
  });

  app.patch("/api/v1/settings/playback", async (request) => {
    const user = requireAuth(request);
    const body = playbackSettingsUpdateSchema.parse(request.body);
    const settings = await ctx.settings.updatePlaybackSettings(user.id, body);
    return { data: settings };
  });

  app.get("/api/v1/settings/appearance", async (request) => {
    const user = requireAuth(request);
    const settings = await ctx.settings.getAppearanceSettings(user.id);
    return { data: settings };
  });

  app.patch("/api/v1/settings/appearance", async (request) => {
    const user = requireAuth(request);
    const body = appearanceSettingsUpdateSchema.parse(request.body);
    const settings = await ctx.settings.updateAppearanceSettings(user.id, body);
    return { data: settings };
  });

  app.get("/api/v1/settings/privacy", async (request) => {
    const user = requireAuth(request);
    const settings = await ctx.settings.getPrivacySettings(user.id);
    return { data: settings };
  });

  app.patch("/api/v1/settings/privacy", async (request) => {
    const user = requireAuth(request);
    const body = privacySettingsUpdateSchema.parse(request.body);
    const settings = await ctx.settings.updatePrivacySettings(user.id, body);
    return { data: settings };
  });

  app.get("/api/v1/settings/metadata", async (request) => {
    const user = requireAuth(request);
    const settings = await ctx.settings.getMetadataSettings(user.id);
    return { data: settings };
  });

  app.patch("/api/v1/settings/metadata", async (request) => {
    const user = requireAuth(request);
    const body = metadataSettingsUpdateSchema.parse(request.body);
    const settings = await ctx.settings.updateMetadataSettings(user.id, body);
    return { data: settings };
  });

  app.get("/api/v1/admin/system/modules", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_READ);
    const modules = await ctx.systemSettings.listModulesWithState();
    return { data: modules };
  });

  app.patch("/api/v1/admin/system/modules", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SYSTEM_SETTINGS_WRITE);
    const body = z
      .object({
        enabled: z
          .array(z.enum([...MEDIA_MODULE_IDS, ...FEATURE_MODULE_IDS]))
          .min(1),
      })
      .parse(request.body);
    // Media and feature module toggles persist independently; partitioning
    // here keeps metadata configuration isolated from feature policy.
    const mediaEnabled = body.enabled.filter(isMediaModuleId);
    const featureEnabled = body.enabled.filter(isFeatureModuleId);
    const [media, features] = await Promise.all([
      ctx.systemSettings.setEnabledModules(mediaEnabled),
      ctx.systemSettings.setEnabledFeatureModules(featureEnabled),
    ]);
    return { data: { enabled: [...media, ...features] } };
  });

  app.get("/api/v1/books", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const query = bookListQuerySchema.parse(request.query);
    const result = await ctx.books.listBooksForUser(user.id, query);
    return {
      data: result.items,
      page: { nextCursor: result.nextCursor ?? null, prevCursor: null },
    };
  });

  app.post("/api/v1/books", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const body = createBookSchema.parse(request.body);
    const id = await ctx.books.createBook(body);
    await ctx.libraryMembership.ensureWorkMembership(user.id, "book", id);
    const book = await ctx.books.getBook(id);
    reply.status(201);
    return {
      data: {
        id: book.id,
        slug: book.slug,
        slugStatus: book.slugStatus,
      },
    };
  });

  app.get("/api/v1/books/authors", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const authors = await ctx.books.listAuthorsForUser(user.id);
    return { data: authors };
  });

  app.get("/api/v1/books/series", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const series = await ctx.books.listSeries();
    return {
      data: series.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
      })),
    };
  });

  app.get("/api/v1/books/series/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { id } = request.params as { id: string };
    const currentSlug = (request.query as { current?: string }).current;
    const detail = await ctx.books.getSeriesDetail(id, user.id, currentSlug);
    return { data: detail };
  });

  app.get("/api/v1/books/physical-holdings", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const query = physicalHoldingsQuerySchema.parse(request.query);
    const holdings = await ctx.physicalHoldings.listForUser(user.id, {
      withoutDigital: query.withoutDigital === true,
    });
    return { data: holdings };
  });

  // Barcode-scan entry point (no scanner UI in V1): resolve an ISBN to a
  // manifestation/Work, then mark it owned. Idempotent; reconciles an
  // existing edition-unknown holding for the same Work.
  app.post(
    "/api/v1/books/physical-holdings/by-isbn",
    async (request, reply) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
      const body = physicalHoldingIsbnSchema.parse(request.body);
      const { holding, created } = await ctx.physicalHoldings.markOwnedByIsbn(
        user.id,
        body.isbn,
      );
      reply.status(created ? 201 : 200);
      return { data: holding };
    },
  );

  app.post("/api/v1/books/import", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const body = bookImportSchema.parse(request.body);
    const defaultLibrary = await ctx.libraries.getDefaultBookLibrary();
    const ingestItemIds: string[] = [];
    for (const fileId of body.fileIds) {
      const file = await ctx.files.getFile(fileId);
      const result = await ctx.ingest.items.reconcileDiscovered({
        sourceKind: "filesystem",
        sourceIdentity: `legacy:${fileId}`,
        sourcePath: file.relativePath,
        sourceStorageLocationId: file.storageLocationId,
        originalFilename:
          file.relativePath.split("/").pop() ?? file.relativePath,
        sourceChecksum: file.checksum,
        sourceSize: file.size,
        submittedByUserId: user.id,
        targetLibraryId: defaultLibrary?.id,
      });
      await ctx.ingest.enqueueProcess(result.item.id);
      ingestItemIds.push(result.item.id);
    }
    reply.status(202);
    return { data: { ingestItemIds } };
  });

  app.get("/api/v1/books/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const detail = await ctx.books.getBookDetail(book.id, user.id);
    const related = await ctx.relationships.getRelated(
      user.id,
      { type: "book", id: book.id },
      ["semantic"],
      { limit: 50, cursor: 0 },
    );
    const semantic = related.semantic as {
      items: Array<{
        relationshipId: string;
        relationshipType: string;
        type: string;
        id: string;
        title: string;
        slug: string;
        href: string;
      }>;
    };
    const relationships = semantic.items.map((item) => ({
      id: item.relationshipId,
      targetType: item.type,
      targetId: item.id,
      relationshipType: item.relationshipType,
      targetTitle: item.title,
      targetSlug: item.slug,
      targetHref: item.href,
    }));
    return { data: { ...detail, relationships } };
  });

  app.patch("/api/v1/books/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = updateBookSchema.parse(request.body);
    await ctx.books.updateBook(book.id, body);
    if (body.authors) await ctx.books.setAuthors(book.id, body.authors);
    if (body.genres) await ctx.books.setGenres(book.id, body.genres);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/books/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    await ctx.books.deleteBook(book.id);
    return { data: { ok: true } };
  });

  // Destructive-action summary consumed by deletion confirmation before
  // DELETE. Reports files, manifestations, physical holdings/users, Journal
  // data, reviews, and relationships.
  app.get("/api/v1/books/:slug/deletion-preview", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const preview = await ctx.books.getDeletionPreview(book.id);
    return { data: preview };
  });

  // Physical ownership is separate from library membership: holding endpoints
  // resolve the Work without requiring a membership row.
  app.get("/api/v1/books/:slug/physical-holding", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await ctx.books.getBookByRef(slug);
    const holding = await ctx.physicalHoldings.getForUser(user.id, book.id);
    return { data: holding };
  });

  app.post("/api/v1/books/:slug/physical-holding", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await ctx.books.getBookByRef(slug);
    const body = physicalHoldingCreateSchema.parse(request.body ?? {});
    const { holding, created } = await ctx.physicalHoldings.markOwned(
      user.id,
      book.id,
      body.manifestationId,
    );
    reply.status(created ? 201 : 200);
    return { data: holding };
  });

  app.patch("/api/v1/books/:slug/physical-holding", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await ctx.books.getBookByRef(slug);
    const body = physicalHoldingIdentifySchema.parse(request.body);
    const holding = await ctx.physicalHoldings.identifyEdition(
      user.id,
      book.id,
      body.manifestationId,
    );
    return { data: holding };
  });

  app.delete("/api/v1/books/:slug/physical-holding", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await ctx.books.getBookByRef(slug);
    await ctx.physicalHoldings.removeOwnership(user.id, book.id);
    return { data: { ok: true } };
  });

  app.post("/api/v1/books/:slug/membership", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await ctx.books.getBookByRef(slug);
    await ctx.libraryMembership.ensureWorkMembership(user.id, "book", book.id);
    reply.status(201);
    return { data: { ok: true } };
  });

  app.put("/api/v1/books/:slug/authors", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = setAuthorsSchema.parse(request.body);
    await ctx.books.setAuthors(book.id, body.authors);
    return { data: { ok: true } };
  });

  app.put("/api/v1/books/:slug/genres", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = setGenresSchema.parse(request.body);
    await ctx.books.setGenres(book.id, body.genres);
    return { data: { ok: true } };
  });

  app.put("/api/v1/books/:slug/series", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = setSeriesSchema.parse(request.body);
    await ctx.books.setSeries(book.id, body.seriesId, body.position);
    return { data: { ok: true } };
  });

  app.patch("/api/v1/books/:slug/metadata", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = fieldOverrideSchema.parse(request.body);
    if (body.field.startsWith("custom.")) {
      throw new ValidationError(
        "Use the custom-fields endpoint for custom metadata fields",
      );
    }
    const customDefs = await ctx.customFields.listByScope("books", "item");
    if (customDefs.some((d) => d.key === body.field)) {
      throw new ValidationError(
        "Use the custom-fields endpoint for custom metadata fields",
      );
    }
    if (
      !getCanonicalFieldsForModule("books").some((f) => f.id === body.field)
    ) {
      throw new ValidationError("Unknown canonical metadata field");
    }
    if (!isBookUserFacingField(body.field as CanonicalFieldId)) {
      throw new ValidationError("This metadata field is not user-editable");
    }
    let canonicalValue = body.value;
    if (body.field === "cover" && body.sourceKey) {
      const coverUrl = z
        .string()
        .trim()
        .url()
        .max(2048)
        .refine((value) => {
          const protocol = new URL(value).protocol;
          return protocol === "https:" || protocol === "http:";
        }, "Cover URL must use HTTP or HTTPS")
        .parse(body.value);
      const target = await ctx.books.getMetadataIngestTarget(book.id);
      if (!target) {
        throw new ValidationError(
          "No file representation is available for cover artwork",
        );
      }
      const coverFileId = await ctx.coverPipeline.fetchAndStoreCoverFromUrl({
        bookId: book.id,
        representationId: target.representationId,
        coverUrl,
        replaceExisting: true,
      });
      if (!coverFileId) {
        throw new ValidationError("The selected cover could not be imported");
      }
      canonicalValue = coverFileId;
    } else if (body.field === "cover") {
      canonicalValue = z.string().uuid().parse(body.value);
    }
    await ctx.metadataCanonical.setCanonicalField({
      subjectType: "book",
      subjectId: book.id,
      field: body.field,
      value: canonicalValue,
      userId: user.id,
      provenance: {
        sourceKey: body.sourceKey ?? "feylore",
        sourceCategory: body.sourceKey
          ? resolveAdoptSourceCategory(body.sourceKey, ctx.metadataRegistry)
          : "canonical",
        origin: body.sourceKey ? "adopt" : "edit",
      },
      lock: true,
    });
    return { data: { ok: true } };
  });

  app.patch("/api/v1/books/:slug/metadata/fields", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = updateBookMetadataFieldsSchema.parse(request.body);
    await ctx.metadataCanonical.setBookFieldsFromEdit(
      book.id,
      user.id,
      body.fields,
    );
    return { data: { ok: true } };
  });

  app.get("/api/v1/books/:slug/metadata/editor", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const editor = await buildBookMetadataEditor(
      ctx.db,
      ctx.metadata,
      ctx.metadataPolicy,
      ctx.metadataProvenance,
      ctx.metadataRegistry,
      ctx.books,
      book.id,
    );
    return { data: editor };
  });

  app.delete("/api/v1/books/:slug/metadata/:field", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug, field } = request.params as { slug: string; field: string };
    const book = await bookFromSlug(user.id, slug);
    if (field.startsWith("custom.")) {
      throw new ValidationError(
        "Use the custom-fields endpoint for custom metadata fields",
      );
    }
    if (!getCanonicalFieldsForModule("books").some((f) => f.id === field)) {
      throw new ValidationError("Unknown canonical metadata field");
    }
    await ctx.metadata.clearOverride("book", book.id, field);
    return { data: { ok: true } };
  });

  app.post("/api/v1/books/:slug/metadata/reextract", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const target = await ctx.books.getMetadataIngestTarget(book.id);
    if (!target) {
      reply.status(404);
      return {
        error: {
          message:
            "No file representation available for metadata re-extraction",
        },
      };
    }
    const result = await reextractBookImportedMetadata(
      ctx.files,
      ctx.metadata,
      ctx.metadataPolicy,
      ctx.metadataCanonical,
      ctx.metadataRegistry,
      ctx.books,
      book.id,
      [target.fileId],
    );
    return { data: { log: result.log } };
  });

  app.post("/api/v1/books/:slug/metadata/fetch", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const target = await ctx.books.getMetadataIngestTarget(book.id);
    if (!target) {
      reply.status(404);
      return {
        error: {
          message: "No file representation available for metadata fetch",
        },
      };
    }
    const existingJobId = await ctx.jobs.findActiveMetadataIngestJobForBook(
      book.id,
    );
    const jobId =
      existingJobId ??
      (await ctx.jobs.enqueue(
        JOB_TYPES.METADATA_INGEST,
        {
          fileId: target.fileId,
          bookId: book.id,
          representationId: target.representationId,
          manifestationId: target.manifestationId,
          userId: user.id,
          mode: "providers_only",
        },
        { singletonKey: `book-metadata-fetch:${book.id}` },
      ));
    reply.status(202);
    return { data: { jobId } };
  });

  app.get("/api/v1/books/:slug/custom-fields", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const values = await ctx.customFields.getValuesForSubjectWithGlobal(
      "books",
      "item",
      book.id,
    );
    return { data: values };
  });

  app.patch("/api/v1/books/:slug/custom-fields", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = setCustomFieldValuesSchema.parse(request.body);
    const values = await ctx.customFields.patchValues(
      "books",
      "item",
      book.id,
      body.values,
      user.id,
    );
    return { data: values };
  });

  app.get("/api/v1/books/series/:id/custom-fields", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { id } = request.params as { id: string };
    const values = await ctx.customFields.getValuesForSubject(
      "books",
      "series",
      id,
    );
    return { data: values };
  });

  app.patch("/api/v1/books/series/:id/custom-fields", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { id } = request.params as { id: string };
    const body = setCustomFieldValuesSchema.parse(request.body);
    const values = await ctx.customFields.patchValues(
      "books",
      "series",
      id,
      body.values,
      user.id,
    );
    return { data: values };
  });

  app.get("/api/v1/books/:slug/relationships", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const rows = await ctx.relationships.listForSource("book", book.id);
    return { data: rows.map((r) => ctx.relationships.toPublic(r)) };
  });

  app.get("/api/v1/books/:slug/related", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const query = relatedGroupsQuerySchema.parse(request.query);
    const data = await ctx.relationships.getRelated(
      user.id,
      { type: "book", id: book.id },
      query.groups,
      { limit: query.limit, cursor: query.cursor },
    );
    return { data };
  });

  app.post("/api/v1/books/:slug/relationships", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = relationshipCreateSchema.parse(request.body);
    await ensureRelationshipTargetAccess(
      user.id,
      body.targetType,
      body.targetId,
    );
    const relId = await ctx.relationships.create({
      sourceType: "book",
      sourceId: book.id,
      ...body,
    });
    reply.status(201);
    return { data: { id: relId } };
  });

  app.delete("/api/v1/books/:slug/relationships/:relId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const { relId } = request.params as { relId: string };
    await ctx.relationships.remove(relId, { type: "book", id: book.id });
    return { data: { ok: true } };
  });

  app.get("/api/v1/books/:slug/favorite", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const favorite = await ctx.userState.getFavorite(user.id, "book", book.id);
    return { data: { favorite } };
  });

  app.put("/api/v1/books/:slug/favorite", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = favoriteUpdateSchema.parse(request.body);
    await ctx.userState.setFavorite(user.id, "book", book.id, body.favorite);
    await ctx.activity.record(
      user.id,
      body.favorite
        ? ACTIVITY_TYPES.BOOK_FAVORITED
        : ACTIVITY_TYPES.BOOK_UNFAVORITED,
      {
        subjectType: "book",
        subjectId: book.id,
        payload: { title: book.title, slug: book.slug },
      },
    );
    return { data: { favorite: body.favorite } };
  });

  app.get("/api/v1/books/:slug/rating", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const rating = await ctx.userState.getRating(user.id, "book", book.id);
    return { data: { rating } };
  });

  app.put("/api/v1/books/:slug/rating", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = ratingUpdateSchema.parse(request.body);
    await ctx.userState.setRating(user.id, "book", book.id, body.rating);
    await ctx.activity.record(
      user.id,
      body.rating === null
        ? ACTIVITY_TYPES.BOOK_RATING_CLEARED
        : ACTIVITY_TYPES.BOOK_RATED,
      {
        subjectType: "book",
        subjectId: book.id,
        payload: { title: book.title, slug: book.slug, rating: body.rating },
      },
    );
    return { data: { rating: body.rating } };
  });

  app.get("/api/v1/books/:slug/progress", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const primary = await ctx.readingProgress.getPrimaryProgressForWork(
      user.id,
      "book",
      book.id,
    );
    if (!primary) return { data: null };
    return {
      data: {
        locator: primary.progress.locator,
        representationId: primary.representationId,
        updatedAt: primary.progress.updatedAt,
      },
    };
  });

  app.put("/api/v1/books/:slug/progress", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    await ensureProgressSyncEnabled(ctx.db, user.id);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = progressUpdateSchema.parse(request.body);
    if (!body.representationId) {
      throw new ValidationError("representationId is required");
    }
    await ctx.books.ensureRepresentationAccess(user.id, body.representationId);
    const previous = await ctx.readingProgress.getPrimaryProgressForWork(
      user.id,
      "book",
      book.id,
    );
    const result = await ctx.readingProgress.setProgress(
      user.id,
      body.representationId,
      body,
    );
    if (!result.accepted) {
      throw new AppError("STALE_PROGRESS", "Stale progress", 409, {
        current: result.current,
      });
    }
    await ctx.userState.addHistory(
      user.id,
      "book",
      book.id,
      "progress_updated",
      {
        locator: body.locator,
      },
    );

    const bookPayload = { title: book.title, slug: book.slug };
    if (!previous) {
      await ctx.activity.record(user.id, ACTIVITY_TYPES.BOOK_READING_STARTED, {
        subjectType: "book",
        subjectId: book.id,
        payload: bookPayload,
      });
    }

    const finished =
      (body.locator.totalProgression ?? body.locator.progression ?? 0) >= 0.99;
    if (finished) {
      await ctx.activity.record(user.id, ACTIVITY_TYPES.BOOK_READING_FINISHED, {
        subjectType: "book",
        subjectId: book.id,
        payload: bookPayload,
      });
    } else {
      await ctx.activity.record(user.id, ACTIVITY_TYPES.BOOK_PROGRESS_UPDATED, {
        subjectType: "book",
        subjectId: book.id,
        payload: { ...bookPayload, locator: body.locator },
      });
    }

    return { data: { ok: true } };
  });

  app.get("/api/v1/books/:slug/history", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const rows = await ctx.userState.listHistory(user.id, "book", book.id);
    return {
      data: rows.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        payload: r.payload,
        occurredAt: r.occurredAt.toISOString(),
      })),
    };
  });

  app.get("/api/v1/books/:slug/bookmarks", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const bookmarks = await ctx.userState.listBookmarks(
      user.id,
      "book",
      book.id,
    );
    return { data: bookmarks };
  });

  app.post("/api/v1/books/:slug/bookmarks", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = bookmarkCreateSchema.parse(request.body);
    const bookmark = await ctx.userState.createBookmark(
      user.id,
      "book",
      book.id,
      body,
    );
    reply.status(201);
    return { data: bookmark };
  });

  app.delete("/api/v1/books/:slug/bookmarks/:bookmarkId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug, bookmarkId } = request.params as {
      slug: string;
      bookmarkId: string;
    };
    await bookFromSlug(user.id, slug);
    await ctx.userState.deleteBookmark(user.id, bookmarkId);
    return { data: { ok: true } };
  });

  app.get("/api/v1/books/:slug/annotations", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const annotations = await ctx.userState.listAnnotations(
      user.id,
      "book",
      book.id,
    );
    return { data: annotations };
  });

  app.post("/api/v1/books/:slug/annotations", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = annotationCreateSchema.parse(request.body);
    const annotation = await ctx.userState.createAnnotation(
      user.id,
      "book",
      book.id,
      body,
    );
    reply.status(201);
    return { data: annotation };
  });

  app.patch(
    "/api/v1/books/:slug/annotations/:annotationId",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
      const { slug, annotationId } = request.params as {
        slug: string;
        annotationId: string;
      };
      await bookFromSlug(user.id, slug);
      const body = annotationUpdateSchema.parse(request.body);
      const annotation = await ctx.userState.updateAnnotation(
        user.id,
        annotationId,
        body,
      );
      return { data: annotation };
    },
  );

  app.delete(
    "/api/v1/books/:slug/annotations/:annotationId",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
      const { slug, annotationId } = request.params as {
        slug: string;
        annotationId: string;
      };
      await bookFromSlug(user.id, slug);
      await ctx.userState.deleteAnnotation(user.id, annotationId);
      return { data: { ok: true } };
    },
  );

  app.get("/api/v1/books/:slug/shelves", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const shelves = await ctx.shelves.listShelvesForSubject(
      user,
      "book",
      book.id,
      "books",
    );
    return { data: shelves };
  });

  app.get("/api/v1/audiobooks", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const query = audiobookListQuerySchema.parse(request.query);
    const result = await ctx.audiobooks.listAudiobooksForUser(user.id, query);
    return {
      data: result.items,
      page: { nextCursor: result.nextCursor ?? null, prevCursor: null },
    };
  });

  app.post("/api/v1/audiobooks", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const body = createAudiobookSchema.parse(request.body);
    const id = await ctx.audiobooks.createAudiobook(body);
    await ctx.libraryMembership.ensureWorkMembership(user.id, "audiobook", id);
    const audiobook = await ctx.audiobooks.getAudiobook(id);
    reply.status(201);
    return { data: audiobook };
  });

  app.get("/api/v1/audiobooks/authors", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const authors = await ctx.audiobooks.listAuthorsForUser(user.id);
    return { data: authors };
  });

  app.get("/api/v1/audiobooks/narrators", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const narrators = await ctx.audiobooks.listNarratorsForUser(user.id);
    return { data: narrators };
  });

  app.get("/api/v1/audiobooks/series", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const series = await ctx.audiobooks.listSeries();
    return { data: series };
  });

  app.post("/api/v1/audiobooks/import", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const body = audiobookImportSchema.parse(request.body);
    const defaultLibrary = await ctx.libraries.getDefaultAudiobookLibrary();
    const ingestItemIds: string[] = [];
    for (const fileId of body.fileIds) {
      const file = await ctx.files.getFile(fileId);
      const result = await ctx.ingest.items.reconcileDiscovered({
        sourceKind: "filesystem",
        sourceIdentity: `legacy:${fileId}`,
        sourcePath: file.relativePath,
        sourceStorageLocationId: file.storageLocationId,
        originalFilename:
          file.relativePath.split("/").pop() ?? file.relativePath,
        sourceChecksum: file.checksum,
        sourceSize: file.size,
        submittedByUserId: user.id,
        targetLibraryId: defaultLibrary?.id,
      });
      await ctx.ingest.enqueueProcess(result.item.id);
      ingestItemIds.push(result.item.id);
    }
    reply.status(202);
    return { data: { ingestItemIds } };
  });

  app.get("/api/v1/audiobooks/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const detail = await ctx.audiobooks.getAudiobookDetail(
      audiobook.id,
      user.id,
    );
    const related = await ctx.relationships.getRelated(
      user.id,
      { type: "audiobook", id: audiobook.id },
      ["semantic"],
      { limit: 50, cursor: 0 },
    );
    const semantic = related.semantic as {
      items: Array<{
        relationshipId: string;
        relationshipType: string;
        type: string;
        id: string;
        title: string;
        slug: string;
        href: string;
      }>;
    };
    const relationships = semantic.items.map((item) => ({
      id: item.relationshipId,
      targetType: item.type,
      targetId: item.id,
      relationshipType: item.relationshipType,
      targetTitle: item.title,
      targetSlug: item.slug,
      targetHref: item.href,
    }));
    return { data: { ...detail, relationships } };
  });

  app.patch("/api/v1/audiobooks/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const body = updateAudiobookSchema.parse(request.body);
    await ctx.audiobooks.updateAudiobook(audiobook.id, body);
    if (body.authors)
      await ctx.audiobooks.setAuthors(audiobook.id, body.authors);
    if (body.narrators) {
      await ctx.audiobooks.setNarrators(audiobook.id, body.narrators);
    }
    if (body.genres) await ctx.audiobooks.setGenres(audiobook.id, body.genres);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/audiobooks/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    await ctx.audiobooks.deleteAudiobook(audiobook.id);
    return { data: { ok: true } };
  });

  app.post("/api/v1/audiobooks/:slug/membership", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await ctx.audiobooks.getAudiobookByRef(slug);
    await ctx.libraryMembership.ensureWorkMembership(
      user.id,
      "audiobook",
      audiobook.id,
    );
    reply.status(201);
    return { data: { ok: true } };
  });

  app.put("/api/v1/audiobooks/:slug/authors", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const body = setAudiobookAuthorsSchema.parse(request.body);
    await ctx.audiobooks.setAuthors(audiobook.id, body.authors);
    return { data: { ok: true } };
  });

  app.put("/api/v1/audiobooks/:slug/narrators", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const body = setNarratorsSchema.parse(request.body);
    await ctx.audiobooks.setNarrators(audiobook.id, body.narrators);
    return { data: { ok: true } };
  });

  app.put("/api/v1/audiobooks/:slug/genres", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const body = setAudiobookGenresSchema.parse(request.body);
    await ctx.audiobooks.setGenres(audiobook.id, body.genres);
    return { data: { ok: true } };
  });

  app.put("/api/v1/audiobooks/:slug/series", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const body = setAudiobookSeriesSchema.parse(request.body);
    await ctx.audiobooks.setSeries(audiobook.id, body.seriesId, body.position);
    return { data: { ok: true } };
  });

  app.patch("/api/v1/audiobooks/:slug/metadata", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const body = fieldOverrideSchema.parse(request.body);
    await ctx.metadata.setOverride({
      subjectType: "audiobook",
      subjectId: audiobook.id,
      field: body.field,
      value: body.value,
      userId: user.id,
    });
    return { data: { ok: true } };
  });

  app.get("/api/v1/audiobooks/:slug/relationships", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const rows = await ctx.relationships.listForSource(
      "audiobook",
      audiobook.id,
    );
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const pub = ctx.relationships.toPublic(row);
        if (row.targetType === "book") {
          try {
            const book = await ctx.books.getBook(row.targetId);
            return {
              ...pub,
              targetTitle: book.title,
              targetSlug: book.slug,
              targetHref: `/books/${book.slug}`,
            };
          } catch {
            return pub;
          }
        }
        return pub;
      }),
    );
    return { data: enriched };
  });

  app.get("/api/v1/audiobooks/:slug/related", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const query = relatedGroupsQuerySchema.parse(request.query);
    const data = await ctx.relationships.getRelated(
      user.id,
      { type: "audiobook", id: audiobook.id },
      query.groups,
      { limit: query.limit, cursor: query.cursor },
    );
    return { data };
  });

  app.post("/api/v1/audiobooks/:slug/relationships", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const body = audiobookRelationshipCreateSchema.parse(request.body);
    await ensureRelationshipTargetAccess(
      user.id,
      body.targetType,
      body.targetId,
    );
    const relId = await ctx.relationships.create({
      sourceType: "audiobook",
      sourceId: audiobook.id,
      ...body,
    });
    reply.status(201);
    return { data: { id: relId } };
  });

  app.delete(
    "/api/v1/audiobooks/:slug/relationships/:relId",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
      const { slug } = request.params as { slug: string };
      const audiobook = await audiobookFromSlug(user.id, slug);
      const { relId } = request.params as { relId: string };
      await ctx.relationships.remove(relId, {
        type: "audiobook",
        id: audiobook.id,
      });
      return { data: { ok: true } };
    },
  );

  app.get("/api/v1/audiobooks/:slug/favorite", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const favorite = await ctx.userState.getFavorite(
      user.id,
      "audiobook",
      audiobook.id,
    );
    return { data: { favorite } };
  });

  app.put("/api/v1/audiobooks/:slug/favorite", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const body = audiobookFavoriteUpdateSchema.parse(request.body);
    await ctx.userState.setFavorite(
      user.id,
      "audiobook",
      audiobook.id,
      body.favorite,
    );
    await ctx.activity.record(
      user.id,
      body.favorite
        ? ACTIVITY_TYPES.AUDIOBOOK_FAVORITED
        : ACTIVITY_TYPES.AUDIOBOOK_UNFAVORITED,
      {
        subjectType: "audiobook",
        subjectId: audiobook.id,
        payload: { title: audiobook.title, slug: audiobook.slug },
      },
    );
    return { data: { favorite: body.favorite } };
  });

  app.get("/api/v1/audiobooks/:slug/rating", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const rating = await ctx.userState.getRating(
      user.id,
      "audiobook",
      audiobook.id,
    );
    return { data: { rating } };
  });

  app.put("/api/v1/audiobooks/:slug/rating", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const body = audiobookRatingUpdateSchema.parse(request.body);
    await ctx.userState.setRating(
      user.id,
      "audiobook",
      audiobook.id,
      body.rating,
    );
    await ctx.activity.record(
      user.id,
      body.rating === null
        ? ACTIVITY_TYPES.AUDIOBOOK_RATING_CLEARED
        : ACTIVITY_TYPES.AUDIOBOOK_RATED,
      {
        subjectType: "audiobook",
        subjectId: audiobook.id,
        payload: {
          title: audiobook.title,
          slug: audiobook.slug,
          rating: body.rating,
        },
      },
    );
    return { data: { rating: body.rating } };
  });

  app.get("/api/v1/audiobooks/:slug/history", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const { slug } = request.params as { slug: string };
    const audiobook = await audiobookFromSlug(user.id, slug);
    const rows = await ctx.userState.listHistory(
      user.id,
      "audiobook",
      audiobook.id,
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        payload: r.payload,
        occurredAt: r.occurredAt.toISOString(),
      })),
    };
  });

  app.get("/api/v1/music/albums", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const query = albumListQuerySchema.parse(request.query);
    const result = await ctx.music.listAlbumsForUser(user.id, query);
    return {
      data: result.items,
      page: { nextCursor: result.nextCursor ?? null, prevCursor: null },
    };
  });

  app.post("/api/v1/music/albums", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const body = createAlbumSchema.parse(request.body);
    const id = await ctx.music.createAlbum(body);
    await ctx.libraryMembership.ensureWorkMembership(user.id, "album", id);
    const album = await ctx.music.getAlbum(id);
    reply.status(201);
    return { data: album };
  });

  app.get("/api/v1/music/artists", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const artists = await ctx.music.listArtistsForUser(user.id);
    return { data: artists };
  });

  app.get("/api/v1/music/genres", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const genres = await ctx.music.listGenresForUser(user.id);
    return { data: genres };
  });

  app.post("/api/v1/music/albums/import", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const body = musicImportSchema.parse(request.body);
    const defaultLibrary = await ctx.libraries.getDefaultMusicLibrary();
    const ingestItemIds: string[] = [];
    for (const fileId of body.fileIds) {
      const file = await ctx.files.getFile(fileId);
      const result = await ctx.ingest.items.reconcileDiscovered({
        sourceKind: "filesystem",
        sourceIdentity: `legacy:${fileId}`,
        sourcePath: file.relativePath,
        sourceStorageLocationId: file.storageLocationId,
        originalFilename:
          file.relativePath.split("/").pop() ?? file.relativePath,
        sourceChecksum: file.checksum,
        sourceSize: file.size,
        submittedByUserId: user.id,
        targetLibraryId: defaultLibrary?.id,
      });
      await ctx.ingest.enqueueProcess(result.item.id);
      ingestItemIds.push(result.item.id);
    }
    reply.status(202);
    return { data: { ingestItemIds } };
  });

  app.get("/api/v1/music/playlists", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const playlists = await ctx.music.listPlaylistsForUser(user.id);
    return { data: playlists };
  });

  app.post("/api/v1/music/playlists", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const body = createPlaylistSchema.parse(request.body);
    const id = await ctx.music.createPlaylist(user.id, body);
    const playlists = await ctx.music.listPlaylistsForUser(user.id);
    const playlist = playlists.find((p) => p.id === id);
    reply.status(201);
    return { data: playlist };
  });

  app.get("/api/v1/music/playlists/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const { slug } = request.params as { slug: string };
    const detail = await ctx.music.getPlaylistDetail(user.id, slug);
    return { data: detail };
  });

  app.patch("/api/v1/music/playlists/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const body = updatePlaylistSchema.parse(request.body);
    await ctx.music.updatePlaylist(user.id, slug, body);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/music/playlists/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    await ctx.music.deletePlaylist(user.id, slug);
    return { data: { ok: true } };
  });

  app.post("/api/v1/music/playlists/:slug/tracks", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const body = playlistTrackMutationSchema.parse(request.body);
    await ctx.music.addTrackToPlaylist(user.id, slug, body.trackId);
    reply.status(201);
    return { data: { ok: true } };
  });

  app.delete(
    "/api/v1/music/playlists/:slug/tracks/:trackId",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
      const { slug, trackId } = request.params as {
        slug: string;
        trackId: string;
      };
      await ctx.music.removeTrackFromPlaylist(user.id, slug, trackId);
      return { data: { ok: true } };
    },
  );

  app.put("/api/v1/music/playlists/:slug/reorder", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const body = playlistReorderSchema.parse(request.body);
    await ctx.music.reorderPlaylistTracks(user.id, slug, body.trackIds);
    return { data: { ok: true } };
  });

  app.get("/api/v1/music/artists/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const { slug } = request.params as { slug: string };
    const artist = await artistFromSlug(user.id, slug);
    const detail = await ctx.music.getArtistDetail(artist.id, user.id);
    return { data: detail };
  });

  app.get("/api/v1/music/tracks/:trackId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const { trackId } = request.params as { trackId: string };
    const detail = await ctx.music.getTrackDetail(trackId, user.id);
    return { data: detail };
  });

  app.get("/api/v1/music/albums/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const detail = await ctx.music.getAlbumDetail(album.id, user.id);
    return { data: detail };
  });

  app.patch("/api/v1/music/albums/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const body = updateAlbumSchema.parse(request.body);
    await ctx.music.updateAlbum(album.id, body);
    if (body.artistIds)
      await ctx.music.setAlbumArtists(album.id, body.artistIds);
    if (body.artistNames) {
      const artistIds: string[] = [];
      for (const name of body.artistNames) {
        artistIds.push(await ctx.music.findOrCreateArtistByName(name));
      }
      await ctx.music.setAlbumArtists(album.id, artistIds);
    }
    if (body.genres) await ctx.music.setAlbumGenres(album.id, body.genres);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/music/albums/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    await ctx.music.deleteAlbum(album.id);
    return { data: { ok: true } };
  });

  app.post("/api/v1/music/albums/:slug/membership", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const album = await ctx.music.getAlbumByRef(slug);
    await ctx.libraryMembership.ensureWorkMembership(
      user.id,
      "album",
      album.id,
    );
    reply.status(201);
    return { data: { ok: true } };
  });

  app.put("/api/v1/music/albums/:slug/artists", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const body = setAlbumArtistsSchema.parse(request.body);
    await ctx.music.setAlbumArtists(album.id, body.artistIds);
    return { data: { ok: true } };
  });

  app.put("/api/v1/music/albums/:slug/genres", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const body = setAlbumGenresSchema.parse(request.body);
    await ctx.music.setAlbumGenres(album.id, body.genres);
    return { data: { ok: true } };
  });

  app.patch("/api/v1/music/albums/:slug/metadata", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const body = fieldOverrideSchema.parse(request.body);
    await ctx.metadata.setOverride({
      subjectType: "album",
      subjectId: album.id,
      field: body.field,
      value: body.value,
      userId: user.id,
    });
    return { data: { ok: true } };
  });

  app.get("/api/v1/music/albums/:slug/favorite", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const favorite = await ctx.userState.getFavorite(
      user.id,
      "album",
      album.id,
    );
    return { data: { favorite } };
  });

  app.put("/api/v1/music/albums/:slug/favorite", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const body = musicFavoriteUpdateSchema.parse(request.body);
    await ctx.userState.setFavorite(user.id, "album", album.id, body.favorite);
    return { data: { favorite: body.favorite } };
  });

  app.get("/api/v1/music/albums/:slug/history", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const rows = await ctx.userState.listHistory(user.id, "album", album.id);
    return {
      data: rows.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        payload: r.payload,
        occurredAt: r.occurredAt.toISOString(),
      })),
    };
  });

  app.get("/api/v1/music/albums/:slug/playback", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const manifests = await ctx.music.getPlaybackManifestsForAlbum(
      album.id,
      user.id,
    );
    return { data: manifests };
  });

  app.get("/api/v1/music/albums/:slug/tracks", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const detail = await ctx.music.getAlbumDetail(album.id, user.id);
    return { data: detail.tracks };
  });

  app.post("/api/v1/music/albums/:slug/tracks", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
    const { slug } = request.params as { slug: string };
    const album = await albumFromSlug(user.id, slug);
    const body = z
      .object({
        title: z.string().min(1),
        discNumber: z.number().int().optional(),
        trackNumber: z.number().int().optional(),
        durationSeconds: z.number().int().optional(),
        artistNames: z.array(z.string().min(1)).optional(),
      })
      .parse(request.body);
    const trackId = await ctx.music.createTrackForAlbum(album.id, body);
    reply.status(201);
    return { data: { id: trackId } };
  });

  app.delete(
    "/api/v1/music/albums/:slug/tracks/:trackSlug",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.MUSIC_WRITE);
      const { slug, trackSlug } = request.params as {
        slug: string;
        trackSlug: string;
      };
      const album = await albumFromSlug(user.id, slug);
      const tracks = await ctx.music.listTracksForAlbum(album.id);
      const track = tracks.find((t) => t.slug === trackSlug);
      if (!track) throw new NotFoundError("Track not found");
      await ctx.music.deleteTrack(track.id);
      return { data: { ok: true } };
    },
  );

  app.get("/api/v1/movies", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const query = movieListQuerySchema.parse(request.query);
    const result = await ctx.movies.listMoviesForUser(user.id, query);
    return {
      data: result.items,
      page: { nextCursor: result.nextCursor ?? null, prevCursor: null },
    };
  });

  app.post("/api/v1/movies", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const body = createMovieSchema.parse(request.body);
    const id = await ctx.movies.createMovie(body);
    await ctx.libraryMembership.ensureWorkMembership(user.id, "movie", id);
    const movie = await ctx.movies.getMovie(id);
    reply.status(201);
    return { data: movie };
  });

  app.get("/api/v1/movies/genres", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const memberships = await ctx.libraryMembership.listForUser(
      user.id,
      "movie",
    );
    if (memberships.length === 0) return { data: [] };
    const movieIds = memberships.map((m) => m.targetId);
    const rows = await ctx.db
      .select({ name: schema.movieGenres.name })
      .from(schema.movieGenres)
      .where(inArray(schema.movieGenres.movieId, movieIds));
    return {
      data: [...new Set(rows.map((r) => r.name))].sort((a, b) =>
        a.localeCompare(b),
      ),
    };
  });

  app.get("/api/v1/movies/collections", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const collections = await ctx.movies.listCollections();
    return { data: collections };
  });

  app.post("/api/v1/movies/collections", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const body = createMovieCollectionSchema.parse(request.body);
    const id = await ctx.movies.createCollection(body);
    const collections = await ctx.movies.listCollections();
    const collection = collections.find((c) => c.id === id);
    reply.status(201);
    return { data: collection };
  });

  app.get("/api/v1/movies/collections/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const { slug } = request.params as { slug: string };
    const detail = await ctx.movies.getCollectionDetail(slug, user.id);
    return { data: detail };
  });

  app.patch("/api/v1/movies/collections/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const body = updateMovieCollectionSchema.parse(request.body);
    const collection = await ctx.movies.getCollectionBySlug(slug);
    await ctx.movies.updateCollection(collection.id, body);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/movies/collections/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const collection = await ctx.movies.getCollectionBySlug(slug);
    await ctx.movies.deleteCollection(collection.id);
    return { data: { ok: true } };
  });

  app.post(
    "/api/v1/movies/collections/:slug/movies",
    async (request, reply) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
      const { slug } = request.params as { slug: string };
      const body = movieCollectionMembershipSchema.parse(request.body);
      const collection = await ctx.movies.getCollectionBySlug(slug);
      await ctx.movies.ensureUserAccess(user.id, body.movieId);
      await ctx.movies.addMovieToCollection(collection.id, body.movieId);
      reply.status(201);
      return { data: { ok: true } };
    },
  );

  app.delete(
    "/api/v1/movies/collections/:slug/movies/:movieId",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
      const { slug, movieId } = request.params as {
        slug: string;
        movieId: string;
      };
      const collection = await ctx.movies.getCollectionBySlug(slug);
      await ctx.movies.ensureUserAccess(user.id, movieId);
      await ctx.movies.removeMovieFromCollection(collection.id, movieId);
      return { data: { ok: true } };
    },
  );

  app.put("/api/v1/movies/collections/:slug/reorder", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const body = movieCollectionReorderSchema.parse(request.body);
    const collection = await ctx.movies.getCollectionBySlug(slug);
    await ctx.movies.reorderCollectionMovies(collection.id, body.movieIds);
    return { data: { ok: true } };
  });

  app.post("/api/v1/movies/import", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const body = movieImportSchema.parse(request.body);
    const ingestItemIds: string[] = [];
    for (const fileId of body.fileIds) {
      const file = await ctx.files.getFile(fileId);
      const result = await ctx.ingest.items.reconcileDiscovered({
        sourceKind: "filesystem",
        sourceIdentity: `legacy:${fileId}`,
        sourcePath: file.relativePath,
        sourceStorageLocationId: file.storageLocationId,
        originalFilename:
          file.relativePath.split("/").pop() ?? file.relativePath,
        sourceChecksum: file.checksum,
        sourceSize: file.size,
        submittedByUserId: user.id,
      });
      await ctx.ingest.enqueueProcess(result.item.id);
      ingestItemIds.push(result.item.id);
    }
    reply.status(202);
    return { data: { ingestItemIds } };
  });

  app.get("/api/v1/movies/people/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const { slug } = request.params as { slug: string };
    const person = await ctx.db.query.moviePeople.findFirst({
      where: eq(schema.moviePeople.slug, slug),
    });
    if (!person) throw new NotFoundError("Person not found");

    const memberships = await ctx.libraryMembership.listForUser(
      user.id,
      "movie",
    );
    const accessibleMovieIds = memberships.map((m) => m.targetId);
    if (accessibleMovieIds.length === 0) {
      throw new ForbiddenError("Person not in your library");
    }

    const creditRows = await ctx.db
      .select({
        movieId: schema.movieCredits.movieId,
        movieSlug: schema.movies.slug,
        movieTitle: schema.movies.title,
        role: schema.movieCredits.role,
        character: schema.movieCredits.character,
        sortOrder: schema.movieCredits.sortOrder,
      })
      .from(schema.movieCredits)
      .innerJoin(
        schema.movies,
        eq(schema.movieCredits.movieId, schema.movies.id),
      )
      .where(
        and(
          eq(schema.movieCredits.personId, person.id),
          inArray(schema.movieCredits.movieId, accessibleMovieIds),
        ),
      )
      .orderBy(asc(schema.movieCredits.sortOrder));

    if (creditRows.length === 0) {
      throw new ForbiddenError("Person not in your library");
    }

    return {
      data: {
        id: person.id,
        slug: person.slug,
        slugStatus: person.slugStatus,
        name: person.name,
        sortName: person.sortName,
        credits: creditRows.map((row) => ({
          movieId: row.movieId,
          movieSlug: row.movieSlug,
          movieTitle: row.movieTitle,
          role: row.role,
          character: row.character,
          sortOrder: row.sortOrder,
        })),
      },
    };
  });

  app.get("/api/v1/movies/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const detail = await ctx.movies.getMovieDetail(movie.id, user.id);
    return { data: detail };
  });

  app.patch("/api/v1/movies/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const body = updateMovieSchema.parse(request.body);
    await ctx.movies.updateMovie(movie.id, body);
    if (body.genres) await ctx.movies.setGenres(movie.id, body.genres);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/movies/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    await ctx.movies.deleteMovie(movie.id);
    return { data: { ok: true } };
  });

  app.post("/api/v1/movies/:slug/membership", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const movie = await ctx.movies.getMovieByRef(slug);
    await ctx.libraryMembership.ensureWorkMembership(
      user.id,
      "movie",
      movie.id,
    );
    reply.status(201);
    return { data: { ok: true } };
  });

  app.put("/api/v1/movies/:slug/genres", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const body = setMovieGenresSchema.parse(request.body);
    await ctx.movies.setGenres(movie.id, body.genres);
    return { data: { ok: true } };
  });

  app.put("/api/v1/movies/:slug/credits", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const body = setMovieCreditsSchema.parse(request.body);
    await ctx.movies.setCredits(movie.id, body.credits);
    return { data: { ok: true } };
  });

  app.patch("/api/v1/movies/:slug/metadata", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const body = fieldOverrideSchema.parse(request.body);
    await ctx.metadata.setOverride({
      subjectType: "movie",
      subjectId: movie.id,
      field: body.field,
      value: body.value,
      userId: user.id,
    });
    return { data: { ok: true } };
  });

  app.get("/api/v1/movies/:slug/favorite", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const favorite = await ctx.userState.getFavorite(
      user.id,
      "movie",
      movie.id,
    );
    return { data: { favorite } };
  });

  app.get("/api/v1/movies/:slug/shelves", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const shelves = await ctx.shelves.listShelvesForSubject(
      user,
      "movie",
      movie.id,
      "movies",
    );
    return { data: shelves };
  });

  app.put("/api/v1/movies/:slug/favorite", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const body = movieFavoriteUpdateSchema.parse(request.body);
    await ctx.userState.setFavorite(user.id, "movie", movie.id, body.favorite);
    return { data: { favorite: body.favorite } };
  });

  app.get("/api/v1/movies/:slug/rating", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const rating = await ctx.userState.getRating(user.id, "movie", movie.id);
    return { data: { rating } };
  });

  app.put("/api/v1/movies/:slug/rating", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_WRITE);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const body = movieRatingUpdateSchema.parse(request.body);
    await ctx.userState.setRating(user.id, "movie", movie.id, body.rating);
    return { data: { rating: body.rating } };
  });

  app.get("/api/v1/movies/:slug/playback", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const { slug } = request.params as { slug: string };
    const movie = await movieFromSlug(user.id, slug);
    const representationId = await ctx.movies.getPrimaryRepresentationId(
      movie.id,
      user.id,
    );
    if (!representationId) {
      throw new NotFoundError("No playback representation");
    }
    const manifest = await ctx.playback.getPlaybackManifest(
      user.id,
      representationId,
    );
    return { data: manifest };
  });

  app.get("/api/v1/podcasts", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PODCASTS_READ);
    const query = podcastListQuerySchema.parse(request.query);
    const result = await ctx.podcasts.listSubscribedShows(user.id, query);
    return {
      data: result.items,
      page: { nextCursor: result.nextCursor ?? null },
    };
  });

  app.get("/api/v1/podcasts/discover", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PODCASTS_READ);
    const query = podcastListQuerySchema.parse(request.query);
    const result = await ctx.podcasts.listDiscoverShows(user.id, query);
    return {
      data: result.items,
      page: { nextCursor: result.nextCursor ?? null },
    };
  });

  app.get("/api/v1/podcasts/continue-listening", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PODCASTS_READ);
    const query = podcastListQuerySchema.parse(request.query);
    const result = await ctx.podcasts.listContinueListening(
      user.id,
      query.limit ?? 20,
    );
    return { data: result.items };
  });

  app.post("/api/v1/podcasts/subscribe", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PODCASTS_WRITE);
    const body = subscribePodcastSchema.parse(request.body);
    const show = await ctx.podcasts.subscribe(user.id, body.feedUrl);
    reply.status(201);
    return { data: show };
  });

  app.delete("/api/v1/podcasts/:slug/subscribe", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PODCASTS_WRITE);
    const { slug } = request.params as { slug: string };
    await ctx.podcasts.unsubscribe(user.id, slug);
    return { data: { ok: true } };
  });

  app.get("/api/v1/podcasts/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PODCASTS_READ);
    const { slug } = request.params as { slug: string };
    const detail = await ctx.podcasts.getShowDetail(user.id, slug);
    return { data: detail };
  });

  app.get("/api/v1/podcasts/:slug/episodes", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PODCASTS_READ);
    const { slug } = request.params as { slug: string };
    const query = podcastEpisodeListQuerySchema.parse(request.query);
    const result = await ctx.podcasts.listEpisodes(slug, query);
    return {
      data: result.items,
      page: { nextCursor: result.nextCursor ?? null },
    };
  });

  app.get("/api/v1/podcasts/:slug/episodes/:episodeSlug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PODCASTS_READ);
    const { slug, episodeSlug } = request.params as {
      slug: string;
      episodeSlug: string;
    };
    const detail = await ctx.podcasts.getEpisodeDetail(slug, episodeSlug);
    return { data: detail };
  });

  app.post(
    "/api/v1/podcasts/:slug/episodes/:episodeSlug/prepare",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.PODCASTS_READ);
      const { slug, episodeSlug } = request.params as {
        slug: string;
        episodeSlug: string;
      };
      const show = await ctx.podcasts.getShowByRef(slug);
      const episode = await ctx.podcasts.getEpisode(show.id, episodeSlug);
      const result = await ctx.podcasts.ensureEpisodePrepared(episode.id);
      return { data: result };
    },
  );

  app.get("/api/v1/representations/:id/playback", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.FILES_STREAM);
    const { id } = request.params as { id: string };
    const manifest = await ctx.playback.getPlaybackManifest(user.id, id);
    return { data: manifest };
  });

  app.get("/api/v1/playback/progress", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.FILES_STREAM);
    const query = playbackProgressQuerySchema.parse(request.query);
    const progress = await ctx.playback.getPlaybackProgress(
      user.id,
      query.subjectType,
      query.subjectId,
    );
    return { data: progress };
  });

  app.put("/api/v1/playback/progress", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.FILES_STREAM);
    const body = playbackProgressUpdateSchema.parse(request.body);
    const result = await ctx.playback.setPlaybackProgress(
      user.id,
      body.subjectType,
      body.subjectId,
      body.locator,
      body.representationId,
    );
    return { data: result };
  });

  app.get("/api/v1/playback/history", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.FILES_STREAM);
    const query = playbackHistoryQuerySchema.parse(request.query);
    const history = await ctx.playback.listPlaybackHistory(
      user.id,
      query.limit,
    );
    return { data: history };
  });

  app.get(
    "/api/v1/representations/:id/publication/manifest",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
      const { id } = request.params as { id: string };
      await ctx.books.ensureRepresentationAccess(user.id, id);
      const rep = await ctx.representations.get(id);
      if (rep.format !== "epub") {
        throw new NotFoundError("Not an EPUB representation");
      }
      const fileLinks =
        await ctx.representations.listFilesForRepresentation(id);
      const contentFile =
        fileLinks.find((f) => f.role === "content") ?? fileLinks[0];
      if (!contentFile) throw new NotFoundError("No file for representation");
      const baseUrl = `/api/v1/representations/${id}/publication/resource`;
      const { manifest } = await ctx.epubPublication.buildManifest(
        contentFile.fileId,
        baseUrl,
      );
      return { data: manifest };
    },
  );

  app.get(
    "/api/v1/representations/:id/publication/resource",
    async (request, reply) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.FILES_STREAM);
      const { id } = request.params as { id: string };
      await ctx.books.ensureRepresentationAccess(user.id, id);
      const { path: resourcePath } = z
        .object({ path: z.string() })
        .parse(request.query);
      const fileLinks =
        await ctx.representations.listFilesForRepresentation(id);
      const contentFile =
        fileLinks.find((f) => f.role === "content") ?? fileLinks[0];
      if (!contentFile) throw new NotFoundError("No file for representation");
      const { data, mediaType } = await ctx.epubPublication.readResource(
        contentFile.fileId,
        resourcePath,
      );
      reply.header("Content-Type", mediaType);
      return reply.send(data);
    },
  );

  app.get("/api/v1/files/unassociated", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.STORAGE_READ);
    const linked = await ctx.db
      .select({ fileId: schema.representationFiles.fileId })
      .from(schema.representationFiles);
    const linkedIds = new Set(linked.map((r) => r.fileId));
    const allFiles = await ctx.db.select().from(schema.files).limit(200);
    const unassociated = allFiles.filter((f) => !linkedIds.has(f.id));
    return {
      data: unassociated.map((f) => ctx.files.toPublic(f)),
    };
  });

  app.get("/api/v1/files/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.FILES_READ);
    const { id } = request.params as { id: string };
    const file = await ctx.files.getFile(id);
    return { data: ctx.files.toPublic(file) };
  });

  app.get("/api/v1/files/:id/custom-fields", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.FILES_READ);
    const { id } = request.params as { id: string };
    await ctx.files.getFile(id);
    const values = await ctx.customFields.getValuesForSubject(
      "books",
      "file",
      id,
    );
    return { data: values };
  });

  app.patch("/api/v1/files/:id/custom-fields", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.STORAGE_WRITE);
    const { id } = request.params as { id: string };
    await ctx.files.getFile(id);
    const body = setCustomFieldValuesSchema.parse(request.body);
    const values = await ctx.customFields.patchValues(
      "books",
      "file",
      id,
      body.values,
      user.id,
    );
    return { data: values };
  });

  app.head("/api/v1/files/:id/content", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.FILES_STREAM);
    const { id } = request.params as { id: string };
    const file = await ctx.files.getFile(id);
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Type", file.mediaType ?? "application/octet-stream");
    reply.header("Content-Length", file.size);
    reply.header("ETag", `"${file.checksum ?? file.id}"`);
    return reply.send();
  });

  app.get("/api/v1/files/:id/content", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.FILES_STREAM);
    const { id } = request.params as { id: string };
    const file = await ctx.files.getFile(id);

    const rangeHeader = request.headers.range;
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Type", file.mediaType ?? "application/octet-stream");
    reply.header("ETag", `"${file.checksum ?? file.id}"`);

    if (rangeHeader) {
      const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
      if (!match) {
        return reply.status(416).send({
          error: { code: "RANGE_NOT_SATISFIABLE", message: "Invalid range" },
        });
      }
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : file.size - 1;
      if (start >= file.size || end >= file.size || start > end) {
        reply.header("Content-Range", `bytes */${file.size}`);
        return reply.status(416).send({
          error: {
            code: "RANGE_NOT_SATISFIABLE",
            message: "Range not satisfiable",
          },
        });
      }
      const { stream } = await ctx.files.getStream(id, { start, end });
      reply.status(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${file.size}`);
      reply.header("Content-Length", end - start + 1);
      return reply.send(stream);
    }

    const { stream } = await ctx.files.getStream(id);
    reply.header("Content-Length", file.size);
    return reply.send(stream);
  });

  app.get("/api/v1/jobs", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.JOBS_READ);
    const query = z
      .object({
        type: z.string().optional(),
        status: z.enum(schema.jobStatusEnum.enumValues).optional(),
        taskKey: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
        cursor: z.string().uuid().optional(),
      })
      .parse(request.query);
    if (query.taskKey && !query.type) {
      throw new ValidationError("type is required when filtering by taskKey");
    }
    const result = await ctx.jobs.list(query);
    return {
      data: result.data,
      page: { nextCursor: result.nextCursor },
    };
  });

  app.get("/api/v1/jobs/tasks", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.JOBS_READ);
    const query = z
      .object({
        type: z.string().optional(),
        status: z.enum(schema.jobStatusEnum.enumValues).optional(),
        failuresOnly: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => v === "true"),
        limit: z.coerce.number().min(1).max(100).optional(),
        cursor: z.string().uuid().optional(),
      })
      .parse(request.query);
    const result = await ctx.jobs.listTasks(query);
    return {
      data: result.data,
      page: { nextCursor: result.nextCursor },
      summary: result.summary,
    };
  });

  app.post("/api/v1/jobs", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.JOBS_ENQUEUE);
    const body = z
      .object({
        type: z.enum(Object.values(JOB_TYPES) as [string, ...string[]]),
        payload: z.record(z.unknown()).optional(),
      })
      .parse(request.body);
    const id = await ctx.jobs.enqueue(
      body.type as (typeof JOB_TYPES)[keyof typeof JOB_TYPES],
      body.payload ?? {},
    );
    reply.status(202);
    return { data: { id } };
  });

  app.get("/api/v1/jobs/:id", async (request) => {
    const user = requireAuth(request);
    const { id } = request.params as { id: string };
    const job = await ctx.jobs.getJob(id);
    if (!job) throw new NotFoundError("Job not found");

    const payloadUserId = job.payload?.userId;
    const isOwner =
      typeof payloadUserId === "string" && payloadUserId === user.id;
    if (!ctx.authz.can(user, PERMISSIONS.JOBS_READ) && !isOwner) {
      throw new ForbiddenError();
    }

    return { data: job };
  });

  app.post("/api/v1/jobs/:id/cancel", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.JOBS_CANCEL);
    const { id } = request.params as { id: string };
    const cancelled = await ctx.jobs.cancel(id);
    return { data: { cancelled } };
  });

  app.post("/api/v1/jobs/:id/retry", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.JOBS_ENQUEUE);
    const { id } = request.params as { id: string };
    const job = await ctx.jobs.getJob(id);
    if (!job) throw new NotFoundError("Job not found");
    if (job.status !== "failed" && job.status !== "cancelled") {
      throw new ValidationError("Only failed or cancelled jobs can be retried");
    }
    const newId = await ctx.jobs.retry(id);
    if (!newId) throw new ValidationError("Job cannot be retried");
    reply.status(202);
    return { data: { id: newId } };
  });

  app.get("/api/v1/shelves", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_READ);
    const { scope } = request.query as { scope?: string };
    const contextScope = scope && isShelfScopeId(scope) ? scope : undefined;
    const shelves = await ctx.shelves.listAccessible(user, contextScope);
    return {
      data: shelves.map((s) => ctx.shelves.toPublic(s, user.id)),
    };
  });

  app.post("/api/v1/shelves", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_WRITE);
    const body = createShelfSchema.parse(request.body);
    const id = await ctx.shelves.create(user, body);
    return { data: { id } };
  });

  app.patch("/api/v1/shelves/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_WRITE);
    const { id } = request.params as { id: string };
    const body = updateShelfSchema.parse(request.body);
    await ctx.shelves.update(user, id, body);
    return { data: { ok: true } };
  });

  app.get("/api/v1/shelves/:id/scope-preview", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_WRITE);
    const { id } = request.params as { id: string };
    const { scope } = request.query as { scope?: string };
    if (!scope || !isShelfScopeId(scope)) {
      throw new ValidationError("scope query parameter required");
    }
    await ctx.shelves.requireView(user, id);
    const incompatible = await ctx.shelves.previewScopeChange(id, scope);
    return { data: { incompatibleItems: incompatible } };
  });

  app.delete("/api/v1/shelves/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_WRITE);
    const { id } = request.params as { id: string };
    await ctx.shelves.delete(user, id);
    return { data: { ok: true } };
  });

  app.get("/api/v1/shelves/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_READ);
    const { id } = request.params as { id: string };
    const { source } = request.query as { source?: string };
    const sourceFilter =
      source === "manual" || source === "rule" || source === "all"
        ? source
        : undefined;
    const detail = await ctx.shelves.getShelfDetailForUser(
      user,
      id,
      sourceFilter,
    );
    return { data: detail };
  });

  app.get("/api/v1/shelves/:id/items", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_READ);
    const { id } = request.params as { id: string };
    const { source } = request.query as { source?: string };
    const sourceFilter =
      source === "manual" || source === "rule" || source === "all"
        ? source
        : undefined;
    const items = await ctx.shelves.listItems(user, id, sourceFilter);
    return {
      data: items.map((i) => ctx.shelves.toItemRef(i)),
    };
  });

  app.post("/api/v1/shelves/:id/items", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_WRITE);
    const { id } = request.params as { id: string };
    const body = shelfItemRefSchema.parse(request.body);
    await ctx.shelves.addItem(user, id, body.subjectType, body.subjectId);
    reply.status(201);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/shelves/:id/items", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_WRITE);
    const { id } = request.params as { id: string };
    const body = shelfItemRefSchema.parse(request.body);
    await ctx.shelves.removeItem(user, id, body.subjectType, body.subjectId);
    return { data: { ok: true } };
  });

  app.patch("/api/v1/shelves/:id/items/order", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_WRITE);
    const { id } = request.params as { id: string };
    const body = shelfItemOrderSchema.parse(request.body);
    await ctx.shelves.reorderItems(user, id, body.items);
    return { data: { ok: true } };
  });

  app.get("/api/v1/shelves/:id/grants", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_READ);
    const { id } = request.params as { id: string };
    const editors = await ctx.shelves.getEditors(user, id);
    return { data: editors };
  });

  app.get("/api/v1/goals", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    const { include } = z
      .object({ include: z.string().optional() })
      .parse(request.query);
    return {
      data:
        include === "progress"
          ? await ctx.goals.listAccessibleWithProgress(user)
          : await ctx.goals.listAccessible(user),
    };
  });

  app.get("/api/v1/goals/capabilities", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    const capabilities = listGoalCapabilities();
    const domains = [
      ...new Set(
        capabilities.flatMap((capability) => capability.supportedDomains),
      ),
    ];
    const combinations = capabilities.flatMap((capability) =>
      (capability.supportedActivities ?? ["completed"]).flatMap((activity) =>
        capability.supportedDomains.map((domain) => ({
          capabilityId: capability.id,
          domain,
          activity,
        })),
      ),
    );
    return {
      data: {
        domains,
        activities: ["completed", "consumed"],
        metrics: capabilities.filter(
          (capability) => capability.aggregation !== "count_distinct",
        ),
        dimensions: capabilities.filter(
          (capability) => capability.aggregation === "count_distinct",
        ),
        ruleFields: GOAL_RULE_FIELDS,
        operators: ["eq", "neq", "contains", "in", "gt", "gte", "lt", "lte"],
        combinations,
      },
    };
  });

  app.post("/api/v1/goals", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    const body = goalCreateSchema.parse(request.body);
    const goal = await ctx.goals.create(user, body);
    return { data: goal };
  });

  app.post("/api/v1/goals/preview", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    return { data: await ctx.goals.preview(user, request.body) };
  });

  app.get("/api/v1/goals/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    const { id } = request.params as { id: string };
    const goal = await ctx.goals.requireView(user, id);
    return { data: ctx.goals.toPublic(goal) };
  });

  app.get("/api/v1/goals/:id/progress", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    const { id } = request.params as { id: string };
    const goal = await ctx.goals.requireView(user, id);
    return { data: await ctx.goals.evaluateProgress(ctx.goals.toPublic(goal)) };
  });

  app.get("/api/v1/goals/:id/candidates", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_READ);
    const { id } = request.params as { id: string };
    return { data: await ctx.goals.listEvaluatedCandidates(user, id) };
  });

  app.patch("/api/v1/goals/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    const { id } = request.params as { id: string };
    const body = goalUpdateSchema.parse(request.body);
    const goal = await ctx.goals.update(user, id, body);
    return { data: goal };
  });

  app.delete("/api/v1/goals/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.GOALS_WRITE);
    const { id } = request.params as { id: string };
    await ctx.goals.delete(user, id);
    return { data: { ok: true } };
  });

  app.put("/api/v1/shelves/:id/grants", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_WRITE);
    const { id } = request.params as { id: string };
    const body = shelfEditorsSchema.parse(request.body);
    await ctx.shelves.setEditors(user, id, body.userIds);
    return { data: { ok: true } };
  });

  app.post("/api/v1/shelves/:id/grants", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_WRITE);
    const { id } = request.params as { id: string };
    const body = z.object({ userId: z.string().uuid() }).parse(request.body);
    await ctx.shelves.addEditor(user, id, body.userId);
    reply.status(201);
    return { data: { ok: true } };
  });

  app.delete("/api/v1/shelves/:id/grants/:userId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.SHELVES_WRITE);
    const { id, userId } = request.params as { id: string; userId: string };
    await ctx.shelves.removeEditor(user, id, userId);
    return { data: { ok: true } };
  });

  app.get("/api/v1/downloads", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DOWNLOADS_MANAGE);
    const rows = await ctx.downloads.listForUser(user.id);
    const data = await Promise.all(
      rows.map(async (d) => {
        const enrichment = await ctx.downloads.resolveEnrichment(d.fileId);
        return ctx.downloads.toPublic(d, enrichment);
      }),
    );
    return { data };
  });

  app.get("/api/v1/downloads/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DOWNLOADS_MANAGE);
    const { id } = request.params as { id: string };
    const download = await ctx.downloads.getById(id, user.id);
    const enrichment = await ctx.downloads.resolveEnrichment(download.fileId);
    return { data: ctx.downloads.toPublic(download, enrichment) };
  });

  app.post("/api/v1/downloads", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DOWNLOADS_MANAGE);
    const body = z
      .object({
        fileId: z.string().uuid(),
        deviceId: z.string().uuid().optional(),
        representationId: z.string().uuid().optional(),
      })
      .parse(request.body);

    const file = await ctx.files.getFile(body.fileId);
    if (file.missingAt) {
      throw new NotFoundError("File is missing from storage");
    }

    if (body.representationId) {
      await ctx.books.ensureRepresentationAccess(
        user.id,
        body.representationId,
      );
      const fileLinks = await ctx.representations.listFilesForRepresentation(
        body.representationId,
      );
      if (!fileLinks.some((l) => l.fileId === body.fileId)) {
        throw new NotFoundError("File is not linked to the representation");
      }
    } else {
      const reps = await ctx.representations.findByFileId(body.fileId);
      const bookRep = reps.find((r) => r.domainModule === "books") ?? reps[0];
      if (bookRep) {
        await ctx.books.ensureRepresentationAccess(user.id, bookRep.id);
      } else {
        ctx.authz.require(user, PERMISSIONS.FILES_STREAM);
      }
    }

    const id = await ctx.downloads.create(user.id, body.fileId, body.deviceId);
    const jobId = await ctx.jobs.enqueue("download.prepare", {
      downloadId: id,
      fileId: body.fileId,
      userId: user.id,
      representationId: body.representationId,
    });
    await ctx.activity.record(user.id, ACTIVITY_TYPES.DOWNLOAD_REQUESTED, {
      subjectType: "download",
      subjectId: id,
      payload: { fileId: body.fileId },
    });
    reply.status(201);
    return { data: { id, jobId } };
  });

  app.patch("/api/v1/downloads/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DOWNLOADS_MANAGE);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        bytesDownloaded: z.number().int().nonnegative().optional(),
        status: z.literal("available").optional(),
      })
      .parse(request.body);
    const updated = await ctx.downloads.patchForUser(id, user.id, body);
    const enrichment = await ctx.downloads.resolveEnrichment(updated.fileId);
    return { data: ctx.downloads.toPublic(updated, enrichment) };
  });

  app.delete("/api/v1/downloads/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DOWNLOADS_MANAGE);
    const { id } = request.params as { id: string };
    await ctx.downloads.remove(id, user.id);
    await ctx.activity.record(user.id, ACTIVITY_TYPES.DOWNLOAD_REMOVED, {
      subjectType: "download",
      subjectId: id,
    });
    return { data: { ok: true } };
  });

  app.get("/api/v1/devices", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DEVICES_MANAGE);
    const rows = await ctx.devices.listForUser(user.id);
    return { data: rows.map((d) => ctx.devices.toPublicSummary(d)) };
  });

  app.get("/api/v1/devices/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DEVICES_MANAGE);
    const { id } = request.params as { id: string };
    const device = await ctx.devices.getForUser(id, user.id);
    return { data: ctx.devices.toPublic(device) };
  });

  app.post("/api/v1/devices", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DEVICES_MANAGE);
    const body = z.object({ name: z.string().min(1) }).parse(request.body);
    const id = await ctx.devices.register(
      user.id,
      body.name,
      request.headers["user-agent"],
    );
    reply.status(201);
    return { data: { id } };
  });

  app.patch("/api/v1/devices/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DEVICES_MANAGE);
    const { id } = request.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).optional(),
        settingsJson: z.record(z.unknown()).optional(),
      })
      .parse(request.body);
    const device = await ctx.devices.update(id, user.id, body);
    return { data: ctx.devices.toPublic(device) };
  });

  app.put("/api/v1/devices/:id/state", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DEVICES_MANAGE);
    const { id } = request.params as { id: string };
    const body = z
      .object({ stateJson: z.record(z.unknown()) })
      .parse(request.body);
    const device = await ctx.devices.updateState(id, user.id, body.stateJson);
    return { data: ctx.devices.toPublic(device) };
  });

  app.delete("/api/v1/devices/:id", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.DEVICES_MANAGE);
    const { id } = request.params as { id: string };
    await ctx.devices.revoke(id, user.id);
    return { data: { ok: true } };
  });

  app.get("/api/v1/search", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.FILES_READ);
    const query = z
      .object({
        q: z.string().default(""),
        types: z.string().optional(),
        cursor: z.string().optional(),
      })
      .parse(request.query);
    const types = query.types ? query.types.split(",") : undefined;
    const result = await ctx.search.query({
      q: query.q,
      types,
      cursor: query.cursor,
    });

    const bookIds = result.results
      .filter((r) => r.type === "book")
      .map((r) => r.id);
    const audiobookIds = result.results
      .filter((r) => r.type === "audiobook")
      .map((r) => r.id);
    const podcastIds = result.results
      .filter((r) => r.type === "podcast")
      .map((r) => r.id);
    const podcastEpisodeIds = result.results
      .filter((r) => r.type === "podcast_episode")
      .map((r) => r.id);
    const albumIds = result.results
      .filter((r) => r.type === "album")
      .map((r) => r.id);
    const artistIds = result.results
      .filter((r) => r.type === "artist")
      .map((r) => r.id);
    const movieIds = result.results
      .filter((r) => r.type === "movie")
      .map((r) => r.id);
    const slugByBookId = new Map<string, string>();
    const slugByAudiobookId = new Map<string, string>();
    const slugByPodcastId = new Map<string, string>();
    const slugByAlbumId = new Map<string, string>();
    const slugByArtistId = new Map<string, string>();
    const slugByMovieId = new Map<string, string>();
    const hrefByPodcastEpisodeId = new Map<string, string>();
    if (bookIds.length > 0) {
      const bookRows = await ctx.db
        .select({ id: schema.books.id, slug: schema.books.slug })
        .from(schema.books)
        .where(inArray(schema.books.id, bookIds));
      for (const row of bookRows) {
        slugByBookId.set(row.id, row.slug);
      }
    }
    if (audiobookIds.length > 0) {
      const audiobookRows = await ctx.db
        .select({ id: schema.audiobooks.id, slug: schema.audiobooks.slug })
        .from(schema.audiobooks)
        .where(inArray(schema.audiobooks.id, audiobookIds));
      for (const row of audiobookRows) {
        slugByAudiobookId.set(row.id, row.slug);
      }
    }
    if (podcastIds.length > 0) {
      const podcastRows = await ctx.db
        .select({ id: schema.podcastShows.id, slug: schema.podcastShows.slug })
        .from(schema.podcastShows)
        .where(inArray(schema.podcastShows.id, podcastIds));
      for (const row of podcastRows) {
        slugByPodcastId.set(row.id, row.slug);
      }
    }
    if (podcastEpisodeIds.length > 0) {
      const episodeRows = await ctx.db
        .select({
          id: schema.podcastEpisodes.id,
          episodeSlug: schema.podcastEpisodes.slug,
          showSlug: schema.podcastShows.slug,
        })
        .from(schema.podcastEpisodes)
        .innerJoin(
          schema.podcastShows,
          eq(schema.podcastShows.id, schema.podcastEpisodes.showId),
        )
        .where(inArray(schema.podcastEpisodes.id, podcastEpisodeIds));
      for (const row of episodeRows) {
        hrefByPodcastEpisodeId.set(
          row.id,
          `/audiobooks/podcasts/${row.showSlug}/${row.episodeSlug}`,
        );
      }
    }
    if (albumIds.length > 0) {
      const albumRows = await ctx.db
        .select({ id: schema.albums.id, slug: schema.albums.slug })
        .from(schema.albums)
        .where(inArray(schema.albums.id, albumIds));
      for (const row of albumRows) {
        slugByAlbumId.set(row.id, row.slug);
      }
    }
    if (artistIds.length > 0) {
      const artistRows = await ctx.db
        .select({ id: schema.musicArtists.id, slug: schema.musicArtists.slug })
        .from(schema.musicArtists)
        .where(inArray(schema.musicArtists.id, artistIds));
      for (const row of artistRows) {
        slugByArtistId.set(row.id, row.slug);
      }
    }
    if (movieIds.length > 0) {
      const movieRows = await ctx.db
        .select({ id: schema.movies.id, slug: schema.movies.slug })
        .from(schema.movies)
        .where(inArray(schema.movies.id, movieIds));
      for (const row of movieRows) {
        slugByMovieId.set(row.id, row.slug);
      }
    }

    const enriched = result.results.map((r) => {
      if (r.type === "book") {
        const slug = slugByBookId.get(r.id);
        return {
          ...r,
          slug,
          href: slug ? `/books/${slug}` : undefined,
        };
      }
      if (r.type === "audiobook") {
        const slug = slugByAudiobookId.get(r.id);
        return {
          ...r,
          slug,
          href: slug ? `/audiobooks/${slug}` : undefined,
        };
      }
      if (r.type === "podcast") {
        const slug = slugByPodcastId.get(r.id);
        return {
          ...r,
          slug,
          href: slug ? `/audiobooks/podcasts/${slug}` : undefined,
        };
      }
      if (r.type === "podcast_episode") {
        return {
          ...r,
          href: hrefByPodcastEpisodeId.get(r.id),
        };
      }
      if (r.type === "album") {
        const slug = slugByAlbumId.get(r.id);
        return {
          ...r,
          slug,
          href: slug ? `/music/albums/${slug}` : undefined,
        };
      }
      if (r.type === "artist") {
        const slug = slugByArtistId.get(r.id);
        return {
          ...r,
          slug,
          href: slug ? `/music/artists/${slug}` : undefined,
        };
      }
      if (r.type === "track") {
        return {
          ...r,
          href: `/music/tracks/${r.id}`,
        };
      }
      if (r.type === "movie") {
        const slug = slugByMovieId.get(r.id);
        return {
          ...r,
          slug,
          href: slug ? `/movies/${slug}` : undefined,
        };
      }
      return r;
    });

    return {
      data: enriched,
      page: { nextCursor: result.nextCursor ?? null, prevCursor: null },
    };
  });

  app.get("/api/v1/home", async (request) => {
    const user = requireAuth(request);
    const data = await ctx.home.getHome(user);
    return { data };
  });

  app.get("/api/v1/activity", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.ACTIVITY_READ_OWN);
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(request.query);
    const result = await ctx.activity.listForUser(user.id, {
      cursor: query.cursor,
      limit: query.limit,
    });
    return {
      data: result.events,
      page: { nextCursor: result.nextCursor ?? null, prevCursor: null },
    };
  });

  app.get("/api/v1/audit", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIT_READ);
    const rows = await ctx.db.select().from(schema.auditEvents).limit(100);
    return { data: rows };
  });

  app.get("/api/v1/metadata/providers", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_PROVIDERS_READ);
    const query = request.query as { mediaModule?: string };
    const mediaModule = query.mediaModule;
    const moduleFilter =
      mediaModule && isMediaModuleId(mediaModule) ? mediaModule : undefined;
    const providers =
      await ctx.metadata.listProvidersWithDescriptors(moduleFilter);
    return { data: providers };
  });

  app.patch("/api/v1/metadata/providers/:key", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_PROVIDERS_WRITE);
    const { key } = request.params as { key: string };
    const descriptor = ctx.metadataRegistry.getDescriptor(key);
    if (!descriptor) throw new NotFoundError("Provider not found");
    const body = providerConfigPatchSchema.parse(request.body);
    let configEncrypted: string | undefined;
    if (body.config) {
      const existing = await ctx.metadata.getProviderRow(key);
      const prev = ctx.metadata.decryptProviderConfig(
        existing?.configEncrypted,
      );
      const merged = { ...prev, ...body.config };
      configEncrypted = ctx.metadata.encryptProviderConfig(merged);
    }
    await ctx.metadata.upsertProvider({
      key,
      contractVersion: METADATA_PROVIDER_CONTRACT,
      enabled: body.enabled,
      configEncrypted,
    });
    return { data: { ok: true } };
  });

  app.post("/api/v1/metadata/providers/:key/test", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_PROVIDERS_WRITE);
    const { key } = request.params as { key: string };
    if (!ctx.metadataRegistry.getDescriptor(key)) {
      throw new NotFoundError("Provider not found");
    }
    const body = providerConfigTestSchema.parse(request.body ?? {});
    const result = await ctx.metadata.testProviderConnection(key, body.config);
    return { data: result };
  });

  app.get("/api/v1/metadata/enabled-modules", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_PROVIDERS_READ);
    const enabledModules = await ctx.systemSettings.getEnabledModules();
    return { data: { enabledModules } };
  });

  app.get("/api/v1/metadata/settings", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_PROVIDERS_READ);
    const enabledModules = await ctx.systemSettings.getEnabledModules();
    const persistenceByModule = await ctx.metadataPersistence.getAll();
    const modules = [];
    for (const moduleId of enabledModules) {
      const fieldTiers = await ctx.metadataPolicy.getFieldPolicyTiers(moduleId);
      const priorities: Array<{
        fieldId: string;
        label: string;
        group: string;
        providerSourceOrder: string[];
        unorderedEligibleProviders: string[];
      }> = [];
      for (const field of getCanonicalFieldsForModule(moduleId)) {
        const tiers = fieldTiers.get(field.id) ?? {
          providerSourceOrder: [],
          importSourceOrder: [],
        };
        priorities.push({
          fieldId: field.id,
          label: field.label,
          group: FIELD_GROUP_LABELS[field.group],
          providerSourceOrder: tiers.providerSourceOrder,
          unorderedEligibleProviders:
            ctx.metadataPolicy.getUnorderedEligibleSources(
              moduleId,
              field.id,
              tiers.providerSourceOrder,
              "provider",
            ),
        });
      }
      priorities.sort((a, b) => {
        const ga = FIELD_GROUP_ORDER.indexOf(
          getCanonicalFieldsForModule(moduleId).find((f) => f.id === a.fieldId)!
            .group,
        );
        const gb = FIELD_GROUP_ORDER.indexOf(
          getCanonicalFieldsForModule(moduleId).find((f) => f.id === b.fieldId)!
            .group,
        );
        return ga - gb;
      });
      modules.push({
        moduleId,
        metadataPersistence: persistenceByModule[moduleId] ?? "neither",
        providers: (
          await ctx.metadata.listProvidersWithDescriptors(moduleId)
        ).filter((p) => p.sourceCategory === "provider"),
        fieldPriorities: priorities,
        matchingRules: await ctx.metadataPolicy.getMatchingRules(moduleId),
      });
    }
    return { data: { enabledModules, modules } };
  });

  app.patch(
    "/api/v1/metadata/settings/:moduleId/metadata-persistence",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.METADATA_PROVIDERS_WRITE);
      const { moduleId } = request.params as { moduleId: string };
      if (!isMediaModuleId(moduleId))
        throw new NotFoundError("Module not found");
      const body = updateMetadataPersistenceSchema.parse(request.body);
      const persistence = await ctx.metadataPersistence.setForModule(
        moduleId,
        body.persistence,
      );
      return { data: { metadataPersistence: persistence } };
    },
  );

  app.patch(
    "/api/v1/metadata/settings/:moduleId/priorities",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.METADATA_PROVIDERS_WRITE);
      const { moduleId } = request.params as { moduleId: string };
      if (!isMediaModuleId(moduleId))
        throw new NotFoundError("Module not found");
      const body = updateFieldPrioritiesSchema.parse(request.body);
      await ctx.metadataPolicy.setFieldPriorities(moduleId, body.priorities);
      return { data: { ok: true } };
    },
  );

  app.patch("/api/v1/metadata/settings/:moduleId/matching", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.METADATA_PROVIDERS_WRITE);
    const { moduleId } = request.params as { moduleId: string };
    if (!isMediaModuleId(moduleId)) throw new NotFoundError("Module not found");
    const body = updateMatchingRulesSchema.parse(request.body);
    const rules = await ctx.metadataPolicy.setMatchingRules(moduleId, body);
    return { data: rules };
  });

  app.get("/api/v1/integrations", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.INTEGRATIONS_READ);
    const rows = await ctx.db
      .select({
        id: schema.integrations.id,
        key: schema.integrations.key,
        enabled: schema.integrations.enabled,
        configured: schema.integrations.configEncrypted,
      })
      .from(schema.integrations);
    return {
      data: rows.map((r) => ({
        id: r.id,
        key: r.key,
        enabled: r.enabled,
        configured: !!r.configured,
      })),
    };
  });

  await registerIngestRoutes(app, ctx);
  await registerProcessingRoutes(app, ctx);
  await registerFormattingRoutes(app, ctx);
  await registerTvRoutes(app, ctx);
  await registerClubsRoutes(app, ctx);
  await registerCalendarRoutes(app, ctx);
  await registerApplicationConfigRoutes(app, ctx);
  await registerReadingProgressRoutes(app, ctx);
  await registerReadingActivityRoutes(app, ctx);
  await registerReadingSessionRoutes(app, ctx);
  await registerRatingsRoutes(app, ctx);
  await registerRatingConfigRoutes(app, ctx);
  registerPresenceRoutes(app, ctx);
  await registerNotificationsRoutes(app, ctx);
  await registerAchievementsRoutes(app, ctx);
  await registerChallengesRoutes(app, ctx);

  // --- People: Creative Identity Graph ---

  app.get("/api/v1/people", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const query = z
      .object({
        page: z.coerce.number().min(1).default(1),
        size: z.coerce.number().min(1).max(100).default(42),
        sort: z.enum(["az", "za"]).default("az"),
        letter: z.string().length(1).optional(),
        entityType: z.enum(["person", "group", "organization"]).optional(),
      })
      .parse(request.query);
    const result = await ctx.people.listPeople(query);
    return { data: result };
  });

  app.get("/api/v1/people/:slug", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const profile = await ctx.people.getProfile(slug);
    if (!profile) throw new NotFoundError("People entity not found");
    return { data: profile };
  });

  app.get("/api/v1/people/:slug/metadata/editor", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const editor = await buildPersonMetadataEditor(
      ctx.db,
      ctx.metadata,
      ctx.metadataPolicy,
      ctx.metadataProvenance,
      ctx.metadataRegistry,
      ctx.people,
      person.id,
    );
    return { data: editor };
  });

  app.patch("/api/v1/people/:slug/metadata", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const body = fieldOverrideSchema.parse(request.body);
    if (
      !getCanonicalFieldsForModule("people").some((f) => f.id === body.field)
    ) {
      throw new ValidationError("Unknown canonical metadata field");
    }
    if (!isPersonUserFacingField(body.field as CanonicalFieldId)) {
      throw new ValidationError("This metadata field is not user-editable");
    }
    if (body.field === "photo") {
      throw new ValidationError("Use the photo endpoint to adopt a portrait");
    }
    await ctx.personCanonical.setPersonField({
      personId: person.id,
      field: body.field as CanonicalFieldId,
      value: body.value,
      userId: user.id,
      provenance: {
        sourceKey: body.sourceKey ?? "feylore",
        sourceCategory: body.sourceKey
          ? resolveAdoptSourceCategory(body.sourceKey, ctx.metadataRegistry)
          : "canonical",
        origin: body.sourceKey ? "adopt" : "edit",
      },
      lock: true,
    });
    return { data: { ok: true } };
  });

  app.patch("/api/v1/people/:slug/metadata/fields", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const body = setPersonMetadataFieldsSchema.parse(request.body);
    await ctx.personCanonical.setPersonFieldsFromEdit(
      person.id,
      user.id,
      body.fields,
    );
    return { data: { ok: true } };
  });

  app.patch("/api/v1/people/:slug/metadata/lock", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const body = setPersonFieldLockSchema.parse(request.body);
    if (
      !getCanonicalFieldsForModule("people").some((f) => f.id === body.fieldId)
    ) {
      throw new ValidationError("Unknown canonical metadata field");
    }
    await ctx.personCanonical.setPersonFieldLock(
      person.id,
      user.id,
      body.fieldId as CanonicalFieldId,
      body.lock,
    );
    return { data: { ok: true } };
  });

  app.delete("/api/v1/people/:slug/metadata/:field", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug, field } = request.params as { slug: string; field: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    if (!getCanonicalFieldsForModule("people").some((f) => f.id === field)) {
      throw new ValidationError("Unknown canonical metadata field");
    }
    await ctx.metadata.clearOverride("person", person.id, field);
    await ctx.metadataProvenance.deleteProvenance("person", person.id, field);
    return { data: { ok: true } };
  });

  app.post("/api/v1/people/:slug/metadata/fetch", async (request, reply) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const existingJobId = await ctx.jobs.findActiveMetadataFetchJobForPerson(
      person.id,
    );
    const jobId =
      existingJobId ??
      (await ctx.jobs.enqueue(
        JOB_TYPES.PERSON_METADATA_FETCH,
        {
          personId: person.id,
          userId: user.id,
        },
        { singletonKey: `person-metadata-fetch:${person.id}` },
      ));
    reply.status(202);
    return { data: { jobId } };
  });

  app.post("/api/v1/people/:slug/photos/adopt", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const body = z
      .object({
        url: z.string().trim().url().min(1).max(2048),
        sourceKey: z.string().trim().max(100).optional(),
      })
      .parse(request.body);
    const result = await adoptPersonPhoto(
      ctx.people,
      ctx.files,
      ctx.metadataProvenance,
      {
        personId: person.id,
        url: body.url,
        sourceKey: body.sourceKey ?? "feylore",
        userId: user.id,
      },
    );
    return { data: { ok: true, fileId: result.fileId } };
  });

  app.delete("/api/v1/people/:slug/photos", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    await ctx.people.updatePersonFields(person.id, { photoFileId: null });
    await ctx.metadata.clearOverride("person", person.id, "photo");
    await ctx.metadataProvenance.deleteProvenance("person", person.id, "photo");
    return { data: { ok: true } };
  });

  app.patch("/api/v1/people/:slug/identity", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const body = updatePersonIdentitySchema.parse(request.body);
    const patch: Partial<{
      name: string;
      sortName: string;
      alternateNames: string[];
      bio: string | null;
      pronouns: string | null;
      personalUrl: string | null;
      birthDate: string | null;
      deathDate: string | null;
      birthPlace: string | null;
      deathPlace: string | null;
    }> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.sortName !== undefined) patch.sortName = body.sortName;
    if (body.alternateNames !== undefined) {
      patch.alternateNames = body.alternateNames;
    }
    if (body.bio !== undefined) patch.bio = body.bio ?? null;
    if (body.pronouns !== undefined) patch.pronouns = body.pronouns ?? null;
    if (body.personalUrl !== undefined) {
      patch.personalUrl = body.personalUrl ? body.personalUrl : null;
    }
    if (body.birthDate !== undefined) {
      patch.birthDate = body.birthDate ? body.birthDate : null;
    }
    if (body.deathDate !== undefined) {
      patch.deathDate = body.deathDate ? body.deathDate : null;
    }
    if (body.birthPlace !== undefined)
      patch.birthPlace = body.birthPlace ?? null;
    if (body.deathPlace !== undefined)
      patch.deathPlace = body.deathPlace ?? null;
    await ctx.people.updatePersonFields(person.id, patch);
    return { data: { ok: true } };
  });

  app.get("/api/v1/people/:slug/links", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    return { data: { links: await ctx.people.listPersonLinks(person.id) } };
  });

  app.post("/api/v1/people/:slug/links", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const body = personLinkInputSchema.parse(request.body);
    const link = await ctx.people.createPersonLink(person.id, {
      kind: body.kind,
      label: body.label ?? null,
      url: body.url,
      sortOrder: body.sortOrder,
    });
    return { data: { link } };
  });

  app.patch("/api/v1/people/:slug/links/:linkId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug, linkId } = request.params as { slug: string; linkId: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const body = personLinkInputSchema.partial().parse(request.body);
    const link = await ctx.people.updatePersonLink(linkId, person.id, {
      kind: body.kind,
      label: body.label,
      url: body.url,
      sortOrder: body.sortOrder,
    });
    return { data: { link } };
  });

  app.delete("/api/v1/people/:slug/links/:linkId", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug, linkId } = request.params as { slug: string; linkId: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    await ctx.people.deletePersonLink(linkId, person.id);
    return { data: { ok: true } };
  });

  app.post("/api/v1/people/:slug/identifiers", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const body = personProviderIdentifierSchema.parse(request.body);
    await ctx.people.setPersonProviderIdentifier(person.id, {
      provider: body.provider,
      identifier: body.identifier,
    });
    return { data: { ok: true } };
  });

  app.delete("/api/v1/people/:slug/identifiers/:provider", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug, provider } = request.params as {
      slug: string;
      provider: string;
    };
    const person = await getPeopleBySlug(ctx.db, slug);
    await ctx.people.deletePersonProviderIdentifier(person.id, provider);
    return { data: { ok: true } };
  });

  app.get("/api/v1/people/:slug/duplicates", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    return {
      data: { candidates: await ctx.people.listDuplicateCandidates(person.id) },
    };
  });

  app.post("/api/v1/people/:slug/merge", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
    const { slug } = request.params as { slug: string };
    const person = await getPeopleBySlug(ctx.db, slug);
    const body = mergePeopleSchema.parse(request.body);
    const result = await ctx.people.mergePersonInto(
      person.id,
      body.duplicatePeopleId,
    );
    return { data: { ok: true, movedCredits: result.movedCredits } };
  });

  app.delete(
    "/api/v1/people/:slug/credits/:targetType/:targetId",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.PEOPLE_WRITE);
      const { slug, targetType, targetId } = request.params as {
        slug: string;
        targetType: string;
        targetId: string;
      };
      const person = await getPeopleBySlug(ctx.db, slug);
      const query = z
        .object({ role: z.string().optional() })
        .parse(request.query);
      await ctx.people.removeCredit(
        person.id,
        targetType,
        targetId,
        query.role,
      );
      return { data: { ok: true } };
    },
  );

  app.get("/api/v1/books/authors/people", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const query = z
      .object({
        page: z.coerce.number().min(1).default(1),
        size: z.coerce.number().min(1).max(100).default(42),
        sort: z.enum(["az", "za"]).default("az"),
        letter: z.string().length(1).optional(),
        entityType: z.enum(["person", "group", "organization"]).optional(),
      })
      .parse(request.query);
    const result = await ctx.people.listPeopleByMediaType(
      "book",
      query,
      "author",
    );
    return { data: result };
  });

  app.get("/api/v1/audiobooks/authors/people", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const query = z
      .object({
        page: z.coerce.number().min(1).default(1),
        size: z.coerce.number().min(1).max(100).default(42),
        sort: z.enum(["az", "za"]).default("az"),
        letter: z.string().length(1).optional(),
        entityType: z.enum(["person", "group", "organization"]).optional(),
      })
      .parse(request.query);
    const result = await ctx.people.listPeopleByMediaType(
      "audiobook",
      query,
      "author",
    );
    return { data: result };
  });

  app.get("/api/v1/audiobooks/narrators/people", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.AUDIOBOOKS_READ);
    const query = z
      .object({
        page: z.coerce.number().min(1).default(1),
        size: z.coerce.number().min(1).max(100).default(42),
        sort: z.enum(["az", "za"]).default("az"),
        letter: z.string().length(1).optional(),
        entityType: z.enum(["person", "group", "organization"]).optional(),
      })
      .parse(request.query);
    const result = await ctx.people.listPeopleByMediaType(
      "audiobook",
      query,
      "narrator",
    );
    return { data: result };
  });

  app.get("/api/v1/music/artists/people", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MUSIC_READ);
    const query = z
      .object({
        page: z.coerce.number().min(1).default(1),
        size: z.coerce.number().min(1).max(100).default(42),
        sort: z.enum(["az", "za"]).default("az"),
        letter: z.string().length(1).optional(),
        entityType: z.enum(["person", "group", "organization"]).optional(),
      })
      .parse(request.query);
    const result = await ctx.people.listPeopleByMediaType(
      "album",
      query,
      "artist",
    );
    return { data: result };
  });

  app.get("/api/v1/movies/people/list", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.MOVIES_READ);
    const query = z
      .object({
        page: z.coerce.number().min(1).default(1),
        size: z.coerce.number().min(1).max(100).default(42),
        sort: z.enum(["az", "za"]).default("az"),
        letter: z.string().length(1).optional(),
        entityType: z.enum(["person", "group", "organization"]).optional(),
      })
      .parse(request.query);
    const result = await ctx.people.listPeopleByMediaType("movie", query);
    return { data: result };
  });
}
