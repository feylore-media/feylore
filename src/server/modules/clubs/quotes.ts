import { ClubContentProjection } from "./content-projection.js";
import type { ReadingProgressService } from "../reading-progress/service.js";
import type { MediaLocation } from "../../../shared/media-location.js";
import { and, desc, eq, inArray } from "drizzle-orm";
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
import type { ClubWorksService } from "./works.js";
import type { UserStateService } from "../user-state/service.js";
import type { ReadingLocator } from "../../../shared/books.js";
import {
  isShareableQuoteAnnotation,
  quoteTextFromAnnotation,
} from "../../../shared/club-quotes.js";
import type {
  ClubQuotePublic,
  ClubQuoteShareableAnnotation,
} from "../../../shared/clubs.js";
import { normalizeProfileCosmetics } from "../../../shared/profile-cosmetics.js";

export class ClubQuotesService {
  private projection: ClubContentProjection;
  setPrimaryProgress(service: ReadingProgressService) {
    this.projection = new ClubContentProjection(
      this.db,
      this.userState,
      service,
    );
  }
  constructor(
    private readonly db: Database,
    private readonly clubs: ClubService,
    private readonly clubWorks: ClubWorksService,
    private readonly userState: UserStateService,
  ) {
    this.projection = new ClubContentProjection(db, userState);
  }

  private assertBookClub(context: string) {
    if (context !== "book") {
      throw new ValidationError(
        "Club quotes are only available for book clubs",
      );
    }
  }

  private async requireParticipate(user: AuthUser, clubId: string) {
    const club = await this.clubs.requireView(user, clubId);
    const membership = await this.clubs.getMembership(clubId, user.id);
    if (!membership) {
      throw new ForbiddenError("Club membership required");
    }
    return club;
  }

  async listOverview(
    user: AuthUser,
    clubId: string,
    limit = 5,
  ): Promise<ClubQuotePublic[]> {
    const club = await this.clubs.requireView(user, clubId);
    this.assertBookClub(club.context);
    return this.loadQuotes(user, clubId, Math.min(limit, 20));
  }

  async listAll(user: AuthUser, clubId: string): Promise<ClubQuotePublic[]> {
    const club = await this.clubs.requireView(user, clubId);
    this.assertBookClub(club.context);
    return this.loadQuotes(user, clubId, 200);
  }

  async listShareableAnnotations(
    user: AuthUser,
    clubId: string,
  ): Promise<ClubQuoteShareableAnnotation[]> {
    const club = await this.requireParticipate(user, clubId);
    this.assertBookClub(club.context);

    const currentWork = await this.clubWorks.getCurrentWorkSummary(clubId);
    if (!currentWork || currentWork.workSubjectType !== "book") {
      return [];
    }

    const annotations = await this.userState.listAnnotations(
      user.id,
      "book",
      currentWork.workSubjectId,
    );

    const shareable = annotations.filter((annotation) =>
      isShareableQuoteAnnotation(annotation),
    );
    if (shareable.length === 0) return [];

    const sharedRows = await this.db
      .select({ sourceAnnotationId: schema.clubQuotes.sourceAnnotationId })
      .from(schema.clubQuotes)
      .where(
        and(
          eq(schema.clubQuotes.clubId, clubId),
          inArray(
            schema.clubQuotes.sourceAnnotationId,
            shareable.map((annotation) => annotation.id),
          ),
        ),
      );
    const sharedIds = new Set(
      sharedRows
        .map((row) => row.sourceAnnotationId)
        .filter((id): id is string => !!id),
    );

    return shareable.map((annotation) => {
      const previewText = quoteTextFromAnnotation(annotation)!;
      return {
        id: annotation.id,
        highlightText: annotation.highlightText,
        note: annotation.note,
        locator: annotation.locator,
        previewText,
        alreadyShared: sharedIds.has(annotation.id),
      };
    });
  }

