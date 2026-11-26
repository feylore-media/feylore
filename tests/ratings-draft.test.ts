import { describe, expect, it } from "vitest";
import type { Database } from "../src/server/db/client.js";
import {
  ReviewService,
  type BookReviewRecord,
} from "../src/server/modules/ratings/review-service.js";
import type { RatingConfigService } from "../src/server/modules/ratings/config-service.js";
import {
  bookReviewDraftSchema,
  ratingSystemSettingsSchema,
  type RatingDimension,
} from "../src/shared/ratings.js";

const context = {
  userId: "user",
  bookId: "book",
  bookTitle: "Book",
  bookSlug: "book",
};
const dimension: RatingDimension = {
  id: "dimension",
  key: "enjoyment",
  name: "Enjoyment",
  scope: "core",
  description: null,
  enabled: true,
  displayOrder: 0,
  required: false,
  contributesToRating: true,
  weight: 1,
};

// Exercise the service's persistence behavior without requiring PostgreSQL.
function fixture() {
  let row: BookReviewRecord | null = null;
  const db = {
    query: { bookReviews: { findFirst: async () => row } },
    insert: () => ({
      values: async (values: Partial<BookReviewRecord>) => {
        row = {
          status: "draft",
          externalPosts: {},
          completedAt: null,
          reviewEdited: false,
          ...values,
        } as BookReviewRecord;
      },
    }),
    update: () => ({
      set: (values: Partial<BookReviewRecord>) => ({
        where: async () => {
          row = { ...row, ...values } as BookReviewRecord;
        },
      }),
    }),
  } as unknown as Database;
  const config = {
    getSettings: async () => ratingSystemSettingsSchema.parse({}),
    listCoreDimensions: async () => [dimension],
    listEnabledGenreDefinitions: async () => [],
  } as unknown as RatingConfigService;
  return new ReviewService(db, config);
}

describe("rating draft persistence", () => {
  it("preserves earlier steps when only a later field is saved", async () => {
    const service = fixture();
    await service.saveDraft(context, {
      coreValues: { enjoyment: 4 },
      trajectory: [{ progress: 50, rating: 3 }],
      recommendation: "yes",
      finalRating: 4.5,
      summary: "My summary",
    });
    const saved = await service.saveDraft(context, {
      review: "My full review",
    });
    expect(saved).toMatchObject({
      coreValues: { enjoyment: 4 },
      trajectory: [{ progress: 50, rating: 3 }],
      recommendation: "yes",
      finalRating: 4.5,
      summary: "My summary",
      review: "My full review",
    });
    expect(saved.suggestedRating).toBe(4);
    expect(await service.getReviewForContext(context)).toEqual(saved);
  });

  it("recalculates the suggestion without replacing the chosen final rating", async () => {
    const service = fixture();
    await service.saveDraft(context, {
      coreValues: { enjoyment: 4 },
      finalRating: 4.5,
    });
    const saved = await service.saveDraft(context, {
      coreValues: { enjoyment: 2 },
    });
    expect(saved.suggestedRating).toBe(2);
    expect(saved.finalRating).toBe(4.5);
  });

  it("distinguishes explicit clearing from omitted fields", async () => {
    const service = fixture();
    await service.saveDraft(context, {
      summary: "Summary",
      review: "Review",
      recommendation: "yes",
      finalRating: 4,
    });
    const saved = await service.saveDraft(context, {
      summary: null,
      recommendation: null,
      finalRating: null,
    });
    expect(saved.summary).toBeNull();
    expect(saved.recommendation).toBeNull();
    expect(saved.finalRating).toBeNull();
    expect(saved.review).toBe("Review");
  });

  it("requires finalization again after a completed review is edited", async () => {
    const service = fixture();
    await service.saveDraft(context, { finalRating: 4 });
    expect((await service.finalize(context, { finalRating: 4 })).status).toBe(
      "completed",
    );
    expect(
      (await service.saveDraft(context, { review: "Updated review" })).status,
    ).toBe("draft");
  });

  it("accepts a draft final rating and rejects invalid scores", () => {
    expect(bookReviewDraftSchema.parse({ finalRating: 4.5 })).toEqual({
      finalRating: 4.5,
    });
    expect(bookReviewDraftSchema.safeParse({ finalRating: 11 }).success).toBe(
      false,
    );
    expect(bookReviewDraftSchema.safeParse({ finalRating: 0 }).success).toBe(
      false,
    );
  });

  it("marks an existing post stale when its rating changes through a saved draft", async () => {
    const service = fixture();
    await service.saveDraft(context, { finalRating: 4 });
    await service.finalize(context, { finalRating: 4 });
    await service.updateExternalPostState("user", "book", "provider", {
      status: "posted",
      externalPostId: "post",
      postedAt: null,
      lastError: null,
    });
    await service.saveDraft(context, { finalRating: 3 });
    const saved = await service.finalize(context, { finalRating: 3 });
    expect(saved.externalPosts.provider?.status).toBe("previously_posted");
  });
});
