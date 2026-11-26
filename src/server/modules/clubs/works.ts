import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { mirrorLegacyWork } from "./read-compatibility.js";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import type { AuthUser } from "../authorization/service.js";
import type { ClubService } from "./service.js";
import type { BooksService } from "../books/service.js";
import type { MoviesService } from "../movies/service.js";
import type { TvService } from "../tv/service.js";
import type { UserStateService } from "../user-state/service.js";
import type { ReadingProgressService } from "../reading-progress/service.js";
import {
  CLUB_WORK_SUBJECT_TYPES_BY_CONTEXT,
  type ClubWork,
  type ClubWorkDetail,
  type ClubWorkStatus,
  type ClubWorkSummary,
} from "../../../shared/clubs.js";
import type { WorkSubjectType } from "../../../shared/subject.js";
import {
  formatBookProgressLabel,
  formatPlaybackProgressLabel,
  formatTvContinueProgressLabel,
} from "../../../shared/club-work-display.js";
import { isPlaybackProgressLocator } from "../../../shared/progress-locator.js";

type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class ClubWorksService {
  private readingProgress?: ReadingProgressService;

  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly books: BooksService,
    private readonly movies: MoviesService,
    private readonly tv: TvService,
    private readonly userState: UserStateService,
  ) {}

  setReadingProgressService(service: ReadingProgressService) {
    this.readingProgress = service;
  }

  private async getBookReadingProgress(userId: string, bookId: string) {
    if (this.readingProgress) {
      const primary = await this.readingProgress.getPrimaryProgressForWork(
        userId,
        "book",
        bookId,
      );
      if (!primary) return null;
      return { locator: primary.progress.locator };
    }
    const progress = await this.userState.getReadingProgress(
      userId,
      "book",
      bookId,
    );
    return progress ? { locator: progress.locator } : null;
  }

  assertWorkTypeForContext(
    context: (typeof schema.clubs.$inferSelect)["context"],
    workSubjectType: WorkSubjectType,
  ) {
    const allowed = CLUB_WORK_SUBJECT_TYPES_BY_CONTEXT[context];
    if (!allowed.includes(workSubjectType)) {
      throw new ValidationError(
        `Work type ${workSubjectType} is not allowed for ${context} clubs`,
      );
    }
  }

  async assertWorkExists(
    workSubjectType: WorkSubjectType,
    workSubjectId: string,
  ) {
    switch (workSubjectType) {
      case "book":
        await this.books.getBook(workSubjectId);
        return;
      case "movie":
        await this.movies.getMovie(workSubjectId);
        return;
      case "show":
        await this.tv.getShow(workSubjectId);
        return;
      case "ttrpg":
        throw new ValidationError("TTRPG works are not yet supported");
      default:
        throw new ValidationError(`Unsupported work type: ${workSubjectType}`);
    }
  }

  workHref(workSubjectType: WorkSubjectType, workSubjectId: string): string {
    switch (workSubjectType) {
      case "book":
        return `/books/${workSubjectId}`;
      case "movie":
        return `/movies/${workSubjectId}`;
      case "show":
        return `/tv/${workSubjectId}`;
      case "ttrpg":
        return `/ttrpg/${workSubjectId}`;
      default:
        return "/";
    }
  }

  async resolveWorkSummary(
    workSubjectType: WorkSubjectType,
    workSubjectId: string,
  ): Promise<Pick<ClubWorkSummary, "title" | "coverFileId" | "href">> {
    switch (workSubjectType) {
      case "book": {
        const book = await this.books.getBook(workSubjectId);
        return {
          title: book.title,
          coverFileId: book.coverFileId,
          href: this.workHref(workSubjectType, workSubjectId),
        };
      }
      case "movie": {
        const movie = await this.movies.getMovie(workSubjectId);
        return {
          title: movie.title,
          coverFileId: movie.coverFileId,
          href: this.workHref(workSubjectType, workSubjectId),
        };
      }
      case "show": {
        const show = await this.tv.getShow(workSubjectId);
        return {
          title: show.title,
          coverFileId: show.coverFileId,
          href: this.workHref(workSubjectType, workSubjectId),
        };
      }
      case "ttrpg":
        throw new ValidationError("TTRPG works are not yet supported");
      default:
        throw new ValidationError(`Unsupported work type: ${workSubjectType}`);
    }
  }

  private async toWorkSummary(
    row: typeof schema.clubWorks.$inferSelect,
  ): Promise<ClubWorkSummary> {
    const resolved = await this.resolveWorkSummary(
      row.workSubjectType as WorkSubjectType,
      row.workSubjectId,
    );
    return {
      id: row.id,
      workSubjectType: row.workSubjectType as WorkSubjectType,
      workSubjectId: row.workSubjectId,
      status: row.status,
      sortOrder: row.sortOrder,
      title: resolved.title,
      coverFileId: resolved.coverFileId,
      href: resolved.href,
      addedAt: row.createdAt.toISOString(),
    };
  }

  async listWorks(user: AuthUser, clubId: string): Promise<ClubWork[]> {
    const club = await this.clubs.requireView(user, clubId);
    void club;
    const rows = await this.db
      .select()
      .from(schema.clubWorks)
      .where(eq(schema.clubWorks.clubId, clubId))
      .orderBy(
        asc(schema.clubWorks.sortOrder),
        asc(schema.clubWorks.createdAt),
      );

    const works: ClubWork[] = [];
    for (const row of rows) {
      const summary = await this.toWorkSummary(row);
      works.push({
        ...summary,
        addedByUserId: row.addedByUserId,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return works;
  }

  async getCurrentWorkSummary(clubId: string): Promise<ClubWorkSummary | null> {
    const row = await this.db.query.clubWorks.findFirst({
      where: and(
        eq(schema.clubWorks.clubId, clubId),
        eq(schema.clubWorks.status, "current"),
      ),
    });
    if (!row) return null;
    return this.toWorkSummary(row);
  }

  async getCurrentWorkDetail(
    user: AuthUser,
    clubId: string,
  ): Promise<ClubWorkDetail | null> {
    await this.clubs.requireView(user, clubId);
    const summary = await this.getCurrentWorkSummary(clubId);
    if (!summary) return null;
    return this.enrichWorkSummaryForViewer(summary, user.id);
  }

  private async enrichWorkSummaryForViewer(
    summary: ClubWorkSummary,
    userId: string,
  ): Promise<ClubWorkDetail> {
    const detail: ClubWorkDetail = { ...summary };

    switch (summary.workSubjectType) {
      case "book": {
        const authors = await this.books.getAuthorNames(summary.workSubjectId);
        if (authors.length > 0) {
          detail.subtitle = authors.join(", ");
        }
        const progress = await this.getBookReadingProgress(
          userId,
          summary.workSubjectId,
        );
        if (progress?.locator) {
          Object.assign(detail, formatBookProgressLabel(progress.locator));
        }
        break;
      }
      case "movie": {
        const progressRow = await this.userState.getProgress(
          userId,
          "movie",
          summary.workSubjectId,
        );
        if (
          progressRow?.locator &&
          isPlaybackProgressLocator(progressRow.locator)
        ) {
          Object.assign(
            detail,
            formatPlaybackProgressLabel(progressRow.locator),
          );
        }
        break;
      }
      case "show": {
        const showDetail = await this.tv.getShowDetail(
          summary.workSubjectId,
          userId,
        );
        const episode = showDetail.continueEpisode;
        if (episode) {
          let progressPercent: number | undefined;
          if (
            episode.progress?.durationSeconds &&
            episode.progress.durationSeconds > 0
          ) {
            progressPercent = Math.round(
              (episode.progress.positionSeconds /
                episode.progress.durationSeconds) *
                100,
            );
          }
          Object.assign(
            detail,
            formatTvContinueProgressLabel({
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
              progressPercent,
            }),
          );
        }
        break;
      }
      default:
        break;
    }

    return detail;
  }

  async getCurrentWorkSummariesForClubs(
    clubIds: string[],
  ): Promise<Map<string, Pick<ClubWorkSummary, "title" | "href"> | null>> {
    const result = new Map<
      string,
      Pick<ClubWorkSummary, "title" | "href"> | null
    >();
    if (clubIds.length === 0) return result;

    for (const clubId of clubIds) {
      result.set(clubId, null);
    }

    const rows = await this.db
      .select()
      .from(schema.clubWorks)
      .where(
        and(
          inArray(schema.clubWorks.clubId, clubIds),
          eq(schema.clubWorks.status, "current"),
        ),
      );

    for (const row of rows) {
      try {
        const resolved = await this.resolveWorkSummary(
          row.workSubjectType as WorkSubjectType,
          row.workSubjectId,
        );
        result.set(row.clubId, {
          title: resolved.title,
          href: resolved.href,
        });
      } catch {
        result.set(row.clubId, null);
      }
    }

    return result;
  }

  async getWorkRow(clubId: string, workId: string) {
    const row = await this.db.query.clubWorks.findFirst({
      where: and(
        eq(schema.clubWorks.clubId, clubId),
        eq(schema.clubWorks.id, workId),
      ),
    });
    if (!row) throw new NotFoundError("Club work not found");
    return row;
  }

  async addWork(
    user: AuthUser,
    clubId: string,
    input: {
      workSubjectType: WorkSubjectType;
      workSubjectId: string;
      status?: ClubWorkStatus;
      demoteCurrentTo?: "associated" | "completed";
    },
  ): Promise<string> {
    const club = await this.clubs.getClub(clubId);
    if (!(await this.clubs.canModerate(user, club))) {
      throw new ForbiddenError();
    }

    this.assertWorkTypeForContext(club.context, input.workSubjectType);
    await this.assertWorkExists(input.workSubjectType, input.workSubjectId);

    const existing = await this.db.query.clubWorks.findFirst({
      where: and(
        eq(schema.clubWorks.clubId, clubId),
        eq(schema.clubWorks.workSubjectType, input.workSubjectType),
        eq(schema.clubWorks.workSubjectId, input.workSubjectId),
      ),
    });
    if (existing) {
      throw new ValidationError("Work is already associated with this club");
    }

    const status = input.status ?? "associated";
    const id = generateId();
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM clubs WHERE id=${clubId} FOR UPDATE`);
      if (status === "current") {
        await this.demoteCurrentWork(
          tx,
          clubId,
          input.demoteCurrentTo ?? "associated",
        );
      }

      const maxSort = await tx
        .select({ sortOrder: schema.clubWorks.sortOrder })
        .from(schema.clubWorks)
        .where(eq(schema.clubWorks.clubId, clubId))
        .orderBy(asc(schema.clubWorks.sortOrder));

      const nextSort =
        maxSort.length > 0
          ? Math.max(...maxSort.map((r) => r.sortOrder)) + 1
          : 0;

      await tx.insert(schema.clubWorks).values({
        id,
        clubId,
        workSubjectType: input.workSubjectType,
        workSubjectId: input.workSubjectId,
        status,
        sortOrder: nextSort,
        addedByUserId: user.id,
        createdAt: now,
        updatedAt: now,
      });
      await mirrorLegacyWork(tx, clubId, id, status, user.id);
    });

    return id;
  }

  async updateWork(
    user: AuthUser,
    clubId: string,
    workId: string,
    input: {
      status?: ClubWorkStatus;
      sortOrder?: number;
      demoteCurrentTo?: "associated" | "completed";
    },
  ): Promise<void> {
    const club = await this.clubs.getClub(clubId);
    if (!(await this.clubs.canModerate(user, club))) {
      throw new ForbiddenError();
    }

    await this.getWorkRow(clubId, workId);

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM clubs WHERE id=${clubId} FOR UPDATE`);
      if (input.status === "current") {
        await this.demoteCurrentWork(
          tx,
          clubId,
          input.demoteCurrentTo ?? "associated",
          workId,
        );
      }

      await tx
        .update(schema.clubWorks)
        .set({
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.sortOrder !== undefined
            ? { sortOrder: input.sortOrder }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.clubWorks.id, workId));
      if (input.status)
        await mirrorLegacyWork(tx, clubId, workId, input.status, user.id);
    });
  }

  async removeWork(user: AuthUser, clubId: string, workId: string) {
    const club = await this.clubs.getClub(clubId);
    if (!(await this.clubs.canModerate(user, club))) {
      throw new ForbiddenError();
    }

    await this.getWorkRow(clubId, workId);
    await this.db
      .delete(schema.clubWorks)
      .where(eq(schema.clubWorks.id, workId));
  }

  async setCurrentWorkBySubject(
    user: AuthUser,
    clubId: string,
    workSubjectType: WorkSubjectType,
    workSubjectId: string,
    demoteCurrentTo: "associated" | "completed" = "associated",
  ): Promise<string> {
    const existing = await this.db.query.clubWorks.findFirst({
      where: and(
        eq(schema.clubWorks.clubId, clubId),
        eq(schema.clubWorks.workSubjectType, workSubjectType),
        eq(schema.clubWorks.workSubjectId, workSubjectId),
      ),
    });

    if (existing) {
      await this.updateWork(user, clubId, existing.id, {
        status: "current",
        demoteCurrentTo,
      });
      return existing.id;
    }

    return this.addWork(user, clubId, {
      workSubjectType,
      workSubjectId,
      status: "current",
      demoteCurrentTo,
    });
  }

  async resolveWorkForClubWorkId(clubWorkId: string | null) {
    if (!clubWorkId) return null;
    const row = await this.db.query.clubWorks.findFirst({
      where: eq(schema.clubWorks.id, clubWorkId),
    });
    if (!row) return null;
    return {
      workSubjectType: row.workSubjectType as WorkSubjectType,
      workSubjectId: row.workSubjectId,
    };
  }

  private async demoteCurrentWork(
    tx: DbTransaction,
    clubId: string,
    demoteTo: "associated" | "completed",
    exceptWorkId?: string,
  ) {
    const conditions = [
      eq(schema.clubWorks.clubId, clubId),
      eq(schema.clubWorks.status, "current"),
    ];
    const currentRows = await tx
      .select()
      .from(schema.clubWorks)
      .where(and(...conditions));

    const toDemote = currentRows.filter((r) => r.id !== exceptWorkId);
    await tx
      .update(schema.clubReads)
      .set({
        status: demoteTo === "completed" ? "completed" : "cancelled",
        completedAt: demoteTo === "completed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.clubReads.clubId, clubId),
          eq(schema.clubReads.status, "active"),
          exceptWorkId
            ? sql`${schema.clubReads.legacyClubWorkId} IS DISTINCT FROM ${exceptWorkId}`
            : undefined,
        ),
      );
    if (toDemote.length === 0) return;

    await tx
      .update(schema.clubWorks)
      .set({ status: demoteTo, updatedAt: new Date() })
      .where(
        inArray(
          schema.clubWorks.id,
          toDemote.map((r) => r.id),
        ),
      );
  }
}
