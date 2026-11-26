import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/server/http/app.js";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { ROLE_NAMES } from "../src/shared/permissions.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://feylore:feylore@localhost:5432/feylore_test";

const dbAvailable = await (async () => {
  try {
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await pool.end();
    return true;
  } catch {
    return false;
  }
})();

async function createBook(
  app: Awaited<ReturnType<typeof buildApp>>["app"],
  cookie: string,
  title: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/books",
    headers: {
      cookie,
      origin: "http://localhost:5173",
      "content-type": "application/json",
    },
    payload: { title, authors: ["Author"] },
  });
  expect(res.statusCode).toBe(201);
  return res.json().data as { id: string; slug: string };
}

describe.skipIf(!dbAvailable)("Club quotes API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: ReturnType<typeof createPool>;
  let ownerCookie: string;
  let memberCookie: string;
  let otherCookie: string;
  let clubId: string;
  let bookId: string;
  let bookSlug: string;
  let ownerAnnotationId: string;
  let otherAnnotationId: string;

  beforeAll(async () => {
    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;

    const ownerId = generateId();
    const memberId = generateId();
    const otherId = generateId();
    const passwordHash = await hash("password123");

    await db.insert(schema.users).values([
      {
        id: ownerId,
        username: "quoteowner",
        displayName: "Quote Owner",
        passwordHash,
      },
      {
        id: memberId,
        username: "quotemember",
        displayName: "Quote Member",
        passwordHash,
      },
      {
        id: otherId,
        username: "quoteother",
        displayName: "Quote Other",
        passwordHash,
      },
    ]);

    for (const userId of [ownerId, memberId, otherId]) {
      await db.insert(schema.userRoles).values({
        userId,
        roleId: (
          await db.query.roles.findFirst({
            where: eq(schema.roles.name, ROLE_NAMES.USER),
          })
        )!.id,
      });
    }

    const login = async (username: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: {
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { username, password: "password123" },
      });
      expect(res.statusCode).toBe(200);
      return res.cookies.find((c) => c.name === "session")!.value;
    };

    ownerCookie = await login("quoteowner");
    memberCookie = await login("quotemember");
    otherCookie = await login("quoteother");

    const clubRes = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: `session=${ownerCookie}`,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Book Club Quotes",
        context: "book",
        visibility: "private",
      },
    });
    expect(clubRes.statusCode).toBe(201);
    clubId = clubRes.json().data.id as string;

    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/join`,
      headers: {
        cookie: `session=${memberCookie}`,
        origin: "http://localhost:5173",
      },
    });

    const book = await createBook(app, ownerCookie, "Quote Test Book");
    bookId = book.id;
    bookSlug = book.slug;

    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/works`,
      headers: {
        cookie: `session=${ownerCookie}`,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        workSubjectType: "book",
        workSubjectId: bookId,
        status: "current",
      },
    });

    const ownerAnn = await app.inject({
      method: "POST",
      url: `/api/v1/books/${bookSlug}/annotations`,
      headers: {
        cookie: `session=${ownerCookie}`,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: { type: "epub-cfi", title: "Chapter 1" },
        highlightText: "Shared highlight",
      },
    });
    expect(ownerAnn.statusCode).toBe(201);
    ownerAnnotationId = ownerAnn.json().data.id as string;

    await app.inject({
      method: "POST",
      url: `/api/v1/books/${bookSlug}/annotations`,
      headers: {
        cookie: `session=${otherCookie}`,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        locator: { type: "epub-cfi", title: "Chapter 2" },
        highlightText: "Private other highlight",
      },
    });
    const otherAnnRow = await db.query.userAnnotations.findFirst({
      where: eq(schema.userAnnotations.userId, otherId),
    });
    otherAnnotationId = otherAnnRow!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rejects quote APIs for non-book clubs", async () => {
    const videoClub = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: `session=${ownerCookie}`,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Watch Club",
        context: "video",
        visibility: "private",
      },
    });
    const videoClubId = videoClub.json().data.id as string;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${videoClubId}/quotes`,
      headers: {
        cookie: `session=${ownerCookie}`,
        origin: "http://localhost:5173",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("shares quote from own annotation", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/quotes`,
      headers: {
        cookie: `session=${ownerCookie}`,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { sourceAnnotationId: ownerAnnotationId },
    });
    expect(res.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/quotes`,
      headers: {
        cookie: `session=${memberCookie}`,
        origin: "http://localhost:5173",
      },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.quotes).toHaveLength(1);
    expect(list.json().data.quotes[0].text).toContain("Shared highlight");
  });

  it("rejects sharing another member's annotation", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/join`,
      headers: {
        cookie: `session=${otherCookie}`,
        origin: "http://localhost:5173",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/quotes`,
      headers: {
        cookie: `session=${memberCookie}`,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { sourceAnnotationId: otherAnnotationId },
    });
    expect(res.statusCode).toBe(403);
  });
});
