import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  calculateSuggestedRating,
  filterDimensionValues,
  normalizeTrajectory,
  type BookReview,
  type BookReviewDraftInput,
  type BookReviewFinalizeInput,
  type BookReviewStatus,
  type ExternalPostState,
  type GenreRatingDefinition,
  type RatingDimension,
  type RatingSystemSettings,
  type TrajectoryPoint,
} from "../../../shared/ratings.js";
import type { RatingConfigService } from "./config-service.js";

export type BookReviewRecord = typeof schema.bookReviews.$inferSelect;

export interface ReviewContext {
  userId: string;
  bookId: string;
  bookTitle: string;
  bookSlug: string;
}

type VocabTermRow = typeof schema.metadataVocabularyTerms.$inferSelect;

function mapReview(row: BookReviewRecord): BookReview {
  return {
    status: row.status as BookReviewStatus,
    recommendation: row.recommendation,
    suggestedRating: row.suggestedRating,
    finalRating: row.finalRating,
    coreValues: row.coreValues ?? {},
    genreValues: row.genreValues ?? {},
    trajectory: (row.trajectory ?? []) as TrajectoryPoint[],
    summary: row.summary,
    review: row.review,
    reviewEdited: row.reviewEdited,
    externalPosts: (row.externalPosts ?? {}) as Record<
      string,
      ExternalPostState
    >,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export class ReviewService {
  constructor(
    private readonly db: Database,
    private readonly config: RatingConfigService,
  ) {}

  async getReview(userId: string, bookId: string): Promise<BookReview | null> {
    const row = await this.db.query.bookReviews.findFirst({
      where: and(
        eq(schema.bookReviews.userId, userId),
        eq(schema.bookReviews.bookId, bookId),
      ),
    });
    return row ? mapReview(row) : null;
  }

  async getReviewForContext(
    context: ReviewContext,
  ): Promise<BookReview | null> {
    return this.getReview(context.userId, context.bookId);
  }

  async getReviewWithCoreDims(
    userId: string,
    bookId: string,
  ): Promise<{
    review: BookReview | null;
    coreDimensions: RatingDimension[];
  }> {
    const [review, coreDimensions] = await Promise.all([
      this.getReview(userId, bookId),
      this.config.listCoreDimensions(),
    ]);
    return { review, coreDimensions };
  }

  async saveDraft(
    context: ReviewContext,
    draft: BookReviewDraftInput,
  ): Promise<BookReview> {
    const [existing, settings, coreDimensions, genreDefinitions] =
      await Promise.all([
        this.getRow(context.userId, context.bookId),
        this.config.getSettings(),
        this.config.listCoreDimensions(),
        this.config.listEnabledGenreDefinitions(),
      ]);

    const coreKeys = new Set(coreDimensions.map((d) => d.key));
    const coreValues = filterDimensionValues(
      draft.coreValues ?? existing?.coreValues ?? {},
      [...coreKeys],
    );
    const genreValues = filterGenreValues(
      draft.genreValues ?? existing?.genreValues ?? {},
      genreDefinitions,
    );
    const trajectory = normalizeTrajectory(
      draft.trajectory ?? existing?.trajectory ?? [],
    );
    const suggestedRating = this.computeSuggestedRating(
      coreValues,
      genreValues,
      trajectory,
      coreDimensions,
      genreDefinitions,
      settings,
    );

    const now = new Date();
    const contentChanged =
      existing &&
      ((draft.finalRating !== undefined &&
        draft.finalRating !== existing.finalRating) ||
        (draft.recommendation !== undefined &&
          draft.recommendation !== existing.recommendation) ||
        (draft.summary !== undefined && draft.summary !== existing.summary) ||
        (draft.review !== undefined && draft.review !== existing.review));
    const values = {
      userId: context.userId,
      bookId: context.bookId,
      coreValues,
      genreValues,
      trajectory,
      suggestedRating,
      finalRating:
        draft.finalRating !== undefined
          ? draft.finalRating
          : (existing?.finalRating ?? null),
      recommendation:
        draft.recommendation !== undefined
          ? draft.recommendation
          : (existing?.recommendation ?? null),
      summary:
        draft.summary !== undefined
          ? draft.summary
          : (existing?.summary ?? null),
      review:
        draft.review !== undefined ? draft.review : (existing?.review ?? null),
      // Draft edits must be finalized again before they can be posted.
      status: "draft" as const,
      reviewEdited: !!contentChanged || (existing?.reviewEdited ?? false),
      updatedAt: now,
    };

    if (existing) {
      await this.db
        .update(schema.bookReviews)
        .set(values)
        .where(eq(schema.bookReviews.id, existing.id));
      return mapReview((await this.getRow(context.userId, context.bookId))!);
    }

    await this.db.insert(schema.bookReviews).values({
      id: randomUUID(),
      ...values,
    });
    return mapReview((await this.getRow(context.userId, context.bookId))!);
  }

  async saveRating(
    context: ReviewContext,
    input: BookReviewFinalizeInput,
  ): Promise<BookReview> {
    return this.db.transaction(async (tx) => {
      const service = new ReviewService(tx as unknown as Database, this.config);
      await service.saveDraft(context, { ...input, summary: null });
      return service.finalize(context, input);
    });
  }

  async finalize(
    context: ReviewContext,
    input: BookReviewFinalizeInput,
  ): Promise<BookReview> {
    const current = await this.getRow(context.userId, context.bookId);
    if (!current) {
      throw new NotFoundError("No rating draft exists for this book");
    }
    const existingPosts = (current.externalPosts ?? {}) as Record<
      string,
      ExternalPostState
    >;
    const externalPosts: Record<string, ExternalPostState> = {};
    for (const [key, state] of Object.entries(existingPosts)) {
      const changed =
        (current.finalRating !== null &&
          current.finalRating !== input.finalRating) ||
        input.reviewEdited ||
        current.reviewEdited;
      if (state.status === "posted" && changed) {
        externalPosts[key] = {
          ...state,
          status: "previously_posted",
        };
      } else {
        externalPosts[key] = state;
      }
    }

    const now = new Date();
    await this.db
      .update(schema.bookReviews)
      .set({
        status: "completed",
        finalRating: input.finalRating,
        recommendation: input.recommendation ?? current.recommendation,
        summary: input.summary ?? current.summary,
        review: input.review ?? current.review,
        reviewEdited: input.reviewEdited ?? false,
        externalPosts,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.bookReviews.id, current.id));

    return mapReview((await this.getRow(context.userId, context.bookId))!);
  }

  async removeReview(userId: string, bookId: string): Promise<void> {
    await this.db
      .delete(schema.bookReviews)
      .where(
        and(
          eq(schema.bookReviews.userId, userId),
          eq(schema.bookReviews.bookId, bookId),
        ),
      );
  }

  async updateExternalPostState(
    userId: string,
    bookId: string,
    providerKey: string,
    state: ExternalPostState,
  ): Promise<BookReview> {
    const row = await this.getRow(userId, bookId);
    if (!row) {
      throw new NotFoundError("No rating review exists for this book");
    }
    const externalPosts = {
      ...((row.externalPosts ?? {}) as Record<string, ExternalPostState>),
      [providerKey]: state,
    };
    await this.db
      .update(schema.bookReviews)
      .set({ externalPosts, updatedAt: new Date() })
      .where(eq(schema.bookReviews.id, row.id));
    return mapReview((await this.getRow(userId, bookId))!);
  }

  /** Resolve the applicable enabled genre definitions for a book given its genre names. */
  async resolveApplicableGenreDefinitions(
    genreNames: string[],
  ): Promise<GenreRatingDefinition[]> {
    const [all, aliases, enabledDefs] = await Promise.all([
      this.listAllGenreTerms(),
      this.db
        .select()
        .from(schema.metadataVocabularyAliases)
        .where(eq(schema.metadataVocabularyAliases.kind, "genre")),
      this.config.listEnabledGenreDefinitions(),
    ]);
    const byNormalized = new Map<string, VocabTermRow>();
    for (const term of all.values())
      if (term.enabled && ((term.mediaTypes ?? []).length === 0 || term.mediaTypes.includes("books"))) {
        byNormalized.set(term.normalizedName, term);
      }
    for (const alias of aliases) {
      const term = all.get(alias.termId);
      if (term?.enabled && ((term.mediaTypes ?? []).length === 0 || term.mediaTypes.includes("books"))) {
        byNormalized.set(alias.normalizedAlias, term);
      }
    }

    const defsByTermId = new Map(enabledDefs.map((d) => [d.genreTermId, d]));
    const applicable = new Map<string, GenreRatingDefinition>();
    const seen = new Set<string>();

    for (const raw of genreNames) {
      const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
      const term = byNormalized.get(normalized);
      if (!term || seen.has(term.id)) continue;
      seen.add(term.id);
      const inherited = this.walkUpForDefinition(term.id, all, defsByTermId);
      if (inherited) {
        applicable.set(inherited.genreTermId, {
          ...inherited,
          selectedGenreTermId: term.id,
          selectedGenreName: term.name,
          inheritedFrom: term.id === inherited.genreTermId ? null : inherited.genreName,
        });
      }
    }

    return [...applicable.values()];
  }

  computeSuggestedRating(
    coreValues: Record<string, number>,
    genreValues: Record<string, Record<string, number>>,
    trajectory: TrajectoryPoint[],
    coreDimensions: RatingDimension[],
    genreDefinitions: GenreRatingDefinition[],
    settings: RatingSystemSettings,
  ): number | null {
    const core = coreDimensions
      .filter((d) => d.enabled && d.contributesToRating)
      .map((d) => ({ value: coreValues[d.key] ?? 0, weight: d.weight }));

    const genreGroups: { value: number; weight: number }[][] = [];
    for (const definition of genreDefinitions) {
      const groupValues = definition.dimensions.filter(
        (d) => d.enabled && d.contributesToRating,
      );
      if (groupValues.length === 0) continue;
      const group = groupValues.map((d) => ({
        value: genreValues[definition.genreTermId]?.[d.key] ?? 0,
        weight: d.weight,
      }));
      if (group.some((g) => g.value > 0)) genreGroups.push(group);
    }

    const trajectoryGroup = trajectory.map((p) => ({
      value: p.rating,
      weight: 1,
    }));

    return calculateSuggestedRating({
      core,
      genreGroups,
      trajectory: trajectoryGroup,
      settings,
    });
  }

  // --- Internal helpers ---

  private async getRow(
    userId: string,
    bookId: string,
  ): Promise<BookReviewRecord | null> {
    const row = await this.db.query.bookReviews.findFirst({
      where: and(
        eq(schema.bookReviews.userId, userId),
        eq(schema.bookReviews.bookId, bookId),
      ),
    });
    return row ?? null;
  }

  private async listAllGenreTerms(): Promise<Map<string, VocabTermRow>> {
    const rows = await this.db
      .select()
      .from(schema.metadataVocabularyTerms)
      .where(eq(schema.metadataVocabularyTerms.kind, "genre"));
    return new Map(rows.map((r) => [r.id, r]));
  }

  private walkUpForDefinition(
    termId: string,
    terms: Map<string, VocabTermRow>,
    defsByTermId: Map<string, GenreRatingDefinition>,
  ): GenreRatingDefinition | null {
    let cursor = terms.get(termId);
    let depth = 0;
    while (cursor) {
      const definition = defsByTermId.get(cursor.id);
      if (definition && definition.inheritanceMode === "custom") return definition;
      if (depth >= 8 || !cursor.parentId) break;
      cursor = terms.get(cursor.parentId);
      depth += 1;
    }
    return null;
  }
}

function filterGenreValues(
  values: Record<string, Record<string, number>>,
  definitions: GenreRatingDefinition[],
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const definition of definitions) {
    const raw = values[definition.genreTermId];
    if (!raw) continue;
    const keys = new Set(definition.dimensions.map((d) => d.key));
    const filtered = filterDimensionValues(raw, [...keys]);
    if (Object.keys(filtered).length > 0) {
      result[definition.genreTermId] = filtered;
    }
  }
  return result;
}

export type { ExternalPostState };
