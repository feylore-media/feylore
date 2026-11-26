import { eq, and, inArray, ilike, asc, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { NotFoundError, ForbiddenError } from "../../../shared/errors.js";
import {
  inferFormatFromPath,
  titleFromPath,
  type RepresentationFormat,
} from "../../../shared/subject.js";
import type { RepresentationService } from "../representations/service.js";
import type { LibraryMembershipService } from "../library-membership/service.js";
import type { FileService } from "../files/service.js";
import type { MetadataService } from "../metadata/service.js";
import type { MetadataPolicyService } from "../metadata/policy.js";
import type { MetadataProvenanceService } from "../metadata/provenance.js";
import type { CustomFieldService } from "../metadata/custom-fields.js";
import type { UserStateService } from "../user-state/service.js";
import type { RelationshipService } from "../relationships/service.js";
import type { PostgresSearchIndex } from "../search/index.js";
import type { PeopleService } from "../people/service.js";
import type {
  PhysicalHoldingService,
  PhysicalHoldingPublic,
} from "./physical-holdings.js";
import type { JobService } from "../jobs/service.js";
import type { ReadingProgressService } from "../reading-progress/service.js";
import { JOB_TYPES } from "../jobs/types.js";
import type {
  BookListQuery,
  BookListItem,
  BookDetail,
  BookJournalSummary,
  BookReadingStateDetail,
  BookSeriesDetail,
  BookDeletionPreview,
  ReadingLocator,
  SeriesMember,
} from "../../../shared/books.js";
import { resolveBookMetadataFields } from "../metadata/book-detail-metadata.js";
import { parseCombinedSeriesValue } from "../../../shared/series-normalization.js";
import { resolveEpubRepresentationDetails } from "./epub-representation-details.js";
import type { EpubOpfBibliographic } from "../metadata/extractors/epub-opf.js";
import { detectIsbn } from "../metadata/extractors/epub-opf.js";
import {
  allocateBookCanonicalSlug,
  generateUniqueBookId,
  getBookBySlug,
  pendingBookIdentity,
  promoteBookSlugIfPending,
} from "./identity.js";

const BOOK_FORMATS: RepresentationFormat[] = [
  "epub",
  "pdf",
  "cbz",
  "cbr",
  "mobi",
  "azw3",
];

export class BooksService {
  private jobs: JobService | undefined;
  private readingProgress?: ReadingProgressService;
  private physicalHoldings?: PhysicalHoldingService;

  constructor(
    private readonly db: Database,
    private readonly representations: RepresentationService,
    private readonly libraryMembership: LibraryMembershipService,
    private readonly files: FileService,
    private readonly metadata: MetadataService,
    private readonly metadataPolicy: MetadataPolicyService,
    private readonly metadataProvenance: MetadataProvenanceService,
    private readonly customFields: CustomFieldService,
    private readonly userState: UserStateService,
    private readonly relationships: RelationshipService,
    private readonly search: PostgresSearchIndex,
    private readonly people: PeopleService,
  ) {}

  setPhysicalHoldingService(service: PhysicalHoldingService) {
    this.physicalHoldings = service;
  }

  private async getPhysicalHoldingForBook(
    userId: string,
    bookId: string,
  ): Promise<PhysicalHoldingPublic | null> {
    if (!this.physicalHoldings) return null;
    return this.physicalHoldings.getForUser(userId, bookId);
  }

  setJobService(jobs: JobService) {
    this.jobs = jobs;
  }

  setReadingProgressService(service: ReadingProgressService) {
    this.readingProgress = service;
  }

  private async getReadingProgressForBook(userId: string, bookId: string) {
    if (this.readingProgress) {
      const primary = await this.readingProgress.getPrimaryProgressForWork(
        userId,
        "book",
        bookId,
      );
      if (!primary) return null;
      return {
        locator: primary.progress.locator,
        representationId: primary.representationId,
        updatedAt: primary.progress.updatedAt,
      };
    }
    return this.userState.getReadingProgress(userId, "book", bookId);
  }

  async createBook(input: {
    title: string;
    subtitle?: string;
    description?: string;
    authors?: string[];
    genres?: string[];
  }) {
    const id = await generateUniqueBookId(this.db);
    const canonicalSlug = await allocateBookCanonicalSlug(this.db, input.title);
    const identity = canonicalSlug
      ? { id, slug: canonicalSlug, slugStatus: "canonical" as const }
      : pendingBookIdentity(id);

    await this.db.insert(schema.books).values({
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
      workType: "book",
      workId: id,
      label: "default",
    });

    await this.db.insert(schema.creativeWorkManifestations).values({
      id: generateId(),
      expressionId,
      label: "default",
    });

    if (input.authors?.length) {
      await this.setAuthors(id, input.authors);
    }
    if (input.genres?.length) {
      await this.setGenres(id, input.genres);
    }

    await this.indexBook(id);
    return id;
  }

  private async createPendingBook(input: { title: string }) {
    const id = await generateUniqueBookId(this.db);
    const identity = pendingBookIdentity(id);

    await this.db.insert(schema.books).values({
      id: identity.id,
      slug: identity.slug,
      slugStatus: identity.slugStatus,
      title: input.title,
    });

    const expressionId = generateId();
    await this.db.insert(schema.creativeWorkExpressions).values({
      id: expressionId,
      workType: "book",
      workId: id,
      label: "default",
    });

    await this.db.insert(schema.creativeWorkManifestations).values({
      id: generateId(),
      expressionId,
      label: "default",
    });

    await this.indexBook(id);
    return id;
  }

  async updateBook(
    id: string,
    input: Partial<{
      title: string;
      subtitle: string;
      description: string;
      coverFileId: string | null;
    }>,
  ) {
    await this.getBook(id);
    await this.db
      .update(schema.books)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.books.id, id));
    await this.indexBook(id);
  }

  async deleteBook(id: string) {
    await this.getBook(id);
    await this.search.remove("book", id);
    // Physical holdings are user-scoped ownership records, not files: removing
    // the Work removes every user's holding for it (the FK also cascades).
    // Library memberships are intentionally left to existing behavior.
    await this.db
      .delete(schema.physicalHoldings)
      .where(
        and(
          eq(schema.physicalHoldings.workType, "book"),
          eq(schema.physicalHoldings.workId, id),
        ),
      );
    await this.db.delete(schema.books).where(eq(schema.books.id, id));
  }

  /**
   * Destructive-action summary for Work deletion confirmation. Reports every
   * dependent record class — files, manifestations, physical holdings/users,
   * Journal data, reviews, and relationships — before deletion.
   */
  async getDeletionPreview(id: string): Promise<BookDeletionPreview> {
    await this.getBook(id);
    const expressions = await this.db
      .select({ id: schema.creativeWorkExpressions.id })
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          eq(schema.creativeWorkExpressions.workType, "book"),
          eq(schema.creativeWorkExpressions.workId, id),
        ),
      );
    const manifestationIds =
      expressions.length > 0
        ? (
            await this.db
              .select({ id: schema.creativeWorkManifestations.id })
              .from(schema.creativeWorkManifestations)
              .where(
                inArray(
                  schema.creativeWorkManifestations.expressionId,
                  expressions.map((e) => e.id),
                ),
              )
          ).map((m) => m.id)
        : [];
    const reps =
      manifestationIds.length > 0
        ? await this.db
            .select({ id: schema.representations.id })
            .from(schema.representations)
            .where(
              inArray(schema.representations.manifestationId, manifestationIds),
            )
        : [];
    const fileLinks =
      reps.length > 0
        ? await this.db
            .select({ fileId: schema.representationFiles.fileId })
            .from(schema.representationFiles)
            .where(
              inArray(
                schema.representationFiles.representationId,
                reps.map((r) => r.id),
              ),
            )
        : [];
    const holdings = this.physicalHoldings
      ? await this.physicalHoldings.countForWork(id)
      : { holdings: 0, users: 0 };
    const [bookmarks, annotations, reviews, rels] = await Promise.all([
      this.db
        .select({ id: schema.userBookmarks.id })
        .from(schema.userBookmarks)
        .where(
          and(
            eq(schema.userBookmarks.subjectType, "book"),
            eq(schema.userBookmarks.subjectId, id),
          ),
        ),
      this.db
        .select({ id: schema.userAnnotations.id })
        .from(schema.userAnnotations)
        .where(
          and(
            eq(schema.userAnnotations.subjectType, "book"),
            eq(schema.userAnnotations.subjectId, id),
          ),
        ),
      this.db
        .select({ id: schema.bookReviews.id })
        .from(schema.bookReviews)
        .where(eq(schema.bookReviews.bookId, id)),
      this.relationships.listForSource("book", id),
    ]);
    return {
      representations: reps.length,
      files: new Set(fileLinks.map((f) => f.fileId)).size,
      manifestations: manifestationIds.length,
      physicalHoldings: holdings,
      journal: {
        bookmarks: bookmarks.length,
        annotations: annotations.length,
      },
      reviews: reviews.length,
      relationships: rels.length,
    };
  }

  async getBook(id: string) {
    const book = await this.db.query.books.findFirst({
      where: eq(schema.books.id, id),
    });
    if (!book) throw new NotFoundError("Book not found");
    return book;
  }

  async getBookByRef(ref: string) {
    return getBookBySlug(this.db, ref);
  }

  async ensureUserAccess(userId: string, bookId: string) {
    const membership = await this.libraryMembership.listForUser(userId, "book");
    if (!membership.some((m) => m.targetId === bookId)) {
      throw new ForbiddenError("Book not in your library");
    }
  }

  /** Reader availability for composed experiences without loading private Journal data. */
  async readableBookIds(
    userId: string,
    bookIds: string[],
  ): Promise<Set<string>> {
    if (!bookIds.length) return new Set();
    const rows = await this.db.execute<{
      id: string;
    }>(sql`SELECT DISTINCT e.work_id AS id FROM creative_work_expressions e
      JOIN creative_work_manifestations m ON m.expression_id=e.id
      JOIN representations r ON r.manifestation_id=m.id
      JOIN representation_files f ON f.representation_id=r.id
      JOIN library_memberships l ON l.target_type='book' AND l.target_id=e.work_id AND l.user_id=${userId}
      WHERE e.work_type='book' AND e.work_id IN (${sql.join(
        bookIds.map((id) => sql`${id}`),
        sql`,`,
      )}) AND r.format='epub' AND r.unavailable_at IS NULL`);
    return new Set(rows.rows.map((row) => row.id));
  }
  async canReadBook(userId: string, bookId: string): Promise<boolean> {
    try {
      await this.ensureUserAccess(userId, bookId);
    } catch (error) {
      if (error instanceof ForbiddenError) return false;
      throw error;
    }
    const reps = await this.representationsForBook(bookId);
    for (const rep of reps) {
      if (rep.format !== "epub" || rep.unavailableAt) continue;
      if (
        (await this.representations.listFilesForRepresentation(rep.id)).length
      )
        return true;
    }
    return false;
  }

  async findBookIdForRepresentation(
    representationId: string,
  ): Promise<string | null> {
    const rep = await this.representations.get(representationId);
    if (!rep.manifestationId) return null;

    const manifestation =
      await this.db.query.creativeWorkManifestations.findFirst({
        where: eq(schema.creativeWorkManifestations.id, rep.manifestationId),
      });
    if (!manifestation) return null;

    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: eq(schema.creativeWorkExpressions.id, manifestation.expressionId),
    });
    if (!expression || expression.workType !== "book") return null;
    return expression.workId;
  }

  async ensureRepresentationAccess(userId: string, representationId: string) {
    const bookId = await this.findBookIdForRepresentation(representationId);
    if (!bookId) throw new ForbiddenError("Representation not accessible");
    await this.ensureUserAccess(userId, bookId);
    return bookId;
  }

  async listBooksForUser(
    userId: string,
    query: BookListQuery = {} as BookListQuery,
  ) {
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "book",
    );
    // Physical ownership is separate from library membership: a physically
    // owned Work may have no membership row. Ownership filters therefore
    // start from the user's holdings, not from memberships.
    const ownershipFiltered =
      query.physicalOwned === true || query.physicalWithoutDigital === true;
    if (memberships.length === 0 && !ownershipFiltered) {
      return { items: [] as BookListItem[], nextCursor: undefined };
    }

    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );
    let bookIds = memberships.map((m) => m.targetId);
    if (ownershipFiltered) {
      if (!this.physicalHoldings) {
        return { items: [] as BookListItem[], nextCursor: undefined };
      }
      const held = await this.physicalHoldings.listForUser(userId, {
        withoutDigital: query.physicalWithoutDigital === true,
      });
      bookIds = held.map((h) => h.workId);
    } else if (query.physicalOwned === false) {
      if (this.physicalHoldings) {
        const held = await this.physicalHoldings.listForUser(userId);
        const heldIds = new Set(held.map((h) => h.workId));
        bookIds = bookIds.filter((id) => !heldIds.has(id));
      }
    }

    if (query.q) {
      const searchResults = await this.search.query({
        q: query.q,
        types: ["book"],
        limit: 200,
      });
      const searchedIds = new Set(searchResults.results.map((r) => r.id));
      if (searchedIds.size > 0) {
        bookIds = bookIds.filter((id) => searchedIds.has(id));
      } else {
        bookIds = await this.search.searchBooksByTitle(
          this.db,
          bookIds,
          query.q,
        );
      }
    }

    if (query.author) {
      const authorRows = await this.db
        .select({ bookId: schema.bookAuthors.bookId })
        .from(schema.bookAuthors)
        .where(ilike(schema.bookAuthors.name, `%${query.author}%`));
      const authorBookIds = new Set(authorRows.map((r) => r.bookId));
      bookIds = bookIds.filter((id) => authorBookIds.has(id));
    }

    if (query.genre) {
      const genreRows = await this.db
        .select({ bookId: schema.bookGenres.bookId })
        .from(schema.bookGenres)
        .where(ilike(schema.bookGenres.name, `%${query.genre}%`));
      const genreBookIds = new Set(genreRows.map((r) => r.bookId));
      bookIds = bookIds.filter((id) => genreBookIds.has(id));
    }

    if (query.series) {
      const seriesRows = await this.db
        .select({ bookId: schema.bookSeriesMembers.bookId })
        .from(schema.bookSeriesMembers)
        .where(eq(schema.bookSeriesMembers.seriesId, query.series));
      const seriesBookIds = new Set(seriesRows.map((r) => r.bookId));
      bookIds = bookIds.filter((id) => seriesBookIds.has(id));
    }

    if (query.favorite === true) {
      const favRows = await this.db
        .select({ subjectId: schema.userFavorites.subjectId })
        .from(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, "book"),
          ),
        );
      const favIds = new Set(favRows.map((r) => r.subjectId));
      bookIds = bookIds.filter((id) => favIds.has(id));
    } else if (query.favorite === false) {
      const favRows = await this.db
        .select({ subjectId: schema.userFavorites.subjectId })
        .from(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.subjectType, "book"),
          ),
        );
      const favIds = new Set(favRows.map((r) => r.subjectId));
      bookIds = bookIds.filter((id) => !favIds.has(id));
    }

    let progressUpdatedMap: Map<string, Date> | undefined;
    if (query.view === "continue") {
      if (this.readingProgress) {
        progressUpdatedMap = await this.readingProgress.listWorkIdsWithProgress(
          userId,
          "book",
        );
      } else {
        const progressRows = await this.db
          .select({
            subjectId: schema.userProgress.subjectId,
            updatedAt: schema.userProgress.updatedAt,
          })
          .from(schema.userProgress)
          .where(
            and(
              eq(schema.userProgress.userId, userId),
              eq(schema.userProgress.subjectType, "book"),
            ),
          );
        progressUpdatedMap = new Map(
          progressRows.map((r) => [r.subjectId, r.updatedAt]),
        );
      }
      const progressIds = new Set(progressUpdatedMap.keys());
      bookIds = bookIds.filter((id) => progressIds.has(id));
    }

    if (bookIds.length === 0) {
      return { items: [] as BookListItem[], nextCursor: undefined };
    }

    const books = await this.db
      .select()
      .from(schema.books)
      .where(inArray(schema.books.id, bookIds));

    const sortField = query.sort ?? "title";
    const sortOrder = query.order ?? "asc";
    books.sort((a, b) => {
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
      books.sort((a, b) => {
        const aTime = progressUpdatedMap!.get(a.id)?.getTime() ?? 0;
        const bTime = progressUpdatedMap!.get(b.id)?.getTime() ?? 0;
        return bTime - aTime;
      });
    } else if (query.view === "recent") {
      books.sort((a, b) => {
        const aAdded = membershipMap.get(a.id)?.getTime() ?? 0;
        const bAdded = membershipMap.get(b.id)?.getTime() ?? 0;
        return bAdded - aAdded;
      });
    }

    const limit = query.limit ?? 50;
    const offset = query.cursor ? parseInt(query.cursor, 10) : 0;
    const page = books.slice(offset, offset + limit + 1);
    const hasMore = page.length > limit;
    const pageBooks = hasMore ? page.slice(0, limit) : page;

    const items = await Promise.all(
      pageBooks.map((book) =>
        this.toListItem(book, userId, membershipMap.get(book.id)),
      ),
    );

    return {
      items,
      nextCursor: hasMore ? String(offset + limit) : undefined,
    };
  }

  async listBooksByIdsForUser(
    userId: string,
    bookIds: string[],
  ): Promise<BookListItem[]> {
    if (bookIds.length === 0) return [];

    const memberships = await this.libraryMembership.listForUser(
      userId,
      "book",
    );
    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );

    const accessibleIds = bookIds.filter((id) => membershipMap.has(id));
    if (accessibleIds.length === 0) return [];

    const books = await this.db
      .select()
      .from(schema.books)
      .where(inArray(schema.books.id, accessibleIds));
    const bookById = new Map(books.map((b) => [b.id, b]));

    const items: BookListItem[] = [];
    for (const id of bookIds) {
      const book = bookById.get(id);
      if (book) {
        items.push(await this.toListItem(book, userId, membershipMap.get(id)));
      }
    }
    return items;
  }

  private async toListItem(
    book: typeof schema.books.$inferSelect,
    userId: string,
    addedAt?: Date,
  ): Promise<BookListItem> {
    const authors = await this.getAuthorNames(book.id);
    const genres = await this.getGenreNames(book.id);
    const series = await this.getSeriesForBook(book.id);
    const favorite = await this.userState.getFavorite(userId, "book", book.id);
    const rating = await this.userState.getRating(userId, "book", book.id);
    const progress = await this.getReadingProgressForBook(userId, book.id);
    const reps = await this.representationsForBook(book.id);

    return {
      ...this.toPublic(book),
      authors,
      genres,
      series,
      favorite,
      rating,
      progress: progress?.locator ?? null,
      addedAt: addedAt?.toISOString() ?? null,
      representationFormats: [...new Set(reps.map((r) => r.format))],
    };
  }

  async getBookDetail(bookId: string, userId?: string): Promise<BookDetail> {
    const book = await this.getBook(bookId);
    const expressions = await this.db
      .select()
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          eq(schema.creativeWorkExpressions.workType, "book"),
          eq(schema.creativeWorkExpressions.workId, bookId),
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

    const reps = await this.representationsForBook(bookId);

    const representationsWithFiles = await Promise.all(
      reps.map(async (rep) => {
        const fileLinks = await this.representations.listFilesForRepresentation(
          rep.id,
        );
        const files = await Promise.all(
          fileLinks.map(async (link) => {
            const file = await this.files.getFile(link.fileId);
            return {
              ...this.files.toPublic(file),
              role: link.role,
            };
          }),
        );

        const contentFile = files.find((f) => f.role === "content") ?? files[0];
        let capabilities;
        let technical;
        if (rep.format === "epub" && contentFile) {
          const epubDetails = await resolveEpubRepresentationDetails(
            this.db,
            this.files,
            contentFile.id,
            {
              size: contentFile.size,
              checksum: contentFile.checksum,
              mediaType: contentFile.mediaType,
            },
          );
          if (epubDetails) {
            capabilities = epubDetails.capabilities;
            technical = epubDetails.technical;
          }
        }

        return {
          ...this.representations.toPublic(rep),
          capabilities,
          technical,
          files: files.map((f) => ({
            id: f.id,
            mediaType: f.mediaType,
            size: f.size,
            role: f.role,
            checksum: f.checksum,
          })),
        };
      }),
    );

    const authors = await this.db
      .select({
        id: schema.bookAuthors.id,
        name: schema.bookAuthors.name,
        sortOrder: schema.bookAuthors.sortOrder,
        peopleId: schema.bookAuthors.peopleId,
        peopleSlug: schema.people.slug,
      })
      .from(schema.bookAuthors)
      .leftJoin(
        schema.people,
        eq(schema.bookAuthors.peopleId, schema.people.id),
      )
      .where(eq(schema.bookAuthors.bookId, bookId))
      .orderBy(asc(schema.bookAuthors.sortOrder));

    const genres = await this.getGenreNames(bookId);
    const contributors = await this.getContributorNames(bookId);
    const tags = await this.getTagNames(bookId);
    const series = await this.getSeriesForBook(bookId);
    const rels = await this.relationships.listForSource("book", bookId);
    const overrides = await this.metadata.getOverrides("book", bookId);

    let userState = {
      favorite: false,
      rating: null as number | null,
      progress: null as ReadingLocator | null,
      progressRepresentationId: null as string | null,
    };

    let progressRecord: Awaited<
      ReturnType<BooksService["getReadingProgressForBook"]>
    > = null;

    if (userId) {
      progressRecord = await this.getReadingProgressForBook(userId, bookId);
      userState = {
        favorite: await this.userState.getFavorite(userId, "book", bookId),
        rating: await this.userState.getRating(userId, "book", bookId),
        progress: progressRecord?.locator ?? null,
        progressRepresentationId: progressRecord?.representationId ?? null,
      };
    }

    const progressUpdatedAt = progressRecord?.updatedAt ?? null;

    const overrideMap: Record<string, unknown> = {};
    for (const o of overrides) {
      overrideMap[o.field] = o.value;
    }

    const effective = this.applyOverrides(book, overrideMap);

    const manifestationIsbn = manifestations.find(
      (m) =>
        m.externalId &&
        (m.externalIdType === "isbn13" || m.externalIdType === "isbn"),
    )?.externalId;

    const metadataFields = await resolveBookMetadataFields(
      this.db,
      this.metadata,
      this.metadataPolicy,
      this.metadataProvenance,
      bookId,
      {
        title: effective.title,
        subtitle: effective.subtitle,
        description: effective.description,
        authors: authors.map((a) => a.name),
        genres,
        contributors,
        tags,
        seriesName: series?.name,
        seriesPosition: series?.position,
        coverFileId: book.coverFileId,
        manifestationIsbn: manifestationIsbn ?? null,
      },
    );

    const customFields = await this.customFields.getValuesForSubjectWithGlobal(
      "books",
      "item",
      bookId,
    );

    const seriesBooks =
      userId && series
        ? await this.listSeriesMembers(userId, series.id, book.slug)
        : [];

    const journalSummary =
      userId != null
        ? await this.buildJournalSummary(userId, bookId)
        : this.emptyJournalSummary();

    const physicalHolding =
      userId != null
        ? await this.getPhysicalHoldingForBook(userId, bookId)
        : null;

    const readingState = this.buildReadingStateDetail(
      userState.progress,
      userState.progressRepresentationId,
      progressUpdatedAt,
      representationsWithFiles,
      manifestations,
    );

    return {
      ...this.toPublic(effective),
      authors: authors.map((a) => ({
        id: a.id,
        name: a.name,
        sortOrder: a.sortOrder,
        peopleId: a.peopleId,
        peopleSlug: a.peopleSlug ?? null,
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
      physicalHolding,
      metadataFields,
      customFields,
      seriesBooks,
      journalSummary,
      readingState,
    };
  }

  async getSeriesDetail(
    seriesId: string,
    userId: string,
    currentSlug?: string,
  ): Promise<BookSeriesDetail> {
    const series = await this.db.query.bookSeries.findFirst({
      where: eq(schema.bookSeries.id, seriesId),
    });
    if (!series) throw new NotFoundError("Series not found");

    return {
      id: series.id,
      name: series.name,
      description: series.description,
      members: await this.listSeriesMembers(userId, seriesId, currentSlug),
    };
  }

  async listSeriesMembers(
    userId: string,
    seriesId: string,
    currentSlug?: string,
  ): Promise<SeriesMember[]> {
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "book",
    );
    const membershipMap = new Map(
      memberships.map((m) => [m.targetId, m.addedAt]),
    );

    const members = await this.db
      .select({
        bookId: schema.bookSeriesMembers.bookId,
        position: schema.bookSeriesMembers.position,
      })
      .from(schema.bookSeriesMembers)
      .where(eq(schema.bookSeriesMembers.seriesId, seriesId))
      .orderBy(asc(schema.bookSeriesMembers.position));

    const result: SeriesMember[] = [];
    for (const member of members) {
      if (!membershipMap.has(member.bookId)) continue;
      const book = await this.getBook(member.bookId);
      const work = await this.toListItem(
        book,
        userId,
        membershipMap.get(member.bookId),
      );
      const progress = await this.getReadingProgressForBook(
        userId,
        member.bookId,
      );
      const locator = progress?.locator ?? null;
      const progression =
        locator?.totalProgression ?? locator?.progression ?? 0;
      result.push({
        work,
        position: member.position,
        current: currentSlug != null && book.slug === currentSlug,
        readingState: {
          progress: locator,
          finished: progression >= 0.99,
        },
      });
    }

    return result;
  }

  private emptyJournalSummary(): BookJournalSummary {
    return {
      bookmarkCount: 0,
      annotationCount: 0,
      journalEntryCount: 0,
      recent: [],
    };
  }

  private async buildJournalSummary(
    userId: string,
    bookId: string,
  ): Promise<BookJournalSummary> {
    const bookmarks = await this.userState.listBookmarks(
      userId,
      "book",
      bookId,
    );
    const annotations = await this.userState.listAnnotations(
      userId,
      "book",
      bookId,
    );

    const quoteCountApprox = annotations.filter(
      (a) => a.highlightText && !a.note,
    ).length;

    const sortedBookmarks = [...bookmarks].sort((a, b) =>
      this.compareLocators(a.locator, b.locator),
    );
    const sortedAnnotations = [...annotations].sort((a, b) =>
      this.compareLocators(a.locator, b.locator),
    );

    const recent = [
      ...sortedBookmarks.slice(0, 3).map((b) => ({
        kind: "bookmark" as const,
        id: b.id,
        label: b.label ?? undefined,
        locator: b.locator,
        representationId: b.representationId,
      })),
      ...sortedAnnotations.slice(0, 3).map((a) => ({
        kind: "annotation" as const,
        id: a.id,
        highlightText: a.highlightText ?? undefined,
        note: a.note ?? undefined,
        locator: a.locator,
        representationId: a.representationId,
      })),
    ]
      .sort((a, b) => this.compareLocators(a.locator, b.locator))
      .slice(0, 3);

    return {
      bookmarkCount: bookmarks.length,
      annotationCount: annotations.length,
      quoteCountApprox: quoteCountApprox > 0 ? quoteCountApprox : undefined,
      journalEntryCount: 0,
      recent,
    };
  }

  private compareLocators(a: ReadingLocator, b: ReadingLocator): number {
    const ap = a.totalProgression ?? a.progression ?? 0;
    const bp = b.totalProgression ?? b.progression ?? 0;
    return ap - bp;
  }

  private buildReadingStateDetail(
    progress: ReadingLocator | null,
    progressRepresentationId: string | null,
    progressUpdatedAt: string | null,
    representations: BookDetail["representations"],
    manifestations: Array<{ id: string; label: string | null }>,
  ): BookReadingStateDetail {
    const epubReps = representations.filter(
      (r) => r.format === "epub" && !r.unavailableAt,
    );
    const readerTarget =
      epubReps.find((r) => r.id === progressRepresentationId) ??
      epubReps[0] ??
      null;

    const progression =
      progress?.totalProgression ?? progress?.progression ?? 0;
    const started = progression > 0;
    const finished = progression >= 0.99;

    let activeRepresentationLabel: string | null = null;
    if (progressRepresentationId) {
      const rep = representations.find(
        (r) => r.id === progressRepresentationId,
      );
      if (rep?.manifestationId) {
        const manifestation = manifestations.find(
          (m) => m.id === rep.manifestationId,
        );
        activeRepresentationLabel =
          manifestation?.label ?? rep.format.toUpperCase();
      } else if (rep) {
        activeRepresentationLabel = rep.format.toUpperCase();
      }
    }

    return {
      progress,
      progressRepresentationId,
      progressUpdatedAt,
      activeRepresentationLabel,
      finished,
      started,
      canContinueInReader: readerTarget != null && !finished,
      readerTargetRepresentationId: readerTarget?.id ?? null,
    };
  }

  private applyOverrides(
    book: typeof schema.books.$inferSelect,
    overrides: Record<string, unknown>,
  ) {
    return {
      ...book,
      title: (overrides.title as string) ?? book.title,
      subtitle: (overrides.subtitle as string | undefined) ?? book.subtitle,
      description:
        (overrides.description as string | undefined) ?? book.description,
    };
  }

  async setAuthors(bookId: string, authors: string[]) {
    await this.getBook(bookId);
    await this.replaceAuthorsWithCredits(bookId, authors);
    await this.indexBook(bookId);
  }

  async setGenres(bookId: string, genres: string[]) {
    await this.getBook(bookId);
    await this.db
      .delete(schema.bookGenres)
      .where(eq(schema.bookGenres.bookId, bookId));
    for (const name of genres) {
      await this.db.insert(schema.bookGenres).values({
        id: generateId(),
        bookId,
        name,
      });
    }
    await this.indexBook(bookId);
  }

  async setContributors(bookId: string, contributors: string[]) {
    await this.getBook(bookId);
    await this.people.syncTargetCredits(
      "book",
      bookId,
      contributors.map((name, i) => ({
        name,
        role: "contributor",
        sortOrder: i,
      })),
    );
    await this.db
      .delete(schema.bookContributors)
      .where(eq(schema.bookContributors.bookId, bookId));
    for (let i = 0; i < contributors.length; i++) {
      await this.db.insert(schema.bookContributors).values({
        id: generateId(),
        bookId,
        name: contributors[i]!,
        sortOrder: i,
      });
    }
    await this.indexBook(bookId);
  }

  async setTags(bookId: string, tags: string[]) {
    await this.getBook(bookId);
    await this.db
      .delete(schema.bookTags)
      .where(eq(schema.bookTags.bookId, bookId));
    for (const name of tags) {
      await this.db.insert(schema.bookTags).values({
        id: generateId(),
        bookId,
        name,
      });
    }
    await this.indexBook(bookId);
  }

  async setSeriesByName(
    bookId: string,
    seriesName: string | null,
    position?: number,
  ) {
    await this.getBook(bookId);
    await this.db
      .delete(schema.bookSeriesMembers)
      .where(eq(schema.bookSeriesMembers.bookId, bookId));

    if (!seriesName?.trim()) return;

    const normalized = parseCombinedSeriesValue(seriesName);
    const name = normalized.name;
    const resolvedPosition = position ?? normalized.position ?? undefined;

    let series = await this.db.query.bookSeries.findFirst({
      where: eq(schema.bookSeries.name, name),
    });
    if (!series) {
      const seriesId = generateId();
      await this.db.insert(schema.bookSeries).values({
        id: seriesId,
        name,
      });
      series = { id: seriesId, name, description: null, createdAt: new Date() };
    }

    await this.db.insert(schema.bookSeriesMembers).values({
      id: generateId(),
      seriesId: series.id,
      bookId,
      position: resolvedPosition ?? null,
    });
    await this.indexBook(bookId);
  }

  async applyIngestedMetadata(
    bookId: string,
    sources: {
      merged: Partial<{
        title: string;
        subtitle: string;
        description: string;
        authors: string[];
        genres: string[];
        isbn13: string;
      }>;
      opfIdentifiers?: EpubOpfBibliographic["identifiers"];
      manifestationId: string;
      skipFieldWrites?: boolean;
    },
  ) {
    const book = await this.getBook(bookId);
    const overrides = await this.metadata.getOverrides("book", bookId);
    const overriddenFields = new Set(overrides.map((o) => o.field));
    const merged = sources.merged;

    if (!sources.skipFieldWrites) {
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
          .update(schema.books)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(schema.books.id, bookId));
      }

      if (!overriddenFields.has("authors") && merged.authors?.length) {
        await this.replaceAuthors(bookId, merged.authors);
      }

      if (!overriddenFields.has("genres") && merged.genres?.length) {
        await this.replaceGenres(bookId, merged.genres);
      }
    }

    const isbnFromMerge = merged.isbn13;
    const isbnFromOpf = sources.opfIdentifiers?.length
      ? detectIsbn(sources.opfIdentifiers)
      : undefined;
    const isbn = isbnFromMerge
      ? { type: "isbn13" as const, value: isbnFromMerge.replace(/-/g, "") }
      : isbnFromOpf;

    if (isbn) {
      const manifestation =
        await this.db.query.creativeWorkManifestations.findFirst({
          where: eq(
            schema.creativeWorkManifestations.id,
            sources.manifestationId,
          ),
        });
      if (manifestation && !manifestation.externalId) {
        await this.db
          .update(schema.creativeWorkManifestations)
          .set({
            externalIdType: isbn.type,
            externalId: isbn.value,
          })
          .where(
            eq(schema.creativeWorkManifestations.id, sources.manifestationId),
          );
      }
    }

    const finalTitle =
      (!overriddenFields.has("title") && merged.title) || book.title;
    await promoteBookSlugIfPending(this.db, bookId, finalTitle);
  }

  private async replaceAuthors(bookId: string, authors: string[]) {
    await this.replaceAuthorsWithCredits(bookId, authors);
  }

  private async replaceAuthorsWithCredits(bookId: string, authors: string[]) {
    const resolved = await this.people.syncTargetCredits(
      "book",
      bookId,
      authors.map((name, i) => ({ name, role: "author", sortOrder: i })),
    );
    await this.db
      .delete(schema.bookAuthors)
      .where(eq(schema.bookAuthors.bookId, bookId));
    for (let i = 0; i < authors.length; i++) {
      await this.db.insert(schema.bookAuthors).values({
        id: generateId(),
        bookId,
        name: authors[i]!,
        peopleId: resolved.get(authors[i]!),
        sortOrder: i,
      });
    }
  }

  private async replaceGenres(bookId: string, genres: string[]) {
    await this.db
      .delete(schema.bookGenres)
      .where(eq(schema.bookGenres.bookId, bookId));
    for (const name of genres) {
      await this.db.insert(schema.bookGenres).values({
        id: generateId(),
        bookId,
        name,
      });
    }
  }

  async setSeries(bookId: string, seriesId: string | null, position?: number) {
    await this.getBook(bookId);
    await this.db
      .delete(schema.bookSeriesMembers)
      .where(eq(schema.bookSeriesMembers.bookId, bookId));
    if (seriesId) {
      await this.db.insert(schema.bookSeriesMembers).values({
        id: generateId(),
        seriesId,
        bookId,
        position: position ?? null,
      });
    }
  }

  async listSeries() {
    return this.db
      .select()
      .from(schema.bookSeries)
      .orderBy(asc(schema.bookSeries.name));
  }

  async listAuthorsForUser(userId: string) {
    const memberships = await this.libraryMembership.listForUser(
      userId,
      "book",
    );
    if (memberships.length === 0) return [];
    const bookIds = memberships.map((m) => m.targetId);
    const rows = await this.db
      .select({ name: schema.bookAuthors.name })
      .from(schema.bookAuthors)
      .where(inArray(schema.bookAuthors.bookId, bookIds));
    const names = [...new Set(rows.map((r) => r.name))];
    return names.sort((a, b) => a.localeCompare(b));
  }

  async findDuplicateBookByChecksum(
    checksum: string,
  ): Promise<{ workType: "book"; workId: string } | null> {
    const sameChecksum = await this.db
      .select({ bookId: schema.creativeWorkExpressions.workId })
      .from(schema.representationFiles)
      .innerJoin(
        schema.representations,
        eq(
          schema.representationFiles.representationId,
          schema.representations.id,
        ),
      )
      .innerJoin(
        schema.files,
        eq(schema.representationFiles.fileId, schema.files.id),
      )
      .innerJoin(
        schema.creativeWorkManifestations,
        eq(
          schema.representations.manifestationId,
          schema.creativeWorkManifestations.id,
        ),
      )
      .innerJoin(
        schema.creativeWorkExpressions,
        eq(
          schema.creativeWorkManifestations.expressionId,
          schema.creativeWorkExpressions.id,
        ),
      )
      .where(
        and(
          eq(schema.files.checksum, checksum),
          eq(schema.creativeWorkExpressions.workType, "book"),
        ),
      )
      .limit(1);
    if (sameChecksum[0]) {
      return { workType: "book", workId: sameChecksum[0].bookId };
    }
    return null;
  }

  async createBookRepresentation(params: {
    fileId: string;
    title: string;
    userId?: string;
  }) {
    const file = await this.files.getFile(params.fileId);
    const format = inferFormatFromPath(file.relativePath);

    if (!BOOK_FORMATS.includes(format as RepresentationFormat)) {
      throw new Error("not_a_book_format");
    }

    const existing = await this.representations.findByFileId(params.fileId);
    if (existing.length > 0) {
      const rep = existing[0]!;
      const manifestation = rep.manifestationId
        ? await this.db.query.creativeWorkManifestations.findFirst({
            where: eq(
              schema.creativeWorkManifestations.id,
              rep.manifestationId,
            ),
          })
        : undefined;
      const expression = manifestation
        ? await this.db.query.creativeWorkExpressions.findFirst({
            where: eq(
              schema.creativeWorkExpressions.id,
              manifestation.expressionId,
            ),
          })
        : undefined;
      return {
        bookId: expression?.workId ?? "",
        expressionId: expression?.id ?? "",
        manifestationId: rep.manifestationId,
        representationId: rep.id,
        alreadyLinked: true,
      };
    }

    const bookId = await this.createPendingBook({ title: params.title });

    const expression = await this.db.query.creativeWorkExpressions.findFirst({
      where: and(
        eq(schema.creativeWorkExpressions.workType, "book"),
        eq(schema.creativeWorkExpressions.workId, bookId),
      ),
    });

    const expressionId = expression?.id ?? generateId();
    if (!expression) {
      await this.db.insert(schema.creativeWorkExpressions).values({
        id: expressionId,
        workType: "book",
        workId: bookId,
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
      domainModule: "books",
      manifestationId,
    });

    await this.representations.linkFile(
      representationId,
      params.fileId,
      "content",
    );

    if (params.userId) {
      await this.libraryMembership.ensureWorkMembership(
        params.userId,
        "book",
        bookId,
      );
    }

    return {
      bookId,
      expressionId,
      manifestationId,
      representationId,
      alreadyLinked: false,
    };
  }

  async associateFile(fileId: string, userId?: string) {
    const file = await this.files.getFile(fileId);
    const format = inferFormatFromPath(file.relativePath);

    if (!BOOK_FORMATS.includes(format as RepresentationFormat)) {
      return { skipped: true as const, reason: "not_a_book_format" };
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
    const created = await this.createBookRepresentation({
      fileId,
      title,
      userId,
    });

    await this.indexBook(created.bookId);

    if (this.jobs) {
      await this.jobs.enqueue(JOB_TYPES.METADATA_INGEST, {
        fileId,
        bookId: created.bookId,
        representationId: created.representationId,
        manifestationId: created.manifestationId,
        userId,
      });
    }

    return {
      skipped: false as const,
      bookId: created.bookId,
      expressionId: created.expressionId,
      manifestationId: created.manifestationId,
      representationId: created.representationId,
    };
  }

  async indexBook(bookId: string) {
    const book = await this.getBook(bookId);
    const authors = await this.getAuthorNames(bookId);
    const genres = await this.getGenreNames(bookId);
    await this.search.upsert({
      entityType: "book",
      entityId: bookId,
      title: book.title,
      body: [book.subtitle, book.description, ...authors, ...genres]
        .filter(Boolean)
        .join(" "),
    });
  }

  async listAllBookIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.books.id })
      .from(schema.books);
    return rows.map((r) => r.id);
  }

  async getAuthorNames(bookId: string) {
    const rows = await this.db
      .select({ name: schema.bookAuthors.name })
      .from(schema.bookAuthors)
      .where(eq(schema.bookAuthors.bookId, bookId))
      .orderBy(asc(schema.bookAuthors.sortOrder));
    return rows.map((r) => r.name);
  }

  async getGenreNames(bookId: string) {
    const rows = await this.db
      .select({ name: schema.bookGenres.name })
      .from(schema.bookGenres)
      .where(eq(schema.bookGenres.bookId, bookId));
    return rows.map((r) => r.name);
  }

  async getContributorNames(bookId: string) {
    const rows = await this.db
      .select({ name: schema.bookContributors.name })
      .from(schema.bookContributors)
      .where(eq(schema.bookContributors.bookId, bookId))
      .orderBy(asc(schema.bookContributors.sortOrder));
    return rows.map((r) => r.name);
  }

  async getTagNames(bookId: string) {
    const rows = await this.db
      .select({ name: schema.bookTags.name })
      .from(schema.bookTags)
      .where(eq(schema.bookTags.bookId, bookId));
    return rows.map((r) => r.name);
  }

  async getMetadataIngestTarget(bookId: string) {
    const reps = await this.representationsForBook(bookId);
    const rep = reps.find((r) => !r.unavailableAt) ?? reps[0];
    if (!rep?.manifestationId) return null;

    const fileLinks = await this.representations.listFilesForRepresentation(
      rep.id,
    );
    const contentLink =
      fileLinks.find((f) => f.role === "content") ?? fileLinks[0];
    if (!contentLink) return null;

    return {
      fileId: contentLink.fileId,
      representationId: rep.id,
      manifestationId: rep.manifestationId,
    };
  }

  async getSeriesForBook(bookId: string) {
    const row = await this.db
      .select({
        id: schema.bookSeries.id,
        name: schema.bookSeries.name,
        position: schema.bookSeriesMembers.position,
      })
      .from(schema.bookSeriesMembers)
      .innerJoin(
        schema.bookSeries,
        eq(schema.bookSeriesMembers.seriesId, schema.bookSeries.id),
      )
      .where(eq(schema.bookSeriesMembers.bookId, bookId))
      .limit(1);
    if (!row[0]) return null;
    return {
      id: row[0].id,
      name: row[0].name,
      position: row[0].position,
    };
  }

  private async representationsForBook(bookId: string) {
    const expressions = await this.db
      .select({ id: schema.creativeWorkExpressions.id })
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          eq(schema.creativeWorkExpressions.workType, "book"),
          eq(schema.creativeWorkExpressions.workId, bookId),
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

  toPublic(book: typeof schema.books.$inferSelect) {
    return {
      id: book.id,
      slug: book.slug,
      slugStatus: book.slugStatus as "pending" | "canonical",
      title: book.title,
      subtitle: book.subtitle,
      description: book.description,
      coverFileId: book.coverFileId,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    };
  }
}
