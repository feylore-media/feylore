import {
  eq,
  and,
  inArray,
  ilike,
  asc,
} from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { NotFoundError, ForbiddenError } from "../../../shared/errors.js";
import {
  inferFormatFromPath,
  titleFromPath,
} from "../../../shared/subject.js";
import type { RepresentationService } from "../representations/service.js";
import type { LibraryMembershipService } from "../library-membership/service.js";
import type { FileService } from "../files/service.js";
import type { MetadataService } from "../metadata/service.js";
import type { UserStateService } from "../user-state/service.js";
import type { RelationshipService } from "../relationships/service.js";
import type { PeopleService } from "../people/service.js";
import type { PostgresSearchIndex } from "../search/index.js";
import type { JobService } from "../jobs/service.js";
import { JOB_TYPES } from "../jobs/types.js";
import type {
  AudiobookListQuery,
  AudiobookListItem,
  AudiobookDetail,
} from "../../../shared/audiobooks.js";
import type { PlaybackLocator } from "../../../shared/playback.js";
import { isPlaybackProgressLocator } from "../../../shared/progress-locator.js";
import {
  allocateAudiobookCanonicalSlug,
  generateUniqueAudiobookId,
  getAudiobookBySlug,
  pendingAudiobookIdentity,
  promoteAudiobookSlugIfPending,
} from "./identity.js";

const AUDIOBOOK_EXTENSIONS = new Set([
  "m4b",
  "mp3",
  "m4a",
  "flac",
  "ogg",
  "opus",
  "aac",
  "audio",
]);

export class AudiobooksService {
  private jobs: JobService | undefined;

  constructor(
    private readonly db: Database,
    private readonly representations: RepresentationService,
    private readonly libraryMembership: LibraryMembershipService,
    private readonly files: FileService,
    private readonly metadata: MetadataService,
    private readonly userState: UserStateService,
    private readonly relationships: RelationshipService,
    private readonly search: PostgresSearchIndex,
    private readonly people: PeopleService,
  ) {}

  setJobService(jobs: JobService) {
    this.jobs = jobs;
  }

