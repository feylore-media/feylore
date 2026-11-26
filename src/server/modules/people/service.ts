import {
  eq,
  and,
  or,
  ne,
  inArray,
  asc,
  count,
  sql,
  ilike,
  isNull,
} from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  generateUniquePeopleId,
  allocatePeopleCanonicalSlug,
} from "./identity.js";
import type {
  PeopleListQuery,
  PeopleEntityCard,
  PeopleEntityProfile,
  PeoplePaginatedResponse,
  PeopleCreditItem,
  PeopleRelationshipItem,
  PeopleEntityType,
  PersonLink,
  PersonLinkKind,
} from "../../../shared/people.js";
import type {
  PersonLinkEditorRow,
} from "../../../shared/person-metadata-editor.js";
import type { CanonicalFieldId } from "../../../shared/metadata-fields.js";
import type { MetadataProvenanceOrigin } from "../../../shared/metadata-provenance.js";
import { NotFoundError, ValidationError } from "../../../shared/errors.js";
import { PERSON_COLUMN_BY_FIELD } from "./person-canonical.js";

const BOOK_PEOPLE_ROLES = ["author", "illustrator", "contributor"];
const AUDIOBOOK_PEOPLE_ROLES = ["author", "narrator"];
const MOVIE_PEOPLE_ROLES = ["actor", "director", "writer", "producer", "cast"];
const TV_PEOPLE_ROLES = ["actor", "director", "writer", "producer", "cast"];
const PODCAST_PEOPLE_ROLES = ["host", "cast", "guest"];
const MUSIC_PEOPLE_ROLES = ["artist", "performer", "producer", "composer"];

const TARGET_TYPE_ROLES: Record<string, string[]> = {
  book: BOOK_PEOPLE_ROLES,
  audiobook: AUDIOBOOK_PEOPLE_ROLES,
  movie: MOVIE_PEOPLE_ROLES,
  tvShow: TV_PEOPLE_ROLES,
  podcast: PODCAST_PEOPLE_ROLES,
  album: MUSIC_PEOPLE_ROLES,
  track: MUSIC_PEOPLE_ROLES,
};

function deriveRoleLabels(
  creditCounts: Map<string, Map<string, number>>,
  peopleId: string,
): string[] {
  const byType = creditCounts.get(peopleId);
  if (!byType) return [];

  const labels: string[] = [];
  if ((byType.get("book") ?? 0) > 0) labels.push("Author");
  if ((byType.get("audiobook") ?? 0) > 0) labels.push("Narrator");
  if (
    ((byType.get("movie") ?? 0) + (byType.get("tvShow") ?? 0)) > 0
  )
    labels.push("Actor");
  if ((byType.get("album") ?? 0) > 0) labels.push("Artist");
  if ((byType.get("podcast") ?? 0) > 0) labels.push("Podcast");

  return labels.length > 0 ? labels : ["Contributor"];
}

export class PeopleService {
  constructor(private readonly db: Database) {}

