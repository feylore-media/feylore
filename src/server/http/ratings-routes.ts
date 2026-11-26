import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { requireAuth } from "./auth-hooks.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ValidationError } from "../../shared/errors.js";
import { ACTIVITY_TYPES } from "../../shared/activity.js";
import {
  bookReviewDraftSchema,
  bookReviewFinalizeSchema,
  bookReviewExternalPostSchema,
  externalPostCredentialSchema,
  type ExternalPostState,
} from "../../shared/ratings.js";

export async function registerRatingsRoutes(
  app: FastifyInstance,
  ctx: AppContext,
) {
  async function bookFromSlug(userId: string, slug: string) {
    const book = await ctx.books.getBookByRef(slug);
    await ctx.books.ensureUserAccess(userId, book.id);
    return book;
  }

  async function ensureReviewContext(rating: number | null | undefined) {
    if (rating === undefined) {
      throw new ValidationError("finalRating is required");
    }
  }

  app.get("/api/v1/books/:slug/review", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const review = await ctx.reviews.getReview(user.id, book.id);
    return { data: { review } };
  });

  app.get("/api/v1/books/:slug/review/config", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_READ);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const [settings, coreDimensions, externalProviders] = await Promise.all([
      ctx.ratingsConfig.getSettings(),
      ctx.ratingsConfig.listCoreDimensions(),
      ctx.externalPosting.listProviders(user.id),
    ]);
    const genreNames = await ctx.books.getGenreNames(book.id);
    const applicable =
      await ctx.reviews.resolveApplicableGenreDefinitions(genreNames);
    return {
      data: {
        settings,
        coreDimensions,
        genreDefinitions: applicable,
        externalProviders,
      },
    };
  });

  app.put("/api/v1/books/:slug/review", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = bookReviewDraftSchema.parse(request.body);
    const review = await ctx.reviews.saveDraft(
      {
        userId: user.id,
        bookId: book.id,
        bookTitle: book.title,
        bookSlug: book.slug,
      },
      body,
    );
    return { data: { review } };
  });

  app.put("/api/v1/books/:slug/review/finalize", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    const body = bookReviewFinalizeSchema.parse(request.body);
    await ensureReviewContext(body.finalRating);
    const before = await ctx.reviews.getReview(user.id, book.id);
    const review = await ctx.reviews.saveRating(
      {
        userId: user.id,
        bookId: book.id,
        bookTitle: book.title,
        bookSlug: book.slug,
      },
      body,
    );
    await ctx.activity.record(
      user.id,
      before?.completedAt
        ? ACTIVITY_TYPES.BOOK_REVIEW_UPDATED
        : ACTIVITY_TYPES.BOOK_REVIEW_SAVED,
      {
        subjectType: "book",
        subjectId: book.id,
        payload: {
          title: book.title,
          slug: book.slug,
          finalRating: body.finalRating,
        },
      },
    );
    return { data: { review } };
  });

  app.delete("/api/v1/books/:slug/review", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const { slug } = request.params as { slug: string };
    const book = await bookFromSlug(user.id, slug);
    await ctx.reviews.removeReview(user.id, book.id);
    await ctx.activity.record(user.id, ACTIVITY_TYPES.BOOK_REVIEW_REMOVED, {
      subjectType: "book",
      subjectId: book.id,
      payload: { title: book.title, slug: book.slug },
    });
    return { data: { removed: true } };
  });

  app.post(
    "/api/v1/books/:slug/review/external/:providerKey",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
      const { slug, providerKey } = request.params as {
        slug: string;
        providerKey: string;
      };
      const body = bookReviewExternalPostSchema.parse({ providerKey });
      const book = await bookFromSlug(user.id, slug);
      const review = await ctx.reviews.getReview(user.id, book.id);
      if (
        !review ||
        review.status !== "completed" ||
        review.finalRating === null
      ) {
        throw new ValidationError(
          "Save and finalize a rating before posting externally",
        );
      }
      try {
        const { state } = await ctx.externalPosting.post(
          {
            userId: user.id,
            bookId: book.id,
            bookTitle: book.title,
            bookSlug: book.slug,
          },
          body.providerKey,
          review,
        );
        const updated = await ctx.reviews.updateExternalPostState(
          user.id,
          book.id,
          body.providerKey,
          state,
        );
        await ctx.activity.record(user.id, ACTIVITY_TYPES.BOOK_REVIEW_POSTED, {
          subjectType: "book",
          subjectId: book.id,
          payload: {
            title: book.title,
            slug: book.slug,
            provider: body.providerKey,
          },
        });
        return { data: { review: updated, state } };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "External posting failed";
        const state: ExternalPostState = {
          status: "failed",
          externalPostId: null,
          postedAt: null,
          lastError: message,
        };
        const updated = await ctx.reviews.updateExternalPostState(
          user.id,
          book.id,
          body.providerKey,
          state,
        );
        return { data: { review: updated, state } };
      }
    },
  );

  app.post("/api/v1/reviews/external/credentials", async (request) => {
    const user = requireAuth(request);
    ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
    const body = externalPostCredentialSchema.parse(request.body);
    await ctx.externalPosting.setCredential(
      user.id,
      body.providerKey,
      body.token,
    );
    return { data: { configured: true } };
  });

  app.delete(
    "/api/v1/reviews/external/credentials/:providerKey",
    async (request) => {
      const user = requireAuth(request);
      ctx.authz.require(user, PERMISSIONS.BOOKS_WRITE);
      const { providerKey } = request.params as { providerKey: string };
      await ctx.externalPosting.removeCredential(user.id, providerKey);
      return { data: { removed: true } };
    },
  );
}
