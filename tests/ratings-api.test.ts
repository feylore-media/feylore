import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildApp } from "../src/server/http/app.js";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { ensureTestUser } from "./helpers/test-user.js";
import { ROLE_NAMES } from "../src/shared/permissions.js";
import type { GenreRatingDefinition } from "../src/shared/ratings.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://feylore:feylore@localhost:5432/feylore_test";

const dbAvailable = await (async () => {
  try {
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);
    await pool.end();
    return true;
  } catch {
    return false;
  }
})();

describe("Ratings API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let adminCookie = "";
  let memberCookie = "";
  let memberUserId = "";
  let bookId = "";
  let bookSlug = "";
  let fictionDefinition: GenreRatingDefinition | undefined;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-ratings-api-"),
    );

    try {
      pool = createPool(DATABASE_URL);
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: "./drizzle" });
      await seed(db);

      const built = await buildApp();
      app = built.app;
      ctx = built.ctx;
      pool = built.pool;

      const adminId = await ensureTestUser(db, "ratings-admin@test.local", {
        roleId: (
          await db.query.roles.findFirst({
            where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
          })
        )?.id,
      });
      memberUserId = await ensureTestUser(db, "ratings-member@test.local", {
        roleId: (
          await db.query.roles.findFirst({
            where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
          })
        )?.id,
      });
      await db.insert(schema.userPreferences).values({ userId: adminId });
      await db.insert(schema.userPreferences).values({ userId: memberUserId });

      async function login(email: string) {
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          headers: {
            origin: "http://localhost:5173",
            "content-type": "application/json",
          },
          payload: { email, password: "password123" },
        });
        expect(res.statusCode).toBe(200);
        return res.headers["set-cookie"]?.toString() ?? "";
      }
      adminCookie = await login("ratings-admin@test.local");
      memberCookie = await login("ratings-member@test.local");
    } catch (e) {
      console.error("Ratings API test setup failed:", e);
      throw e;
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)(
    "bootstraps genre rating configuration in the test environment",
    async () => {
      // Vocabulary terms are one-time seeded; a shared test DB may already
      // contain arbitrary tag terms that make the vocabulary seed early-return.
      // Ensure a Fiction genre term exists, then use the admin API (which is
      // what the test wants to exercise anyway) to create its rating definition.
      const existing = await ctx.db.query.metadataVocabularyTerms.findFirst({
        where: eq(schema.metadataVocabularyTerms.normalizedName, "fiction"),
      });
      const termId =
        existing?.id ??
        (await ctx.metadataFormatting.createTerm({
          kind: "genre",
          name: "Fiction",
        }));

      const config = await app.inject({
        method: "GET",
        url: "/api/v1/admin/ratings/config",
        headers: { cookie: adminCookie },
      });
      const data = config.json().data;
      const hasFiction = data.genreDefinitions.some(
        (d: GenreRatingDefinition) => d.genreTermId === termId,
      );
      if (!hasFiction) {
        const enable = await app.inject({
          method: "PUT",
          url: `/api/v1/admin/ratings/genres/${termId}`,
          headers: {
            cookie: adminCookie,
            origin: "http://localhost:5173",
            "content-type": "application/json",
          },
          payload: { genreTermId: termId, enabled: true, displayOrder: 0 },
        });
        expect(enable.statusCode).toBe(200);

        for (const [key, name] of [
          ["characters", "Characters"],
          ["plot", "Plot"],
        ] as const) {
          const addDim = await app.inject({
            method: "PUT",
            url: "/api/v1/admin/ratings/dimensions/genre",
            headers: {
              cookie: adminCookie,
              origin: "http://localhost:5173",
              "content-type": "application/json",
            },
            payload: { genreTermId: termId, key, name, displayOrder: 0 },
          });
          expect(addDim.statusCode).toBe(200);
        }
      }
    },
  );

  it.skipIf(!dbAvailable)("serves the admin rating configuration", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/ratings/config",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.settings).toBeTruthy();
    expect(data.settings.scale).toBe(5);
    expect(data.coreDimensions.length).toBeGreaterThan(0);
    expect(
      data.coreDimensions.every((d: { scope: string }) => d.scope === "core"),
    ).toBe(true);
    expect(data.genreDefinitions.length).toBeGreaterThan(0);
    expect(
      data.externalProviders.some(
        (p: { key: string }) => p.key === "hardcover",
      ),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)(
    "blocks non-admins from mutating the admin configuration",
    async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/admin/ratings/settings",
        headers: {
          cookie: memberCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { mode: "simple" },
      });
      expect(res.statusCode).toBe(403);
    },
  );

  it.skipIf(!dbAvailable)("allows admins to update settings", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/ratings/settings",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { mode: "simple", allowHalfStars: false },
    });
    expect(res.statusCode).toBe(200);
    const settings = res.json().data.settings;
    expect(settings.mode).toBe("simple");
    expect(settings.allowHalfStars).toBe(false);

    await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/ratings/settings",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { mode: "advanced", allowHalfStars: true },
    });
  });

  it.skipIf(!dbAvailable)(
    "supports adding and deleting core dimensions",
    async () => {
      const create = await app.inject({
        method: "PUT",
        url: "/api/v1/admin/ratings/dimensions/core",
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: {
          key: "test-dimension",
          name: "Test Dimension",
          displayOrder: 99,
        },
      });
      expect(create.statusCode).toBe(200);
      const dimension = create.json().data.dimension;
      expect(dimension.key).toBe("test-dimension");

      const remove = await app.inject({
        method: "DELETE",
        url: `/api/v1/admin/ratings/dimensions/${dimension.id}`,
        headers: { cookie: adminCookie },
      });
      expect(remove.statusCode).toBe(200);
      expect(remove.json().data.removed).toBe(true);
    },
  );

  it.skipIf(!dbAvailable)(
    "creates a book and serves its rating config",
    async () => {
      const create = await app.inject({
        method: "POST",
        url: "/api/v1/books",
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { title: "Ratings API Test Book", genres: ["Fiction"] },
      });
      expect(create.statusCode).toBe(201);
      bookId = create.json().data.id;
      bookSlug = create.json().data.slug;
      expect(bookId).toMatch(/^[a-z0-9]{6}$/);

      await ctx.db.insert(schema.libraryMemberships).values({
        userId: memberUserId,
        targetType: "book",
        targetId: bookId,
      });

      const config = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/review/config`,
        headers: { cookie: adminCookie },
      });
      expect(config.statusCode).toBe(200);
      const data = config.json().data;
      expect(data.settings).toBeTruthy();
      expect(data.coreDimensions.length).toBeGreaterThan(0);
      fictionDefinition = data.genreDefinitions.find(
        (d: GenreRatingDefinition) => d.genreName === "Fiction",
      );
      expect(fictionDefinition).toBeTruthy();
      expect(fictionDefinition!.dimensions.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(!dbAvailable)(
    "saves a draft review and computes a suggested rating",
    async () => {
      const core: Record<string, number> = {};
      const coreConfig = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/review/config`,
        headers: { cookie: adminCookie },
      });
      const coreDimensions = coreConfig.json().data.coreDimensions;
      for (const dim of coreDimensions) {
        core[dim.key as string] = 5;
      }

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/books/${bookSlug}/review`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: {
          coreValues: core,
          trajectory: [
            { progress: 25, rating: 4 },
            { progress: 50, rating: 5 },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const review = res.json().data.review;
      expect(review.status).toBe("draft");
      expect(review.coreValues).toEqual(core);
      expect(review.trajectory).toEqual([
        { progress: 25, rating: 4 },
        { progress: 50, rating: 5 },
      ]);
      // All core dims at 5 -> suggested 5.
      expect(review.suggestedRating).toBe(5);
    },
  );

  it.skipIf(!dbAvailable)(
    "incorporates genre ratings into the suggested rating",
    async () => {
      const genreValues: Record<string, Record<string, number>> = {};
      const genre = fictionDefinition!;
      for (const dim of genre.dimensions) {
        genreValues[genre.genreTermId] = {
          ...(genreValues[genre.genreTermId] ?? {}),
          [dim.key]: 4,
        };
      }
      const config = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/review/config`,
        headers: { cookie: adminCookie },
      });
      const coreDimensions = config.json().data.coreDimensions;
      const core: Record<string, number> = {};
      for (const dim of coreDimensions) core[dim.key] = 5;

      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/books/${bookSlug}/review`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { coreValues: core, genreValues },
      });
      expect(res.statusCode).toBe(200);
      const review = res.json().data.review;
      // mean(core=5, genre=4) with equal weights -> 4.5
      expect(review.suggestedRating).toBe(4.5);
      expect(review.genreValues[genre.genreTermId]).toBeDefined();
    },
  );

  it.skipIf(!dbAvailable)("finalizes a review", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/review/finalize`,
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        finalRating: 5,
        recommendation: "yes",
        summary: "A compelling read.",
        review: "Full review text.",
      },
    });
    expect(res.statusCode).toBe(200);
    const review = res.json().data.review;
    expect(review.status).toBe("completed");
    expect(review.finalRating).toBe(5);
    expect(review.recommendation).toBe("yes");
    expect(review.summary).toBe("A compelling read.");
  });

  it.skipIf(!dbAvailable)("returns the current user's own review", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}/review`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const review = res.json().data.review;
    expect(review.status).toBe("completed");
    expect(review.finalRating).toBe(5);
    expect(review.suggestedRating).toBe(4.5);
  });

  it.skipIf(!dbAvailable)("keeps reviews scoped per user", async () => {
    const memberView = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}/review`,
      headers: { cookie: memberCookie },
    });
    expect(memberView.statusCode).toBe(200);
    expect(memberView.json().data.review).toBeNull();

    const memberDraft = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/review`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { coreValues: { characters: 3, writing: 3 } },
    });
    expect(memberDraft.statusCode).toBe(200);

    const memberSave = await app.inject({
      method: "PUT",
      url: `/api/v1/books/${bookSlug}/review/finalize`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { finalRating: 3, recommendation: "no" },
    });
    expect(memberSave.statusCode).toBe(200);
    expect(memberSave.json().data.review.finalRating).toBe(3);

    const adminView = await app.inject({
      method: "GET",
      url: `/api/v1/books/${bookSlug}/review`,
      headers: { cookie: adminCookie },
    });
    expect(adminView.json().data.review.finalRating).toBe(5);
  });

  it.skipIf(!dbAvailable)(
    "deletes a review without deleting the book",
    async () => {
      const before = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}`,
        headers: { cookie: adminCookie },
      });
      expect(before.statusCode).toBe(200);

      const remove = await app.inject({
        method: "DELETE",
        url: `/api/v1/books/${bookSlug}/review`,
        headers: { cookie: memberCookie },
      });
      expect(remove.statusCode).toBe(200);

      const after = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/review`,
        headers: { cookie: memberCookie },
      });
      expect(after.json().data.review).toBeNull();

      const stillThere = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}`,
        headers: { cookie: adminCookie },
      });
      expect(stillThere.statusCode).toBe(200);
    },
  );

  it.skipIf(!dbAvailable)(
    "does not overwrite user state during deletes of unrelated data",
    async () => {
      const adminStill = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/review`,
        headers: { cookie: adminCookie },
      });
      expect(adminStill.json().data.review).not.toBeNull();
    },
  );
  it.skipIf(!dbAvailable)(
    "saves a complete rating without creating a draft first",
    async () => {
      const payload = {
        finalRating: 4,
        coreValues: {},
        genreValues: {},
        trajectory: [
          { progress: 25, rating: 2 },
          { progress: 100, rating: 5 },
        ],
        recommendation: null,
        review: "Saved directly",
        summary: null,
      };
      const saved = await app.inject({
        method: "PUT",
        url: `/api/v1/books/${bookSlug}/review/finalize`,
        headers: { cookie: memberCookie, origin: "http://localhost:5173" },
        payload,
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().data.review).toMatchObject({
        ...payload,
        status: "completed",
      });
      const loaded = await app.inject({
        method: "GET",
        url: `/api/v1/books/${bookSlug}/review`,
        headers: { cookie: memberCookie },
      });
      expect(loaded.json().data.review).toMatchObject({
        ...payload,
        status: "completed",
      });
    },
  );
});