  async listPeople(
    query: PeopleListQuery,
  ): Promise<PeoplePaginatedResponse> {
    const { page, size, sort, letter, entityType } = query;

    const where = and(
      entityType ? eq(schema.people.entityType, entityType) : undefined,
      letter ? ilike(schema.people.sortName, `${letter}%`) : undefined,
    );

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(schema.people)
      .where(where);

    const peopleRows = await this.db
      .select({
        id: schema.people.id,
        slug: schema.people.slug,
        name: schema.people.name,
        sortName: schema.people.sortName,
        entityType: schema.people.entityType,
        photoFileId: schema.people.photoFileId,
      })
      .from(schema.people)
      .where(where)
      .orderBy(
        sort === "az"
          ? asc(schema.people.sortName)
          : sql`${schema.people.sortName} DESC`,
      )
      .limit(size)
      .offset((page - 1) * size);

    const peopleIds = peopleRows.map((p) => p.id);

    let creditCounts = new Map<string, Map<string, number>>();
    let upcomingMap = new Map<
      string,
      { title: string; date: string; targetType: string; slug: string }
    >();

    if (peopleIds.length > 0) {
      const creditRows = await this.db
        .select({
          peopleId: schema.personCredits.peopleId,
          targetType: schema.personCredits.targetType,
          cnt: count(),
        })
        .from(schema.personCredits)
        .where(inArray(schema.personCredits.peopleId, peopleIds))
        .groupBy(schema.personCredits.peopleId, schema.personCredits.targetType);

      creditCounts = new Map();
      for (const row of creditRows) {
        let byType = creditCounts.get(row.peopleId);
        if (!byType) {
          byType = new Map();
          creditCounts.set(row.peopleId, byType);
        }
        byType.set(row.targetType, row.cnt);
      }

      const upcomingBooks = await this.db
        .select({
          peopleId: schema.personCredits.peopleId,
          targetType: schema.personCredits.targetType,
          targetId: schema.personCredits.targetId,
          title: schema.books.title,
          releaseDate: schema.books.createdAt,
          slug: schema.books.slug,
        })
        .from(schema.personCredits)
        .innerJoin(
          schema.books,
          and(
            eq(schema.personCredits.targetType, "book"),
            eq(schema.personCredits.targetId, schema.books.id),
          ),
        )
        .where(inArray(schema.personCredits.peopleId, peopleIds))
        .orderBy(asc(schema.books.createdAt))
        .limit(peopleIds.length);

      upcomingMap = new Map();
      for (const row of upcomingBooks) {
        if (!upcomingMap.has(row.peopleId)) {
          upcomingMap.set(row.peopleId, {
            title: row.title,
            date: row.releaseDate?.toISOString() ?? "",
            targetType: row.targetType,
            slug: row.slug,
          });
        }
      }
    }

    const availableLettersRows = await this.db
      .select({
        letter: sql<string>`upper(left(${schema.people.sortName}, 1))`,
      })
      .from(schema.people)
      .groupBy(sql`upper(left(${schema.people.sortName}, 1))`)
      .orderBy(sql`upper(left(${schema.people.sortName}, 1))`);

    const items: PeopleEntityCard[] = peopleRows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      entityType: p.entityType as PeopleEntityType,
      photoFileId: p.photoFileId,
      roleLabels: deriveRoleLabels(creditCounts, p.id),
      nextWork: upcomingMap.get(p.id) ?? null,
    }));

    return {
      items,
      pagination: {
        page,
        size,
        total,
        totalPages: Math.ceil(total / size),
      },
      availableLetters: availableLettersRows.map((r) => r.letter),
    };
  }

  async getProfile(slug: string): Promise<PeopleEntityProfile> {
    const person = await this.db.query.people.findFirst({
      where: eq(schema.people.slug, slug),
    });
    if (!person) return null as unknown as PeopleEntityProfile;

    const [relationshipRows, linkRows] = await Promise.all([
      this.db
        .select({
          relatedPeopleId: schema.personRelationships.relatedPeopleId,
          relatedName: schema.people.name,
          relatedSlug: schema.people.slug,
          relatedEntityType: schema.people.entityType,
          relatedPhotoFileId: schema.people.photoFileId,
          relationshipType: schema.personRelationships.relationshipType,
          sortOrder: schema.personRelationships.sortOrder,
        })
        .from(schema.personRelationships)
        .innerJoin(
          schema.people,
          eq(schema.personRelationships.relatedPeopleId, schema.people.id),
        )
        .where(eq(schema.personRelationships.peopleId, person.id))
        .orderBy(asc(schema.personRelationships.sortOrder)),

      this.db
        .select()
        .from(schema.personLinks)
        .where(eq(schema.personLinks.peopleId, person.id))
        .orderBy(asc(schema.personLinks.sortOrder)),
    ]);

    const credits = await this.buildCreditItems(person.id);

    const creditCounts: Record<string, number> = {};
    for (const credit of credits) {
      creditCounts[credit.targetType] = (creditCounts[credit.targetType] ?? 0) + 1;
    }

    const relationships: PeopleRelationshipItem[] = relationshipRows.map(
      (r) => ({
        relatedPeopleId: r.relatedPeopleId,
        relatedName: r.relatedName,
        relatedSlug: r.relatedSlug,
        relatedEntityType: r.relatedEntityType as PeopleEntityType,
        relatedPhotoFileId: r.relatedPhotoFileId,
        relationshipType: r.relationshipType,
        sortOrder: r.sortOrder ?? 0,
      }),
    );

    const links: PersonLink[] = linkRows.map((r) => ({
      id: r.id,
      kind: (r.kind ?? "other") as PersonLinkKind,
      label: r.label,
      url: r.url,
      sortOrder: r.sortOrder ?? 0,
      sourceLabel: provenanceSourceLabel(r.provenance),
    }));

    return {
      id: person.id,
      slug: person.slug,
      entityType: person.entityType as PeopleEntityType,
      name: person.name,
      sortName: person.sortName,
      alternateNames: person.alternateNames ?? [],
      bio: person.bio,
      pronouns: person.pronouns,
      personalUrl: person.personalUrl,
      birthDate: person.birthDate,
      deathDate: person.deathDate,
      birthPlace: person.birthPlace,
      deathPlace: person.deathPlace,
      photoFileId: person.photoFileId,
      creditCounts,
      links,
      credits,
      relationships,
    };
  }

  private async buildCreditItems(personId: string): Promise<PeopleCreditItem[]> {
    const creditRows = await this.db
      .select({
        id: schema.personCredits.id,
        targetType: schema.personCredits.targetType,
        targetId: schema.personCredits.targetId,
        role: schema.personCredits.role,
        character: schema.personCredits.character,
        sortOrder: schema.personCredits.sortOrder,
        bookTitle: schema.books.title,
        bookSlug: schema.books.slug,
        bookCoverFileId: schema.books.coverFileId,
        audiobookTitle: schema.audiobooks.title,
        audiobookSlug: schema.audiobooks.slug,
        audiobookCoverFileId: schema.audiobooks.coverFileId,
        movieTitle: schema.movies.title,
        movieSlug: schema.movies.slug,
        movieCoverFileId: schema.movies.coverFileId,
        movieReleaseDate: schema.movies.releaseDate,
        albumTitle: schema.albums.title,
        albumSlug: schema.albums.slug,
        albumCoverFileId: schema.albums.coverFileId,
        albumReleaseDate: schema.albums.releaseDate,
      })
      .from(schema.personCredits)
      .leftJoin(
        schema.books,
        and(
          eq(schema.personCredits.targetType, "book"),
          eq(schema.personCredits.targetId, schema.books.id),
        ),
      )
      .leftJoin(
        schema.audiobooks,
        and(
          eq(schema.personCredits.targetType, "audiobook"),
          eq(schema.personCredits.targetId, schema.audiobooks.id),
        ),
      )
      .leftJoin(
        schema.movies,
        and(
          eq(schema.personCredits.targetType, "movie"),
          eq(schema.personCredits.targetId, schema.movies.id),
        ),
      )
      .leftJoin(
        schema.albums,
        and(
          eq(schema.personCredits.targetType, "album"),
          eq(schema.personCredits.targetId, schema.albums.id),
        ),
      )
      .where(eq(schema.personCredits.peopleId, personId))
      .orderBy(asc(schema.personCredits.sortOrder));

    const bookTargetIds = creditRows
      .filter((r) => r.targetType === "book")
      .map((r) => r.targetId);
    const audiobookTargetIds = creditRows
      .filter((r) => r.targetType === "audiobook")
      .map((r) => r.targetId);

    const [seriesMap, releaseDates] = await Promise.all([
      this.resolveSeriesForTargets(bookTargetIds, audiobookTargetIds),
      this.resolveWorkReleaseDates(bookTargetIds, audiobookTargetIds),
    ]);

    return creditRows.flatMap((row) => {
      const libraryTitle =
        row.bookTitle ??
        row.audiobookTitle ??
        row.movieTitle ??
        row.albumTitle ??
        null;
      if (!libraryTitle) return [];

      const librarySlug =
        row.bookSlug ?? row.audiobookSlug ?? row.movieSlug ?? row.albumSlug ?? null;
      const libraryCover =
        row.bookCoverFileId ??
        row.audiobookCoverFileId ??
        row.movieCoverFileId ??
        row.albumCoverFileId ??
        null;

      let releaseDate: string | null = null;
      if (row.targetType === "book" || row.targetType === "audiobook") {
        releaseDate = releaseDates.get(row.targetId) ?? null;
      } else if (row.targetType === "movie") {
        releaseDate = normalizeReleaseDate(row.movieReleaseDate);
      } else if (row.targetType === "album") {
        releaseDate = normalizeReleaseDate(row.albumReleaseDate);
      }

      const series = seriesMap.get(row.targetId);

      return [
        {
          id: row.id,
          targetType: row.targetType,
          targetId: row.targetId,
          targetSlug: librarySlug,
          targetTitle: libraryTitle,
          targetCoverFileId: libraryCover,
          role: row.role,
          character: row.character,
          sortOrder: row.sortOrder ?? 0,
          releaseDate,
          seriesName: series?.name ?? null,
          seriesPosition: series?.position ?? null,
        },
      ];
    });
  }

  private async resolveSeriesForTargets(
    bookTargetIds: string[],
    audiobookTargetIds: string[],
  ): Promise<Map<string, { name: string; position: number | null }>> {
    const [bookSeries, audiobookSeries] = await Promise.all([
      bookTargetIds.length > 0
        ? this.db
            .select({
              targetId: schema.bookSeriesMembers.bookId,
              seriesName: schema.bookSeries.name,
              position: schema.bookSeriesMembers.position,
            })
            .from(schema.bookSeriesMembers)
            .innerJoin(
              schema.bookSeries,
              eq(schema.bookSeriesMembers.seriesId, schema.bookSeries.id),
            )
            .where(inArray(schema.bookSeriesMembers.bookId, bookTargetIds))
        : Promise.resolve([]),
      audiobookTargetIds.length > 0
        ? this.db
            .select({
              targetId: schema.audiobookSeriesMembers.audiobookId,
              seriesName: schema.audiobookSeries.name,
              position: schema.audiobookSeriesMembers.position,
            })
            .from(schema.audiobookSeriesMembers)
            .innerJoin(
              schema.audiobookSeries,
              eq(
                schema.audiobookSeriesMembers.seriesId,
                schema.audiobookSeries.id,
              ),
            )
            .where(
              inArray(schema.audiobookSeriesMembers.audiobookId, audiobookTargetIds),
            )
        : Promise.resolve([]),
    ]);

    const seriesByTarget = new Map<
      string,
      { name: string; position: number | null }
    >();
    for (const s of [...bookSeries, ...audiobookSeries]) {
      seriesByTarget.set(s.targetId, {
        name: s.seriesName,
        position: s.position ?? null,
      });
    }
    return seriesByTarget;
  }

  /** Resolve a release date for book/audiobook credits from provider metadata payloads. */
  private async resolveWorkReleaseDates(
    bookTargetIds: string[],
    audiobookTargetIds: string[],
  ): Promise<Map<string, string>> {
    const targets: Array<{ targetType: string; targetId: string }> = [
      ...bookTargetIds.map((targetId) => ({ targetType: "book", targetId })),
      ...audiobookTargetIds.map((targetId) => ({
        targetType: "audiobook",
        targetId,
      })),
    ];
    if (targets.length === 0) return new Map();

    const ids = [...new Set(targets.map((t) => t.targetId))];
    const typeById = new Map(targets.map((t) => [t.targetId, t.targetType]));

    const rows = await this.db
      .select({
        subjectId: schema.metadataRecords.subjectId,
        subjectType: schema.metadataRecords.subjectType,
        providerKey: schema.metadataRecords.providerKey,
        payload: schema.metadataRecords.payload,
      })
      .from(schema.metadataRecords)
      .where(
        and(
          inArray(schema.metadataRecords.subjectType, ["book", "audiobook"]),
          inArray(schema.metadataRecords.subjectId, ids),
        ),
      );

    const bestPriority = new Map<string, number>();
    for (const row of rows) {
      const priority = releaseDatePriority(row.subjectType ?? "", row.providerKey);
      if (priority < 0) continue;
      const id = row.subjectId ?? "";
      const prev = bestPriority.get(id);
      if (prev === undefined || priority < prev) bestPriority.set(id, priority);
    }

    const chosenPayload = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (releaseDatePriority(row.subjectType ?? "", row.providerKey) !== bestPriority.get(row.subjectId ?? "")) {
        continue;
      }
      if (!chosenPayload.has(row.subjectId ?? "")) {
        chosenPayload.set(row.subjectId ?? "", row.payload);
      }
    }

    const result = new Map<string, string>();
    for (const [id, payload] of chosenPayload) {
      const targetType = typeById.get(id) ?? "";
      const raw =
        targetType === "audiobook" ? payload["releaseDate"] : payload["publicationDate"];
      const normalized = normalizeReleaseDate(raw);
      if (normalized) result.set(id, normalized);
    }
    return result;
  }

  async listPeopleByMediaType(
    mediaType: string,
    query: PeopleListQuery,
    role?: string,
  ): Promise<PeoplePaginatedResponse> {
    const roles = role
      ? [role]
      : (TARGET_TYPE_ROLES[mediaType] ?? []);

    const creditedPeopleIds = await this.db
      .selectDistinct({ peopleId: schema.personCredits.peopleId })
      .from(schema.personCredits)
      .where(
        roles.length > 0
          ? and(
              eq(schema.personCredits.targetType, mediaType),
              inArray(schema.personCredits.role, roles),
            )
          : eq(schema.personCredits.targetType, mediaType),
      );

    const ids = creditedPeopleIds.map((r) => r.peopleId);
    if (ids.length === 0) {
      return {
        items: [],
        pagination: {
          page: query.page,
          size: query.size,
          total: 0,
          totalPages: 0,
        },
        availableLetters: [],
      };
    }

    const { page, size, sort, letter, entityType } = query;
    const where = and(
      inArray(schema.people.id, ids),
      entityType ? eq(schema.people.entityType, entityType) : undefined,
      letter ? ilike(schema.people.sortName, `${letter}%`) : undefined,
    );

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(schema.people)
      .where(where);

    const peopleRows = await this.db
      .select({
        id: schema.people.id,
        slug: schema.people.slug,
        name: schema.people.name,
        sortName: schema.people.sortName,
        entityType: schema.people.entityType,
        photoFileId: schema.people.photoFileId,
      })
      .from(schema.people)
      .where(where)
      .orderBy(
        sort === "az"
          ? asc(schema.people.sortName)
          : sql`${schema.people.sortName} DESC`,
      )
      .limit(size)
      .offset((page - 1) * size);

    const peopleIds = peopleRows.map((p) => p.id);

    let creditCounts = new Map<string, Map<string, number>>();
    if (peopleIds.length > 0) {
      const creditRows = await this.db
        .select({
          peopleId: schema.personCredits.peopleId,
          targetType: schema.personCredits.targetType,
          cnt: count(),
        })
        .from(schema.personCredits)
        .where(inArray(schema.personCredits.peopleId, peopleIds))
        .groupBy(schema.personCredits.peopleId, schema.personCredits.targetType);

      creditCounts = new Map();
      for (const row of creditRows) {
        let byType = creditCounts.get(row.peopleId);
        if (!byType) {
          byType = new Map();
          creditCounts.set(row.peopleId, byType);
        }
        byType.set(row.targetType, row.cnt);
      }
    }

    const availableLettersRows = await this.db
      .select({
        letter: sql<string>`upper(left(${schema.people.sortName}, 1))`,
      })
      .from(schema.people)
      .where(inArray(schema.people.id, ids))
      .groupBy(sql`upper(left(${schema.people.sortName}, 1))`)
      .orderBy(sql`upper(left(${schema.people.sortName}, 1))`);

    const items: PeopleEntityCard[] = peopleRows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      entityType: p.entityType as PeopleEntityType,
      photoFileId: p.photoFileId,
      roleLabels: deriveRoleLabels(creditCounts, p.id),
      nextWork: null,
    }));

    return {
      items,
      pagination: {
        page,
        size,
        total,
        totalPages: Math.ceil(total / size),
      },
      availableLetters: availableLettersRows.map((r) => r.letter),
    };
  }

  async createPeopleEntity(input: {
    name: string;
    entityType?: PeopleEntityType;
  }): Promise<{ id: string; slug: string }> {
    const id = await generateUniquePeopleId(this.db);
    const slug = await allocatePeopleCanonicalSlug(this.db, input.name);
    if (!slug) throw new Error("Could not generate slug for people entity");

    const sortName = this.deriveSortName(input.name);

    await this.db.insert(schema.people).values({
      id,
      slug,
      entityType: input.entityType ?? "person",
      name: input.name,
      sortName,
    });

    return { id, slug };
  }

  async findOrCreateByName(
    name: string,
    entityType: PeopleEntityType = "person",
  ): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("people_name_required");

    const existing = await this.db
      .select({ id: schema.people.id })
      .from(schema.people)
      .where(
        and(
          sql`lower(${schema.people.name}) = lower(${trimmed})`,
          eq(schema.people.entityType, entityType),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0].id;

    const { id } = await this.createPeopleEntity({ name: trimmed, entityType });
    return id;
  }

  async ensurePeopleEntity(
    name: string,
    entityType: PeopleEntityType = "person",
  ): Promise<{ id: string; slug: string }> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("people_name_required");

    const existing = await this.db
      .select({ id: schema.people.id, slug: schema.people.slug })
      .from(schema.people)
      .where(
        and(
          sql`lower(${schema.people.name}) = lower(${trimmed})`,
          eq(schema.people.entityType, entityType),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];

    return this.createPeopleEntity({ name: trimmed, entityType });
  }

  /** Resolve names to canonical entities and replace a target's credits for the given roles. */
  async syncTargetCredits(
    targetType: string,
    targetId: string,
    entries: Array<{
      name: string;
      role: string;
      character?: string;
      sortOrder: number;
    }>,
  ): Promise<Map<string, string>> {
    const resolved = await this.resolvePeopleBatch(
      entries.map((e) => ({ name: e.name })),
    );

    const roles = [...new Set(entries.map((e) => e.role))];
    await this.db
      .delete(schema.personCredits)
      .where(
        and(
          eq(schema.personCredits.targetType, targetType),
          eq(schema.personCredits.targetId, targetId),
          inArray(schema.personCredits.role, roles),
        ),
      );

    if (entries.length > 0) {
      await this.db
        .insert(schema.personCredits)
        .values(
          entries.map((e) => ({
            id: crypto.randomUUID(),
            peopleId: resolved.get(e.name) as string,
            targetType,
            targetId,
            role: e.role,
            character: e.character ?? null,
            sortOrder: e.sortOrder,
          })),
        )
        .onConflictDoNothing();
    }

    return resolved;
  }

  async backfillBookAuthors(): Promise<{ processed: number }> {
    const rows = await this.db
      .select({
        id: schema.bookAuthors.id,
        bookId: schema.bookAuthors.bookId,
        name: schema.bookAuthors.name,
        sortOrder: schema.bookAuthors.sortOrder,
      })
      .from(schema.bookAuthors)
      .where(isNull(schema.bookAuthors.peopleId));

    if (rows.length === 0) return { processed: 0 };

    const names = [...new Set(rows.map((r) => r.name))];
    const resolved = await this.resolvePeopleBatch(
      names.map((name) => ({ name })),
    );

    await this.db
      .insert(schema.personCredits)
      .values(
        rows.map((r) => ({
          id: crypto.randomUUID(),
          peopleId: resolved.get(r.name) as string,
          targetType: "book",
          targetId: r.bookId,
          role: "author",
          sortOrder: r.sortOrder,
        })),
      )
      .onConflictDoNothing();

    for (const row of rows) {
      await this.db
        .update(schema.bookAuthors)
        .set({ peopleId: resolved.get(row.name) })
        .where(eq(schema.bookAuthors.id, row.id));
    }

    return { processed: rows.length };
  }

  async backfillAudiobookCredits(): Promise<{ processed: number }> {
    const authorRows = await this.db
      .select({
        id: schema.audiobookAuthors.id,
        audiobookId: schema.audiobookAuthors.audiobookId,
        name: schema.audiobookAuthors.name,
        sortOrder: schema.audiobookAuthors.sortOrder,
      })
      .from(schema.audiobookAuthors)
      .where(isNull(schema.audiobookAuthors.peopleId));

    const narratorRows = await this.db
      .select({
        id: schema.audiobookNarrators.id,
        audiobookId: schema.audiobookNarrators.audiobookId,
        name: schema.audiobookNarrators.name,
        sortOrder: schema.audiobookNarrators.sortOrder,
      })
      .from(schema.audiobookNarrators)
      .where(isNull(schema.audiobookNarrators.peopleId));

    const authorNames = [...new Set(authorRows.map((r) => r.name))];
    const narratorNames = [...new Set(narratorRows.map((r) => r.name))];
    const resolved = await this.resolvePeopleBatch(
      [...authorNames, ...narratorNames].map((name) => ({ name })),
    );

    await this.db
      .insert(schema.personCredits)
      .values([
        ...authorRows.map((r) => ({
          id: crypto.randomUUID(),
          peopleId: resolved.get(r.name) as string,
          targetType: "audiobook",
          targetId: r.audiobookId,
          role: "author",
          sortOrder: r.sortOrder,
        })),
        ...narratorRows.map((r) => ({
          id: crypto.randomUUID(),
          peopleId: resolved.get(r.name) as string,
          targetType: "audiobook",
          targetId: r.audiobookId,
          role: "narrator",
          sortOrder: r.sortOrder,
        })),
      ])
      .onConflictDoNothing();

    for (const row of authorRows) {
      await this.db
        .update(schema.audiobookAuthors)
        .set({ peopleId: resolved.get(row.name) })
        .where(eq(schema.audiobookAuthors.id, row.id));
    }
    for (const row of narratorRows) {
      await this.db
        .update(schema.audiobookNarrators)
        .set({ peopleId: resolved.get(row.name) })
        .where(eq(schema.audiobookNarrators.id, row.id));
    }

    return { processed: authorRows.length + narratorRows.length };
  }

  async backfillMusicCredits(): Promise<{ processed: number }> {
    const unlinkedArtists = await this.db
      .select({
        id: schema.musicArtists.id,
        name: schema.musicArtists.name,
      })
      .from(schema.musicArtists)
      .where(isNull(schema.musicArtists.peopleId));

    const artistNames = [...new Set(unlinkedArtists.map((r) => r.name))];
    const resolved = await this.resolvePeopleBatch(
      artistNames.map((name) => ({ name })),
    );
    for (const row of unlinkedArtists) {
      await this.db
        .update(schema.musicArtists)
        .set({ peopleId: resolved.get(row.name) })
        .where(eq(schema.musicArtists.id, row.id));
    }

    const albumRows = await this.db
      .select({
        albumId: schema.albumArtists.albumId,
        artistId: schema.albumArtists.artistId,
        sortOrder: schema.albumArtists.sortOrder,
        name: schema.musicArtists.name,
      })
      .from(schema.albumArtists)
      .innerJoin(
        schema.musicArtists,
        eq(schema.albumArtists.artistId, schema.musicArtists.id),
      );

    const albumCredits = [];
    for (const row of albumRows) {
      let peopleId = (await this.db.query.musicArtists.findFirst({
        where: eq(schema.musicArtists.id, row.artistId),
        columns: { peopleId: true },
      }))?.peopleId;
      if (!peopleId) {
        peopleId = await this.findOrCreateByName(row.name);
        await this.db
          .update(schema.musicArtists)
          .set({ peopleId })
          .where(eq(schema.musicArtists.id, row.artistId));
      }
      albumCredits.push({
        id: crypto.randomUUID(),
        peopleId,
        targetType: "album",
        targetId: row.albumId,
        role: "artist",
        sortOrder: row.sortOrder,
      });
    }

    if (albumCredits.length > 0) {
      await this.db
        .insert(schema.personCredits)
        .values(albumCredits)
        .onConflictDoNothing();
    }

    return { processed: unlinkedArtists.length + albumCredits.length };
  }

  async createCredit(input: {
    peopleId: string;
    targetType: string;
    targetId: string;
    role: string;
    character?: string;
    sortOrder?: number;
  }): Promise<void> {
    await this.db.insert(schema.personCredits).values({
      id: crypto.randomUUID(),
      peopleId: input.peopleId,
      targetType: input.targetType,
      targetId: input.targetId,
      role: input.role,
      character: input.character ?? null,
      sortOrder: input.sortOrder ?? 0,
    });
  }

  async createCreditsBatch(
    credits: Array<{
      peopleId: string;
      targetType: string;
      targetId: string;
      role: string;
      character?: string;
      sortOrder?: number;
      provenance?: { sourceKey: string; origin: "adopt" };
    }>,
  ): Promise<void> {
    if (credits.length === 0) return;
    await this.db.insert(schema.personCredits).values(
      credits.map((c) => ({
        id: crypto.randomUUID(),
        peopleId: c.peopleId,
        targetType: c.targetType,
        targetId: c.targetId,
        role: c.role,
        character: c.character ?? null,
        sortOrder: c.sortOrder ?? 0,
      })),
    );
  }

  async resolvePeopleBatch(
    references: Array<{
      name: string;
      entityType?: PeopleEntityType;
    }>,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const unresolved: Array<{
      name: string;
      entityType: PeopleEntityType;
    }> = [];

    const normalizedNames = references.map((r) => ({
      name: r.name,
      entityType: (r.entityType ?? "person") as PeopleEntityType,
      normalized: r.name.toLowerCase().trim(),
    }));

    const existingByName = await this.db
      .select({ id: schema.people.id, name: schema.people.name })
      .from(schema.people)
      .where(
        or(
          ...normalizedNames.map((n) =>
            and(
              sql`lower(${schema.people.name}) = lower(${n.name})`,
              eq(schema.people.entityType, n.entityType),
            ),
          ),
        ),
      );

    const nameToId = new Map(
      existingByName.map((r) => [r.name.toLowerCase().trim(), r.id]),
    );

    for (const ref of normalizedNames) {
      const existingId = nameToId.get(ref.normalized);
      if (existingId) {
        result.set(ref.name, existingId);
      } else {
        unresolved.push(ref);
      }
    }

    for (const ref of unresolved) {
      const { id } = await this.createPeopleEntity({
        name: ref.name,
        entityType: ref.entityType,
      });
      result.set(ref.name, id);
    }

    return result;
  }

  private deriveSortName(name: string): string {
    const trimmed = name.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("the ")) {
      return trimmed.slice(4) + ", the";
    }
    return trimmed;
  }

  async getPersonRow(personId: string) {
    return this.db.query.people.findFirst({
      where: eq(schema.people.id, personId),
    });
  }

  async readPersonCanonicalColumn(
    person: Awaited<ReturnType<PeopleService["getPersonRow"]>>,
    fieldId: CanonicalFieldId,
  ): Promise<unknown> {
    if (!person) return undefined;
    const column = PERSON_COLUMN_BY_FIELD[fieldId];
    if (!column) return undefined;
    return (person as unknown as Record<string, unknown>)[column] ?? undefined;
  }

  async updatePersonFields(
    personId: string,
    patch: Partial<{
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
      photoFileId: string | null;
    }>,
  ): Promise<void> {
    await this.db
      .update(schema.people)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.people.id, personId));
  }

  async getPersonLink(linkId: string): Promise<PersonLinkEditorRow> {
    const row = await this.db.query.personLinks.findFirst({
      where: eq(schema.personLinks.id, linkId),
    });
    if (!row) throw new NotFoundError("Person link not found");
    return {
      id: row.id,
      kind: (row.kind ?? "other") as PersonLinkKind,
      label: row.label,
      url: row.url,
      sourceLabel: provenanceSourceLabel(row.provenance),
    };
  }

  async createPersonLink(
    personId: string,
    input: {
      kind: PersonLinkKind;
      label: string | null;
      url: string;
      sortOrder?: number;
      provenance?: { sourceKey: string; origin: MetadataProvenanceOrigin };
    },
  ): Promise<PersonLinkEditorRow> {
    const max = await this.db
      .select({
        max: sql<number | null>`max(${schema.personLinks.sortOrder})`,
      })
      .from(schema.personLinks)
      .where(eq(schema.personLinks.peopleId, personId));
    const sortOrder = input.sortOrder ?? (max[0]?.max ?? -1) + 1;
    const id = crypto.randomUUID();
    await this.db.insert(schema.personLinks).values({
      id,
      peopleId: personId,
      kind: input.kind,
      label: input.label,
      url: input.url,
      sortOrder,
      provenance: input.provenance ?? { sourceKey: "feylore", origin: "edit" },
    });
    return this.getPersonLink(id);
  }

  async updatePersonLink(
    linkId: string,
    personId: string,
    patch: Partial<{
      kind: PersonLinkKind;
      label: string | null;
      url: string;
      sortOrder: number;
    }>,
  ): Promise<PersonLinkEditorRow> {
    const existing = await this.db.query.personLinks.findFirst({
      where: and(
        eq(schema.personLinks.id, linkId),
        eq(schema.personLinks.peopleId, personId),
      ),
    });
    if (!existing) throw new NotFoundError("Person link not found");
    await this.db
      .update(schema.personLinks)
      .set(patch)
      .where(eq(schema.personLinks.id, linkId));
    return this.getPersonLink(linkId);
  }

  async deletePersonLink(linkId: string, personId: string): Promise<void> {
    await this.db
      .delete(schema.personLinks)
      .where(
        and(
          eq(schema.personLinks.id, linkId),
          eq(schema.personLinks.peopleId, personId),
        ),
      );
  }

  async setPersonProviderIdentifier(
    personId: string,
    input: {
      provider: string;
      identifier: string;
      provenance?: { sourceKey: string; origin: MetadataProvenanceOrigin };
    },
  ): Promise<void> {
    const existing = await this.db.query.personProviderIdentifiers.findFirst({
      where: and(
        eq(schema.personProviderIdentifiers.peopleId, personId),
        eq(schema.personProviderIdentifiers.provider, input.provider),
      ),
    });
    const provenance = input.provenance ?? { sourceKey: "feylore", origin: "edit" };
    if (existing) {
      await this.db
        .update(schema.personProviderIdentifiers)
        .set({ identifier: input.identifier, provenance })
        .where(eq(schema.personProviderIdentifiers.id, existing.id));
      return;
    }
    await this.db.insert(schema.personProviderIdentifiers).values({
      id: crypto.randomUUID(),
      peopleId: personId,
      provider: input.provider,
      identifier: input.identifier,
      provenance,
    });
  }

  async deletePersonProviderIdentifier(
    personId: string,
    provider: string,
  ): Promise<void> {
    await this.db
      .delete(schema.personProviderIdentifiers)
      .where(
        and(
          eq(schema.personProviderIdentifiers.peopleId, personId),
          eq(schema.personProviderIdentifiers.provider, provider),
        ),
      );
  }

  async removeCredit(
    personId: string,
    targetType: string,
    targetId: string,
    role?: string,
  ): Promise<void> {
    await this.db
      .delete(schema.personCredits)
      .where(
        and(
          eq(schema.personCredits.peopleId, personId),
          eq(schema.personCredits.targetType, targetType),
          eq(schema.personCredits.targetId, targetId),
          role ? eq(schema.personCredits.role, role) : undefined,
        ),
      );
  }

  async listDuplicateCandidates(personId: string) {
    const person = await this.getPersonRow(personId);
    if (!person) return [];

    const matches = await this.db
      .select()
      .from(schema.people)
      .where(
        and(
          ne(schema.people.id, personId),
          or(
            ilike(schema.people.name, `%${person.name}%`),
            ilike(schema.people.sortName, `%${person.sortName}%`),
          ),
        ),
      );

    const candidates: Array<{
      id: string;
      name: string;
      entityType: PeopleEntityType;
      creditCounts: Record<string, number>;
      score: number;
    }> = [];
    for (const match of matches) {
      let score = 0;
      if (match.name.toLowerCase() === person.name.toLowerCase()) score += 3;
      else if (
        match.name.toLowerCase().includes(person.name.toLowerCase()) ||
        person.name.toLowerCase().includes(match.name.toLowerCase())
      ) {
        score += 2;
      }
      if (match.sortName.toLowerCase() === person.sortName.toLowerCase()) {
        score += 1;
      }
      if (score === 0) continue;
      const counts = await this.creditCountsForPerson(match.id);
      const creditCounts: Record<string, number> = {};
      for (const [targetType, n] of counts) creditCounts[targetType] = n;
      candidates.push({
        id: match.id,
        name: match.name,
        entityType: match.entityType,
        creditCounts,
        score,
      });
    }
    return candidates.sort((a, b) => b.score - a.score);
  }

  async mergePersonInto(
    targetPersonId: string,
    sourcePersonId: string,
  ): Promise<{ movedCredits: number }> {
    if (targetPersonId === sourcePersonId) {
      throw new ValidationError("Cannot merge a person into itself");
    }
    const target = await this.getPersonRow(targetPersonId);
    const source = await this.getPersonRow(sourcePersonId);
    if (!target || !source) throw new NotFoundError("People entity not found");

    let movedCredits = 0;
    const credits = await this.db
      .select()
      .from(schema.personCredits)
      .where(eq(schema.personCredits.peopleId, sourcePersonId));
    for (const credit of credits) {
      const existing = await this.db.query.personCredits.findFirst({
        where: and(
          eq(schema.personCredits.peopleId, targetPersonId),
          eq(schema.personCredits.targetType, credit.targetType),
          eq(schema.personCredits.targetId, credit.targetId),
          eq(schema.personCredits.role, credit.role),
        ),
      });
      if (existing) continue;
      await this.db.insert(schema.personCredits).values({
        id: crypto.randomUUID(),
        peopleId: targetPersonId,
        targetType: credit.targetType,
        targetId: credit.targetId,
        role: credit.role,
        character: credit.character,
        sortOrder: credit.sortOrder,
        creditProvenance: credit.creditProvenance,
      });
      movedCredits++;
    }

    const links = await this.db
      .select()
      .from(schema.personLinks)
      .where(eq(schema.personLinks.peopleId, sourcePersonId));
    for (const link of links) {
      await this.db.insert(schema.personLinks).values({
        id: crypto.randomUUID(),
        peopleId: targetPersonId,
        kind: link.kind,
        label: link.label,
        url: link.url,
        sortOrder: link.sortOrder,
        provenance: link.provenance,
      });
    }

    const identifiers = await this.db
      .select()
      .from(schema.personProviderIdentifiers)
      .where(eq(schema.personProviderIdentifiers.peopleId, sourcePersonId));
    for (const identifier of identifiers) {
      const existing = await this.db.query.personProviderIdentifiers.findFirst({
        where: and(
          eq(schema.personProviderIdentifiers.provider, identifier.provider),
          eq(schema.personProviderIdentifiers.identifier, identifier.identifier),
        ),
      });
      if (existing) continue;
      await this.db.insert(schema.personProviderIdentifiers).values({
        id: crypto.randomUUID(),
        peopleId: targetPersonId,
        provider: identifier.provider,
        identifier: identifier.identifier,
        provenance: identifier.provenance,
      });
    }

    const records = await this.db
      .select()
      .from(schema.metadataRecords)
      .where(
        and(
          eq(schema.metadataRecords.subjectType, "person"),
          eq(schema.metadataRecords.subjectId, sourcePersonId),
        ),
      );
    for (const record of records) {
      const existing = await this.db.query.metadataRecords.findFirst({
        where: and(
          eq(schema.metadataRecords.providerKey, record.providerKey),
          eq(schema.metadataRecords.subjectType, "person"),
          eq(schema.metadataRecords.subjectId, targetPersonId),
        ),
      });
      if (existing) continue;
      await this.db.insert(schema.metadataRecords).values({
        id: crypto.randomUUID(),
        providerKey: record.providerKey,
        externalId: record.externalId,
        subjectType: "person",
        subjectId: targetPersonId,
        payload: record.payload,
        fetchedAt: record.fetchedAt,
      });
    }

    const provenanceRows = await this.db
      .select()
      .from(schema.metadataFieldProvenance)
      .where(
        and(
          eq(schema.metadataFieldProvenance.subjectType, "person"),
          eq(schema.metadataFieldProvenance.subjectId, sourcePersonId),
        ),
      );
    for (const row of provenanceRows) {
      const targetField = await this.db.query.metadataFieldProvenance.findFirst({
        where: and(
          eq(schema.metadataFieldProvenance.subjectType, "person"),
          eq(schema.metadataFieldProvenance.subjectId, targetPersonId),
          eq(schema.metadataFieldProvenance.field, row.field),
        ),
      });
      if (targetField) continue;
      await this.db
        .update(schema.metadataFieldProvenance)
        .set({ subjectId: targetPersonId })
        .where(
          and(
            eq(schema.metadataFieldProvenance.subjectType, "person"),
            eq(schema.metadataFieldProvenance.subjectId, sourcePersonId),
            eq(schema.metadataFieldProvenance.field, row.field),
          ),
        );
    }

    const overrides = await this.db
      .select()
      .from(schema.fieldOverrides)
      .where(
        and(
          eq(schema.fieldOverrides.subjectType, "person"),
          eq(schema.fieldOverrides.subjectId, sourcePersonId),
        ),
      );
    for (const override of overrides) {
      const existing = await this.db.query.fieldOverrides.findFirst({
        where: and(
          eq(schema.fieldOverrides.subjectType, "person"),
          eq(schema.fieldOverrides.subjectId, targetPersonId),
          eq(schema.fieldOverrides.field, override.field),
        ),
      });
      if (existing) continue;
      await this.db.insert(schema.fieldOverrides).values({
        id: crypto.randomUUID(),
        subjectType: "person",
        subjectId: targetPersonId,
        field: override.field,
        value: override.value,
        setByUserId: override.setByUserId,
      });
    }

    await this.db
      .delete(schema.metadataRecords)
      .where(
        and(
          eq(schema.metadataRecords.subjectType, "person"),
          eq(schema.metadataRecords.subjectId, sourcePersonId),
        ),
      );
    await this.db
      .delete(schema.metadataFieldProvenance)
      .where(
        and(
          eq(schema.metadataFieldProvenance.subjectType, "person"),
          eq(schema.metadataFieldProvenance.subjectId, sourcePersonId),
        ),
      );
    await this.db
      .delete(schema.fieldOverrides)
      .where(
        and(
          eq(schema.fieldOverrides.subjectType, "person"),
          eq(schema.fieldOverrides.subjectId, sourcePersonId),
        ),
      );
    await this.db.delete(schema.people).where(eq(schema.people.id, sourcePersonId));

    return { movedCredits };
  }

  async listPersonLinks(personId: string): Promise<PersonLinkEditorRow[]> {
    const rows = await this.db
      .select()
      .from(schema.personLinks)
      .where(eq(schema.personLinks.peopleId, personId))
      .orderBy(asc(schema.personLinks.sortOrder));
    return rows.map((r) => ({
      id: r.id,
      kind: (r.kind ?? "other") as PersonLinkKind,
      label: r.label,
      url: r.url,
      sourceLabel: provenanceSourceLabel(r.provenance),
    }));
  }

  async listPersonProviderIdentifiers(
    personId: string,
  ): Promise<Array<{ provider: string; identifier: string; sourceLabel: string | null }>> {
    const rows = await this.db
      .select()
      .from(schema.personProviderIdentifiers)
      .where(eq(schema.personProviderIdentifiers.peopleId, personId))
      .orderBy(asc(schema.personProviderIdentifiers.createdAt));
    return rows.map((r) => ({
      provider: r.provider,
      identifier: r.identifier,
      sourceLabel: provenanceSourceLabel(r.provenance),
    }));
  }

  async creditCountsForPerson(personId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        targetType: schema.personCredits.targetType,
        cnt: count(),
      })
      .from(schema.personCredits)
      .where(eq(schema.personCredits.peopleId, personId))
      .groupBy(schema.personCredits.targetType);
    return new Map(rows.map((r) => [r.targetType, r.cnt]));
  }

  async roleLabelsForPerson(personId: string): Promise<string[]> {
    const counts = await this.creditCountsForPerson(personId);
    return deriveRoleLabelsForPerson(counts);
  }
}