  async createAudiobook(input: {
    title: string;
    subtitle?: string;
    description?: string;
    authors?: string[];
    narrators?: string[];
    genres?: string[];
  }) {
    const id = await generateUniqueAudiobookId(this.db);
    const canonicalSlug = await allocateAudiobookCanonicalSlug(
      this.db,
      input.title,
    );
    const identity = canonicalSlug
      ? { id, slug: canonicalSlug, slugStatus: "canonical" as const }
      : pendingAudiobookIdentity(id);

    await this.db.insert(schema.audiobooks).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      title: input.title,
      subtitle: input.subtitle,
      description: input.description,
    });

    const expressionId = generateId();
    await this.db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "audiobook",
      workId: id,
      label: "default",
    });

    await this.db.insert(schema.creativeWorkManifestations).values({
      id: generateId(),
      expressionId,
      label: "default",
    });

    if (input.authors?.length) await this.setAuthors(id, input.authors);
    if (input.narrators?.length) await this.setNarrators(id, input.narrators);
    if (input.genres?.length) await this.setGenres(id, input.genres);

    await this.indexAudiobook(id);
    return id;
  }

  private async createPendingAudiobook(input: { title: string }) {
    const id = await generateUniqueAudiobookId(this.db);
    const identity = pendingAudiobookIdentity(id);

    await this.db.insert(schema.audiobooks).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      title: input.title,
    });

    const expressionId = generateId();
    await this.db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "audiobook",
      workId: id,
      label: "default",
    });

    await this.db.insert(schema.creativeWorkManifestations).values({
      id: generateId(),
      expressionId,
      label: "default",
    });

    await this.indexAudiobook(id);
    return id;
  }

  async updateAudiobook(
    id: string,
    input: Partial<{
      title: string;
      subtitle: string;
      description: string;
    }>,
  ) {
    await this.getAudiobook(id);
    await this.db
      .update(schema.audiobooks)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.audiobooks.id, id));
    await this.indexAudiobook(id);
  }

  async deleteAudiobook(id: string) {
    await this.getAudiobook(id);
    await this.search.remove("audiobook", id);
    await this.db.delete(schema.audiobooks).where(eq(schema.audiobooks.id, id));
  }

  async getAudiobook(id: string) {
    const audiobook = await this.db.query.audiobooks.findFirst({
      where: eq(schema.audiobooks.id, id),
    });
    if (!audiobook) throw new NotFoundError("Audiobook not found");
    return audiobook;
  }

  async getAudiobookByRef(ref: string) {
    return getAudiobookBySlug(this.db, ref);
  }

  async ensureUserAccess(userId: string, audiobookId: string) {
    const membership = await this.libraryMembership.listForUser(
      userId,
      "audiobook",
    );
    if (!membership.some((m) => m.targetId === audiobookId)) {
      throw new ForbiddenError("Audiobook not in your library");
    }
  }

  async findAudiobookIdForRepresentation(
    representationId: string,
  ): Promise<string | null> {
    const rep = await this.representations.get(representationId);
    if (!rep.manifestationId) return null;

    const manifestation = await this.db.query.creativeWorkManifestations.findFirst({
      where: eq(schema.creativeWorkManifestations.id, rep.manifestationId),
    });
    if (!manifestation) return null;

    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: eq(schema.creativeWorkExpressions.id, manifestation.expressionId),
    });
    if (!expression || expression.workType !== "audiobook") return null;
    return expression.workId;
  }

  async ensureRepresentationAccess(userId: string, representationId: string) {
    const audiobookId =
      await this.findAudiobookIdForRepresentation(representationId);
    if (!audiobookId) throw new ForbiddenError("Representation not accessible");
    await this.ensureUserAccess(userId, audiobookId);
    return audiobookId;
  }

  async listAudiobooksForUser(
    userId: string,
    query: AudiobookListQuery = {} as AudiobookListQuery,
  ) {
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "audiobook",
    );
    if (memberships.length === 0) {
      return { items: [] as AudiobookListItem[], nextCursor: undefined };
    }

    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );
    let audiobookIds = memberships.map((m) => m.targetId);

    if (query.q) {
      const searchResults = await this.search.query({
        q: query.q,
        types: ["audiobook"],
        limit: 200,
      });
      const searchedIds = new Set(searchResults.results.map((r) => r.id));
      if (searchedIds.size > 0) {
        audiobookIds = audiobookIds.filter((id) => searchedIds.has(id));
      } else {
        audiobookIds = await this.search.searchAudiobooksByTitle(
          this.db,
          audiobookIds,
          query.q,
        );
      }
    }

    if (query.author) {
      const authorRows = await this.db
        .select({ audiobookId: schema.audiobookAuthors.audiobookId })
        .from(schema.audiobookAuthors)
        .where(ilike(schema.audiobookAuthors.name, `%${query.author}%`));
      const ids = new Set(authorRows.map((r) => r.audiobookId));
      audiobookIds = audiobookIds.filter((id) => ids.has(id));
    }

    if (query.narrator) {
      const narratorRows = await this.db
        .select({ audiobookId: schema.audiobookNarrators.audiobookId })
        .from(schema.audiobookNarrators)
        .where(ilike(schema.audiobookNarrators.name, `%${query.narrator}%`));
      const ids = new Set(narratorRows.map((r) => r.audiobookId));
      audiobookIds = audiobookIds.filter((id) => ids.has(id));
    }

    if (query.genre) {
      const genreRows = await this.db
        .select({ audiobookId: schema.audiobookGenres.audiobookId })
        .from(schema.audiobookGenres)
        .where(ilike(schema.audiobookGenres.name, `%${query.genre}%`));
      const ids = new Set(genreRows.map((r) => r.audiobookId));
      audiobookIds = audiobookIds.filter((id) => ids.has(id));
    }

    if (query.series) {
      const seriesRows = await this.db
        .select({ audiobookId: schema.audiobookSeriesMembers.audiobookId })
        .from(schema.audiobookSeriesMembers)
        .where(eq(schema.audiobookSeriesMembers.seriesId, query.series));
      const ids = new Set(seriesRows.map((r) => r.audiobookId));
      audiobookIds = audiobookIds.filter((id) => ids.has(id));
    }

    if (query.favorite === true) {
      const favRows = await this.db
        .select({ subjectId: schema.userFavorites.subjectId })
        .from(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, "audiobook"),
          ),
        );
      const favIds = new Set(favRows.map((r) => r.subjectId));
      audiobookIds = audiobookIds.filter((id) => favIds.has(id));
    } else if (query.favorite === false) {
      const favRows = await this.db
        .select({ subjectId: schema.userFavorites.subjectId })
        .from(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, "audiobook"),
          ),
        );
      const favIds = new Set(favRows.map((r) => r.subjectId));
      audiobookIds = audiobookIds.filter((id) => !favIds.has(id));
    }

    let progressUpdatedMap: Map<string, Date> | undefined;
    if (query.view === "continue") {
      const progressRows = await this.db
        .select({
          subjectId: schema.userProgress.subjectId,
          updatedAt: schema.userProgress.updatedAt,
        })
        .from(schema.userProgress)
        .where(
          and(
            eq(schema.userProgress.userId, userId),
            eq(schema.userProgress.subjectType, "audiobook"),
          ),
        );
      progressUpdatedMap = new Map(
        progressRows.map((r) => [r.subjectId, r.updatedAt]),
      );
      const progressIds = new Set(progressRows.map((r) => r.subjectId));
      audiobookIds = audiobookIds.filter((id) => progressIds.has(id));
    }

    if (audiobookIds.length === 0) {
      return { items: [] as AudiobookListItem[], nextCursor: undefined };
    }

    const audiobooks = await this.db
      .select()
      .from(schema.audiobooks)
      .where(inArray(schema.audiobooks.id, audiobookIds));

    const sortField = query.sort ?? "title";
    const sortOrder = query.order ?? "asc";
    audiobooks.sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortField === "updatedAt") {
        cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
      } else if (sortField === "addedAt") {
        const aAdded = membershipMap.get(a.id)?.getTime() ?? 0;
        const bAdded = membershipMap.get(b.id)?.getTime() ?? 0;
        cmp = aAdded - bAdded;
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });

    if (query.view === "continue" && progressUpdatedMap) {
      audiobooks.sort((a, b) => {
        const aTime = progressUpdatedMap!.get(a.id)?.getTime() ?? 0;
        const bTime = progressUpdatedMap!.get(b.id)?.getTime() ?? 0;
        return bTime - aTime;
      });
    } else if (query.view === "recent") {
      audiobooks.sort((a, b) => {
        const aAdded = membershipMap.get(a.id)?.getTime() ?? 0;
        const bAdded = membershipMap.get(b.id)?.getTime() ?? 0;
        return bAdded - aAdded;
      });
    }

    const limit = query.limit ?? 50;
    const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
    const page = audiobooks.slice(offset, offset + limit + 1);
    const hasMore = page.length > limit;
    const pageAudiobooks = hasMore ? page.slice(0, limit) : page;

    const items = await Promise.all(
      pageAudiobooks.map((audiobook) =>
        this.toListItem(audiobook, userId, membershipMap.get(audiobook.id)),
      ),
    );

    return {
      items,
      nextCursor: hasMore ? String(offset + limit) : undefined,
    };
  }

  async listAudiobooksByIdsForUser(
    userId: string,
    audiobookIds: string[],
  ): Promise<AudiobookListItem[]> {
    if (audiobookIds.length === 0) return [];

    const memberships = await this.libraryMembership.listForUser(
      userId,
      "audiobook",
    );
    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );

    const accessibleIds = audiobookIds.filter((id) => membershipMap.has(id));
    if (accessibleIds.length === 0) return [];

    const audiobooks = await this.db
      .select()
      .from(schema.audiobooks)
      .where(inArray(schema.audiobooks.id, accessibleIds));
    const audiobookById = new Map(audiobooks.map((a) => [a.id, a]));

    const items: AudiobookListItem[] = [];
    for (const id of audiobookIds) {
      const audiobook = audiobookById.get(id);
      if (audiobook) {
        items.push(
          await this.toListItem(
            audiobook,
            userId,
            membershipMap.get(id),
          ),
        );
      }
    }
    return items;
  }

  private async toListItem(
    audiobook: typeof schema.audiobooks.$inferSelect,
    userId: string,
    addedAt?: Date,
  ): Promise<AudiobookListItem> {
    const authors = await this.getAuthorNames(audiobook.id);
    const narrators = await this.getNarratorNames(audiobook.id);
    const genres = await this.getGenreNames(audiobook.id);
    const series = await this.getSeriesForAudiobook(audiobook.id);
    const favorite = await this.userState.getFavorite(
      userId,
      "audiobook",
      audiobook.id,
    );
    const rating = await this.userState.getRating(
      userId,
      "audiobook",
      audiobook.id,
    );
    const progressRow = await this.userState.getProgress(
      userId,
      "audiobook",
      audiobook.id,
    );
    const progress =
      progressRow?.locator && isPlaybackProgressLocator(progressRow.locator)
        ? progressRow.locator
        : null;
    const reps = await this.representationsForAudiobook(audiobook.id);
    const runtimeSeconds = await this.derivePrimaryRuntime(reps);

    return {
      ...this.toPublic(audiobook),
      authors,
      narrators,
      genres,
      series,
      favorite,
      rating,
      progress,
      addedAt: addedAt?.toISOString() ?? null,
      representationFormats: [...new Set(reps.map((r) => r.format))],
      runtimeSeconds,
    };
  }

  async getAudiobookDetail(
    audiobookId: string,
    userId?: string,
  ): Promise<AudiobookDetail> {
    const audiobook = await this.getAudiobook(audiobookId);
    const expressions = await this.db
      .select()
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          eq(schema.creativeWorkExpressions.workType, "audiobook"),
          eq(schema.creativeWorkExpressions.workId, audiobookId),
        ),
      );

    const expressionIds = expressions.map((e) => e.id);
    const manifestations =
      expressionIds.length > 0
        ? await this.db
            .select()
            .from(schema.creativeWorkManifestations)
            .where(
              inArray(
                schema.creativeWorkManifestations.expressionId,
                expressionIds,
              ),
            )
        : [];

    const reps = await this.representationsForAudiobook(audiobookId);

    const representationsWithFiles = await Promise.all(
      reps.map(async (rep) => {
        const fileLinks = await this.representations.listFilesForRepresentation(
          rep.id,
        );
        const files = await Promise.all(
          fileLinks.map(async (link) => {
            const file = await this.files.getFile(link.fileId);
            const durationSeconds = await this.getFileDurationSeconds(
              link.fileId,
            );
            return {
              ...this.files.toPublic(file),
              role: link.role,
              sortOrder: link.sortOrder,
              durationSeconds,
            };
          }),
        );
        const runtimeSeconds = await this.deriveRepresentationRuntime(rep.id);
        return {
          ...this.representations.toPublic(rep),
          runtimeSeconds,
          files,
        };
      }),
    );

    const authors = await this.db
      .select({
        id: schema.audiobookAuthors.id,
        name: schema.audiobookAuthors.name,
        sortOrder: schema.audiobookAuthors.sortOrder,
        peopleId: schema.audiobookAuthors.peopleId,
        peopleSlug: schema.people.slug,
      })
      .from(schema.audiobookAuthors)
      .leftJoin(
        schema.people,
        eq(schema.audiobookAuthors.peopleId, schema.people.id),
      )
      .where(eq(schema.audiobookAuthors.audiobookId, audiobookId))
      .orderBy(asc(schema.audiobookAuthors.sortOrder));

    const narrators = await this.db
      .select({
        id: schema.audiobookNarrators.id,
        name: schema.audiobookNarrators.name,
        sortOrder: schema.audiobookNarrators.sortOrder,
        peopleId: schema.audiobookNarrators.peopleId,
        peopleSlug: schema.people.slug,
      })
      .from(schema.audiobookNarrators)
      .leftJoin(
        schema.people,
        eq(schema.audiobookNarrators.peopleId, schema.people.id),
      )
      .where(eq(schema.audiobookNarrators.audiobookId, audiobookId))
      .orderBy(asc(schema.audiobookNarrators.sortOrder));

    const genres = await this.getGenreNames(audiobookId);
    const series = await this.getSeriesForAudiobook(audiobookId);
    const rels = await this.relationships.listForSource(
      "audiobook",
      audiobookId,
    );
    const overrides = await this.metadata.getOverrides("audiobook", audiobookId);

    let userState = {
      favorite: false,
      rating: null as number | null,
      progress: null as PlaybackLocator | null,
      progressRepresentationId: null as string | null,
    };

    if (userId) {
      const progress = await this.userState.getProgress(
        userId,
        "audiobook",
        audiobookId,
      );
      userState = {
        favorite: await this.userState.getFavorite(
          userId,
          "audiobook",
          audiobookId,
        ),
        rating: await this.userState.getRating(
          userId,
          "audiobook",
          audiobookId,
        ),
        progress:
          progress?.locator && isPlaybackProgressLocator(progress.locator)
            ? progress.locator
            : null,
        progressRepresentationId: progress?.representationId ?? null,
      };
    }

    const overrideMap: Record<string, unknown> = {};
    for (const o of overrides) {
      overrideMap[o.field] = o.value;
    }

    const effective = this.applyOverrides(audiobook, overrideMap);

    return {
      ...this.toPublic(effective),
      authors: authors.map((a) => ({
        id: a.id,
        name: a.name,
        sortOrder: a.sortOrder,
        peopleId: a.peopleId,
        peopleSlug: a.peopleSlug ?? null,
      })),
      narrators: narrators.map((n) => ({
        id: n.id,
        name: n.name,
        sortOrder: n.sortOrder,
        peopleId: n.peopleId,
        peopleSlug: n.peopleSlug ?? null,
      })),
      genres,
      series,
      expressions: expressions.map((e) => ({
        id: e.id,
        label: e.label,
        createdAt: e.createdAt.toISOString(),
      })),
      manifestations: manifestations.map((m) => ({
        id: m.id,
        expressionId: m.expressionId,
        label: m.label,
        externalIdType: m.externalIdType,
        externalId: m.externalId,
        createdAt: m.createdAt.toISOString(),
      })),
      representations: representationsWithFiles,
      relationships: rels.map((r) => this.relationships.toPublic(r)),
      userState,
      overrides: overrideMap,
    };
  }

  private applyOverrides(
    audiobook: typeof schema.audiobooks.$inferSelect,
    overrides: Record<string, unknown>,
  ) {
    return {
      ...audiobook,
      title: (overrides.title as string) ?? audiobook.title,
      subtitle:
        (overrides.subtitle as string | undefined) ?? audiobook.subtitle,
      description:
        (overrides.description as string | undefined) ?? audiobook.description,
    };
  }

  async setAuthors(audiobookId: string, authors: string[]) {
    await this.getAudiobook(audiobookId);
    await this.replaceAuthorsWithCredits(audiobookId, authors);
    await this.indexAudiobook(audiobookId);
  }

  async setNarrators(audiobookId: string, narrators: string[]) {
    await this.getAudiobook(audiobookId);
    await this.replaceNarratorsWithCredits(audiobookId, narrators);
    await this.indexAudiobook(audiobookId);
  }

  private async replaceAuthorsWithCredits(
    audiobookId: string,
    authors: string[],
  ) {
    const resolved = await this.people.syncTargetCredits(
      "audiobook",
      audiobookId,
      authors.map((name, i) => ({ name, role: "author", sortOrder: i })),
    );
    await this.db
      .delete(schema.audiobookAuthors)
      .where(eq(schema.audiobookAuthors.audiobookId, audiobookId));
    for (let i = 0; i < authors.length; i++) {
      await this.db.insert(schema.audiobookAuthors).values({
        id: generateId(),
        audiobookId,
        name: authors[i]!,
        peopleId: resolved.get(authors[i]!),
        sortOrder: i,
      });
    }
  }

  private async replaceNarratorsWithCredits(
    audiobookId: string,
    narrators: string[],
  ) {
    const resolved = await this.people.syncTargetCredits(
      "audiobook",
      audiobookId,
      narrators.map((name, i) => ({ name, role: "narrator", sortOrder: i })),
    );
    await this.db
      .delete(schema.audiobookNarrators)
      .where(eq(schema.audiobookNarrators.audiobookId, audiobookId));
    for (let i = 0; i < narrators.length; i++) {
      await this.db.insert(schema.audiobookNarrators).values({
        id: generateId(),
        audiobookId,
        name: narrators[i]!,
        peopleId: resolved.get(narrators[i]!),
        sortOrder: i,
      });
    }
  }

  async setGenres(audiobookId: string, genres: string[]) {
    await this.getAudiobook(audiobookId);
    await this.db
      .delete(schema.audiobookGenres)
      .where(eq(schema.audiobookGenres.audiobookId, audiobookId));
    for (const name of genres) {
      await this.db.insert(schema.audiobookGenres).values({
        id: generateId(),
        audiobookId,
        name,
      });
    }
    await this.indexAudiobook(audiobookId);
  }

  async applyIngestedMetadata(
    audiobookId: string,
    sources: {
      merged: Partial<{
        title: string;
        subtitle: string;
        description: string;
        authors: string[];
        narrators: string[];
        genres: string[];
        asin: string;
      }>;
      manifestationId: string;
    },
  ) {
    const audiobook = await this.getAudiobook(audiobookId);
    const overrides = await this.metadata.getOverrides("audiobook", audiobookId);
    const overriddenFields = new Set(overrides.map((o) => o.field));
    const merged = sources.merged;

    const updates: Partial<{
      title: string;
      subtitle: string;
      description: string;
    }> = {};

    if (!overriddenFields.has("title") && merged.title) {
      updates.title = merged.title;
    }
    if (!overriddenFields.has("subtitle") && merged.subtitle) {
      updates.subtitle = merged.subtitle;
    }
    if (!overriddenFields.has("description") && merged.description) {
      updates.description = merged.description;
    }

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(schema.audiobooks)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.audiobooks.id, audiobookId));
    }

    if (!overriddenFields.has("authors") && merged.authors?.length) {
      await this.setAuthors(audiobookId, merged.authors);
    }
    if (!overriddenFields.has("narrators") && merged.narrators?.length) {
      await this.setNarrators(audiobookId, merged.narrators);
    }
    if (!overriddenFields.has("genres") && merged.genres?.length) {
      await this.setGenres(audiobookId, merged.genres);
    }

    if (merged.asin) {
      await this.db
        .update(schema.creativeWorkManifestations)
        .set({
          externalIdType: "asin",
          externalId: merged.asin,
        })
        .where(eq(schema.creativeWorkManifestations.id, sources.manifestationId));
    }

    const titleForSlug = updates.title ?? audiobook.title;
    await promoteAudiobookSlugIfPending(this.db, audiobookId, titleForSlug);
    await this.indexAudiobook(audiobookId);
  }

  async setSeries(
    audiobookId: string,
    seriesId: string | null,
    position?: number,
  ) {
    await this.getAudiobook(audiobookId);
    await this.db
      .delete(schema.audiobookSeriesMembers)
      .where(eq(schema.audiobookSeriesMembers.audiobookId, audiobookId));

    if (seriesId) {
      await this.db.insert(schema.audiobookSeriesMembers).values({
        id: generateId(),
        seriesId,
        audiobookId,
        position: position ?? null,
      });
    }
    await this.indexAudiobook(audiobookId);
  }

  async listSeries() {
    return this.db
      .select()
      .from(schema.audiobookSeries)
      .orderBy(asc(schema.audiobookSeries.name));
  }

  async listAuthorsForUser(userId: string) {
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "audiobook",
    );
    if (memberships.length === 0) return [];
    const ids = memberships.map((m) => m.targetId);
    const rows = await this.db
      .select({ name: schema.audiobookAuthors.name })
      .from(schema.audiobookAuthors)
      .where(inArray(schema.audiobookAuthors.audiobookId, ids));
    return [...new Set(rows.map((r) => r.name))].sort((a, b) =>
      a.localeCompare(b),
    );
  }

  async listNarratorsForUser(userId: string) {
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "audiobook",
    );
    if (memberships.length === 0) return [];
    const ids = memberships.map((m) => m.targetId);
    const rows = await this.db
      .select({ name: schema.audiobookNarrators.name })
      .from(schema.audiobookNarrators)
      .where(inArray(schema.audiobookNarrators.audiobookId, ids));
    return [...new Set(rows.map((r) => r.name))].sort((a, b) =>
      a.localeCompare(b),
    );
  }

  async findDuplicateAudiobookByChecksum(
    checksum: string,
  ): Promise<{ workType: "audiobook"; workId: string } | null> {
    const sameChecksum = await this.db
      .select({ audiobookId: schema.creativeWorkExpressions.workId })
      .from(schema.representationFiles)
      .innerJoin(
        schema.representations,
        eq(schema.representationFiles.representationId, schema.representations.id),
      )
      .innerJoin(schema.files, eq(schema.representationFiles.fileId, schema.files.id))
      .innerJoin(
        schema.creativeWorkManifestations,
        eq(schema.representations.manifestationId, schema.creativeWorkManifestations.id),
      )
      .innerJoin(
        schema.creativeWorkExpressions,
        eq(schema.creativeWorkManifestations.expressionId, schema.creativeWorkExpressions.id),
      )
      .where(
        and(
          eq(schema.files.checksum, checksum),
          eq(schema.creativeWorkExpressions.workType, "audiobook"),
        ),
      )
      .limit(1);
    if (sameChecksum[0]) {
      return { workType: "audiobook", workId: sameChecksum[0].audiobookId };
    }
    return null;
  }

  async createAudiobookRepresentation(params: {
    fileId: string;
    title: string;
    userId?: string;
    format?: string;
    sortOrder?: number;
  }) {
    const file = await this.files.getFile(params.fileId);
    const format =
      params.format ?? inferFormatFromPath(file.relativePath);

    if (!AUDIOBOOK_EXTENSIONS.has(format)) {
      throw new Error("not_an_audiobook_format");
    }

    const existing = await this.representations.findByFileId(params.fileId);
    if (existing.length > 0) {
      const rep = existing[0]!;
      const manifestation = rep.manifestationId
        ? await this.db.query.creativeWorkManifestations.findFirst({
            where: eq(schema.creativeWorkManifestations.id, rep.manifestationId),
          })
        : undefined;
      const expression = manifestation
        ? await this.db.query.creativeWorkExpressions.findFirst({
            where: eq(schema.creativeWorkExpressions.id, manifestation.expressionId),
          })
        : undefined;
      return {
        audiobookId: expression?.workId ?? "",
        expressionId: expression?.id ?? "",
        manifestationId: rep.manifestationId,
        representationId: rep.id,
        alreadyLinked: true,
      };
    }

    const audiobookId = await this.createPendingAudiobook({ title: params.title });

    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: and(
        eq(schema.creativeWorkExpressions.workType, "audiobook"),
        eq(schema.creativeWorkExpressions.workId, audiobookId),
      ),
    });

    const expressionId = expression?.id ?? generateId();
    if (!expression) {
      await this.db.insert(schema.creativeWorkExpressions).values({
        id: expressionId,
        workType: "audiobook",
        workId: audiobookId,
      });
    }

    const manifestationId = generateId();
    await this.db.insert(schema.creativeWorkManifestations).values({
      id: manifestationId,
      expressionId,
      label: format,
    });

    const representationId = await this.representations.create({
      format,
      domainModule: "audiobooks",
      manifestationId,
    });

    await this.representations.linkFile(
      representationId,
      params.fileId,
      "content",
      params.sortOrder ?? 0,
    );

    if (params.userId) {
      await this.libraryMembership.ensureWorkMembership(
        params.userId,
        "audiobook",
        audiobookId,
      );
    }

    return {
      audiobookId,
      expressionId,
      manifestationId,
      representationId,
      alreadyLinked: false,
    };
  }

  async associateFile(fileId: string, userId?: string) {
    const file = await this.files.getFile(fileId);
    const format = inferFormatFromPath(file.relativePath);

    if (!AUDIOBOOK_EXTENSIONS.has(format)) {
      return { skipped: true as const, reason: "not_an_audiobook_format" };
    }

    const existing = await this.representations.findByFileId(fileId);
    if (existing.length > 0) {
      return {
        skipped: true as const,
        reason: "already_associated",
        representationId: existing[0]!.id,
      };
    }

    const title = titleFromPath(file.relativePath);
    const created = await this.createAudiobookRepresentation({
      fileId,
      title,
      userId,
      format,
    });

    await this.indexAudiobook(created.audiobookId);

    if (this.jobs) {
      await this.jobs.enqueue(JOB_TYPES.METADATA_INGEST, {
        fileId,
        audiobookId: created.audiobookId,
        representationId: created.representationId,
        manifestationId: created.manifestationId,
      });
      await this.jobs.enqueue(JOB_TYPES.MEDIA_PROCESS, {
        representationId: created.representationId,
        fileId,
        domain: "audiobook",
      });
    }

    return {
      skipped: false as const,
      audiobookId: created.audiobookId,
      expressionId: created.expressionId,
      manifestationId: created.manifestationId,
      representationId: created.representationId,
    };
  }

  async indexAudiobook(audiobookId: string) {
    const audiobook = await this.getAudiobook(audiobookId);
    const authors = await this.getAuthorNames(audiobookId);
    const narrators = await this.getNarratorNames(audiobookId);
    const genres = await this.getGenreNames(audiobookId);
    await this.search.upsert({
      entityType: "audiobook",
      entityId: audiobookId,
      title: audiobook.title,
      body: [
        audiobook.subtitle,
        audiobook.description,
        ...authors,
        ...narrators,
        ...genres,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  async listAllAudiobookIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.audiobooks.id })
      .from(schema.audiobooks);
    return rows.map((r) => r.id);
  }

  async getAuthorNames(audiobookId: string) {
    const rows = await this.db
      .select({ name: schema.audiobookAuthors.name })
      .from(schema.audiobookAuthors)
      .where(eq(schema.audiobookAuthors.audiobookId, audiobookId))
      .orderBy(asc(schema.audiobookAuthors.sortOrder));
    return rows.map((r) => r.name);
  }

  async getNarratorNames(audiobookId: string) {
    const rows = await this.db
      .select({ name: schema.audiobookNarrators.name })
      .from(schema.audiobookNarrators)
      .where(eq(schema.audiobookNarrators.audiobookId, audiobookId))
      .orderBy(asc(schema.audiobookNarrators.sortOrder));
    return rows.map((r) => r.name);
  }

  private async getGenreNames(audiobookId: string) {
    const rows = await this.db
      .select({ name: schema.audiobookGenres.name })
      .from(schema.audiobookGenres)
      .where(eq(schema.audiobookGenres.audiobookId, audiobookId));
    return rows.map((r) => r.name);
  }

  async getSeriesForAudiobook(audiobookId: string) {
    const row = await this.db
      .select({
        id: schema.audiobookSeries.id,
        name: schema.audiobookSeries.name,
        position: schema.audiobookSeriesMembers.position,
      })
      .from(schema.audiobookSeriesMembers)
      .innerJoin(
        schema.audiobookSeries,
        eq(schema.audiobookSeriesMembers.seriesId, schema.audiobookSeries.id),
      )
      .where(eq(schema.audiobookSeriesMembers.audiobookId, audiobookId))
      .limit(1);
    if (!row[0]) return null;
    return {
      id: row[0].id,
      name: row[0].name,
      position: row[0].position,
    };
  }

  async deriveRepresentationRuntime(
    representationId: string,
  ): Promise<number | null> {
    const fileLinks =
      await this.representations.listFilesForRepresentation(representationId);
    if (fileLinks.length === 0) return null;

    let total = 0;
    let hasDuration = false;
    for (const link of fileLinks) {
      const duration = await this.getFileDurationSeconds(link.fileId);
      if (duration != null) {
        total += duration;
        hasDuration = true;
      }
    }
    return hasDuration ? total : null;
  }

  private async derivePrimaryRuntime(
    reps: Array<typeof schema.representations.$inferSelect>,
  ): Promise<number | null> {
    for (const rep of reps) {
      const runtime = await this.deriveRepresentationRuntime(rep.id);
      if (runtime != null) return runtime;
    }
    return null;
  }

  private async getFileDurationSeconds(
    fileId: string,
  ): Promise<number | null> {
    const technical = await this.db.query.fileTechnicalMetadata.findFirst({
      where: eq(schema.fileTechnicalMetadata.fileId, fileId),
    });
    const duration = technical?.payload?.durationSeconds;
    return typeof duration === "number" ? duration : null;
  }

  private async representationsForAudiobook(audiobookId: string) {
    const expressions = await this.db
      .select({ id: schema.creativeWorkExpressions.id })
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          eq(schema.creativeWorkExpressions.workType, "audiobook"),
          eq(schema.creativeWorkExpressions.workId, audiobookId),
        ),
      );

    if (expressions.length === 0) return [];

    const manifestationIds = (
      await this.db
        .select({ id: schema.creativeWorkManifestations.id })
        .from(schema.creativeWorkManifestations)
        .where(
          inArray(
            schema.creativeWorkManifestations.expressionId,
            expressions.map((e) => e.id),
          ),
        )
    ).map((m) => m.id);

    if (manifestationIds.length === 0) return [];

    return this.db
      .select()
      .from(schema.representations)
      .where(inArray(schema.representations.manifestationId, manifestationIds));
  }

  toPublic(audiobook: typeof schema.audiobooks.$inferSelect) {
    return {
      id: audiobook.id,
      slug: audiobook.slug,
      slugStatus: audiobook.slugStatus as "pending" | "canonical",
      title: audiobook.title,
      subtitle: audiobook.subtitle,
      description: audiobook.description,
      coverFileId: audiobook.coverFileId,
      createdAt: audiobook.createdAt.toISOString(),
      updatedAt: audiobook.updatedAt.toISOString(),
    };
  }
}