  async createQuote(
    user: AuthUser,
    clubId: string,
    input: {
      text?: string;
      sourceAnnotationId?: string;
      clubReadId?: string;
      mediaLocation?: MediaLocation;
      readerLocator?: ReadingLocator;
    },
  ): Promise<string> {
    const club = await this.requireParticipate(user, clubId);
    this.assertBookClub(club.context);

    const read = input.clubReadId
      ? await this.db.query.clubReads.findFirst({
          where: and(
            eq(schema.clubReads.id, input.clubReadId),
            eq(schema.clubReads.clubId, clubId),
          ),
        })
      : await this.db.query.clubReads.findFirst({
          where: and(
            eq(schema.clubReads.clubId, clubId),
            eq(schema.clubReads.status, "active"),
          ),
        });
    if (input.clubReadId && !read)
      throw new NotFoundError("Club Read not found");
    if (read && read.status !== "active")
      throw new ValidationError("Shares require an active read");
    const currentWork = read
      ? {
          workSubjectType: read.workSubjectType,
          workSubjectId: read.workSubjectId ?? "external:" + read.id,
        }
      : await this.clubWorks.getCurrentWorkSummary(clubId);
    if (!currentWork || currentWork.workSubjectType !== "book")
      throw new ValidationError("An active book read is required");
    let text = input.text?.trim() ?? "";
    let sourceAnnotationId: string | null = null;
    if (input.readerLocator && !read?.workSubjectId)
      throw new ValidationError("Reader locations require a canonical book");
    let locator: ReadingLocator | null = input.readerLocator ?? null;

    if (input.sourceAnnotationId) {
      const annotation = await this.userState.getAnnotation(
        user.id,
        input.sourceAnnotationId,
      );
      if (!annotation) {
        throw new ForbiddenError("Cannot share another member's annotation");
      }
      if (
        annotation.id &&
        (await this.isAnnotationAlreadyShared(clubId, annotation.id))
      ) {
        throw new ValidationError("This annotation was already shared");
      }

      const source = await this.db.query.userAnnotations.findFirst({
        where: and(
          eq(schema.userAnnotations.id, input.sourceAnnotationId),
          eq(schema.userAnnotations.userId, user.id),
        ),
      });
      if (
        source?.subjectId !== currentWork.workSubjectId ||
        source.subjectType !== currentWork.workSubjectType
      )
        throw new ValidationError("Annotation belongs to another Work");
      const derived = quoteTextFromAnnotation(annotation);
      if (!derived) {
        throw new ValidationError("Annotation has no shareable quote text");
      }

      text = input.text?.trim() || derived;
      sourceAnnotationId = annotation.id;
      locator = annotation.locator;
    }

    if (!text) {
      throw new ValidationError("Quote text is required");
    }

    const activeRead = await this.db.query.clubReads.findFirst({
      where: and(
        eq(schema.clubReads.clubId, clubId),
        eq(schema.clubReads.status, "active"),
        eq(schema.clubReads.workSubjectId, currentWork.workSubjectId),
      ),
    });
    if (input.mediaLocation?.reference)
      throw new ValidationError("Use a structural location");
    const id = generateId();
    const now = new Date();
    await this.db.insert(schema.clubQuotes).values({
      id,
      clubId,
      authorUserId: user.id,
      clubReadId: read?.id ?? activeRead?.id ?? null,
      mediaLocation:
        input.mediaLocation ??
        (locator?.totalProgression !== undefined
          ? { kind: "chapter", progression: locator.totalProgression }
          : { kind: "final" }),
      spoilerBoundary:
        locator?.totalProgression !== undefined
          ? { kind: "chapter", progression: locator.totalProgression }
          : (input.mediaLocation ?? { kind: "final" }),
      workSubjectType: currentWork.workSubjectType,
      workSubjectId: currentWork.workSubjectId,
      text,
      sourceAnnotationId,
      locatorJson: locator ?? undefined,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async deleteQuote(user: AuthUser, clubId: string, quoteId: string) {
    await this.requireParticipate(user, clubId);
    const club = await this.clubs.getClub(clubId);
    this.assertBookClub(club.context);

    const quote = await this.db.query.clubQuotes.findFirst({
      where: and(
        eq(schema.clubQuotes.id, quoteId),
        eq(schema.clubQuotes.clubId, clubId),
      ),
    });
    if (!quote) throw new NotFoundError("Quote not found");

    const canModerate = await this.clubs.canModerate(user, club);
    if (quote.authorUserId !== user.id && !canModerate) {
      throw new ForbiddenError();
    }

    await this.db
      .delete(schema.clubQuotes)
      .where(eq(schema.clubQuotes.id, quoteId));
  }

  private async isAnnotationAlreadyShared(
    clubId: string,
    annotationId: string,
  ) {
    const row = await this.db.query.clubQuotes.findFirst({
      where: and(
        eq(schema.clubQuotes.clubId, clubId),
        eq(schema.clubQuotes.sourceAnnotationId, annotationId),
      ),
    });
    return !!row;
  }

  private async loadQuotes(
    user: AuthUser,
    clubId: string,
    limit: number,
  ): Promise<ClubQuotePublic[]> {
    const rows = await this.db
      .select({
        quote: schema.clubQuotes,
        authorUsername: schema.users.username,
        authorDisplayName: schema.users.displayName,
        authorCosmetics: schema.userProfiles.cosmetics,
      })
      .from(schema.clubQuotes)
      .innerJoin(
        schema.users,
        eq(schema.clubQuotes.authorUserId, schema.users.id),
      )
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.users.id),
      )
      .where(eq(schema.clubQuotes.clubId, clubId))
      .orderBy(desc(schema.clubQuotes.createdAt))
      .limit(limit);

    const safetyMap = await this.projection.quotes(
      user.id,
      rows.map((row) => row.quote),
    );
    const canModerate = await this.clubs.canModerate(
      user,
      await this.clubs.getClub(clubId),
    );
    return Promise.all(
      rows.map(async (row) => {
        const safety = safetyMap.get(row.quote.id)!;
        return {
          id: row.quote.id,
          clubId: row.quote.clubId,
          authorUserId: row.quote.authorUserId,
          authorUsername: row.authorUsername,
          authorDisplayName: row.authorDisplayName,
          authorCosmetics: normalizeProfileCosmetics(row.authorCosmetics),
          workSubjectType: row.quote
            .workSubjectType as ClubQuotePublic["workSubjectType"],
          workSubjectId: row.quote.workSubjectId,
          text: safety.visible ? row.quote.text : "",
          clubReadId: row.quote.clubReadId,
          locationLabel: safety.label,
          locked: !safety.visible,
          canUnshare: row.quote.authorUserId === user.id || canModerate,
          sourceAnnotationId:
            row.quote.authorUserId === user.id
              ? row.quote.sourceAnnotationId
              : null,
          locator: null,
          createdAt: row.quote.createdAt.toISOString(),
        };
      }),
    );
  }
}