function provenanceSourceLabel(provenance: unknown): string | null {
  if (!provenance || typeof provenance !== "object") return null;
  const sourceKey = (provenance as { sourceKey?: unknown }).sourceKey;
  return typeof sourceKey === "string" && sourceKey ? sourceKey : null;
}

function normalizeReleaseDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  return null;
}

function releaseDatePriority(subjectType: string, providerKey: string): number {
  const order =
    subjectType === "audiobook"
      ? ["audible", "embedded.audio.tags"]
      : ["hardcover", "open-library", "embedded.epub.opf"];
  const priority = order.indexOf(providerKey);
  return priority < 0 ? -1 : priority;
}

function deriveRoleLabelsForPerson(counts: Map<string, number>): string[] {
  const labels: string[] = [];
  if ((counts.get("book") ?? 0) > 0) labels.push("Author");
  if ((counts.get("audiobook") ?? 0) > 0) labels.push("Narrator");
  if ((counts.get("movie") ?? 0) + (counts.get("tvShow") ?? 0) > 0) {
    labels.push("Actor");
  }
  if ((counts.get("album") ?? 0) > 0) labels.push("Artist");
  if ((counts.get("podcast") ?? 0) > 0) labels.push("Podcast");
  return labels.length > 0 ? labels : ["Contributor"];
}
