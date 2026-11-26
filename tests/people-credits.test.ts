import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq, and, count, sql } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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

describe("Creative identity credit sync", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let ctx: Awaited<ReturnType<typeof buildApp>>["ctx"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let adminCookie = "";
  let storageRoot = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-people-"));

    try {
      pool = createPool(DATABASE_URL);
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: "./drizzle" });
      await seed(db);
    } catch {
      console.warn(
        "PostgreSQL unavailable — skipping integration tests. Run: docker compose -f docker-compose.dev.yml up -d",
      );
      return;
    }

    const built = await buildApp();
    app = built.app;
    ctx = built.ctx;
    pool = built.pool;

    const db2 = createDb(pool);
    const adminId = generateId();
    await db2.delete(schema.users).where(eq(schema.users.email, "admin@people.local"));
    await db2.insert(schema.users).values({
      id: adminId,
      email: "admin@people.local",
      username: "peopleadmin",
      displayName: "People Admin",
      passwordHash: await hash("password123"),
    });
    const adminRole = await db2.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await db2
        .insert(schema.userRoles)
        .values({ userId: adminId, roleId: adminRole.id });
    }

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "admin@people.local", password: "password123" },
    });
    adminCookie = login.headers["set-cookie"]?.toString() ?? "";
  }, 60000);

  afterAll(async () => {
    if (!dbAvailable) return;
    await app?.close();
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  async function createBook(
    title: string,
    authors: string[],
  ): Promise<{ slug: string }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title, authors },
    });
    expect(res.statusCode).toBe(201);
    return res.json().data as { slug: string };
  }

  it.skipIf(!dbAvailable)(
    "creating a book resolves authors into the People graph",
    async () => {
      const db = createDb(pool);
      const { id: bookId } = (
        await createBook("Dungeon Crawler Carl", ["Matt Dinniman"])
      );

      const credit = await db
        .select({
          peopleName: schema.people.name,
          role: schema.personCredits.role,
          peopleId: schema.personCredits.peopleId,
        })
        .from(schema.personCredits)
        .innerJoin(
          schema.people,
          eq(schema.personCredits.peopleId, schema.people.id),
        )
        .where(
          and(
            eq(schema.personCredits.targetType, "book"),
            eq(schema.personCredits.targetId, bookId),
            eq(schema.personCredits.role, "author"),
          ),
        );
      expect(credit).toHaveLength(1);
      expect(credit[0]?.peopleName).toBe("Matt Dinniman");

      const authorRow = await db.query.bookAuthors.findFirst({
        where: and(
          eq(schema.bookAuthors.bookId, bookId),
          eq(schema.bookAuthors.name, "Matt Dinniman"),
        ),
      });
      expect(authorRow?.peopleId).toBe(credit[0]?.peopleId);
    },
  );

  it.skipIf(!dbAvailable)(
    "the authors people grid returns credited authors",
    async () => {
      const { slug } = await createBook("Kaiju Battlefield Surgeon", [
        "Shane Michael Murray",
      ]);
      expect(slug).toBeTruthy();

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/books/authors/people?size=100",
        headers: { cookie: adminCookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const names = res
        .json()
        .data.items.map((i: { name: string }) => i.name) as string[];
      expect(names).toContain("Shane Michael Murray");
      expect(names).toContain("Matt Dinniman");
    },
  );

  it.skipIf(!dbAvailable)(
    "book detail exposes the canonical people link",
    async () => {
      const { slug } = await createBook("The Dungeon Anarchist's Cookbook", [
        "Matt Dinniman",
      ]);
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/books/${slug}`,
        headers: { cookie: adminCookie, origin: "http://localhost:5173" },
      });
      expect(res.statusCode).toBe(200);
      const detail = res.json().data as {
        authors: Array<{
          name: string;
          peopleId: string | null;
          peopleSlug: string | null;
        }>;
      };
      const author = detail.authors.find((a) => a.name === "Matt Dinniman");
      expect(author?.peopleId).toBeTruthy();
      expect(author?.peopleSlug).toBeTruthy();
    },
  );

  it.skipIf(!dbAvailable)(
    "replacing book authors removes stale credits",
    async () => {
      const db = createDb(pool);
      const { slug } = await createBook("Zero to One", ["Peter Thiel"]);

      const putRes = await app.inject({
        method: "PUT",
        url: `/api/v1/books/${slug}/authors`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { authors: ["Blake Masters"] },
      });
      expect(putRes.statusCode).toBe(200);

      const stale = await db
        .select({ id: schema.personCredits.id })
        .from(schema.personCredits)
        .innerJoin(
          schema.people,
          eq(schema.personCredits.peopleId, schema.people.id),
        )
        .where(
          and(
            eq(schema.personCredits.targetType, "book"),
            eq(schema.people.name, "Peter Thiel"),
          ),
        );
      expect(stale).toHaveLength(0);
    },
  );

  it.skipIf(!dbAvailable)(
    "name resolution is case-insensitive and does not duplicate entities",
    async () => {
      const db = createDb(pool);
      await createBook("Dungeon Crawler Carl", ["Matt Dinniman"]);
      await createBook("Dungeon Crawler Carl 2", ["matt dinniman"]);
      await createBook("Dungeon Crawler Carl 3", ["MATT DINNIMAN"]);

      const [{ total }] = await db
        .select({ total: count() })
        .from(schema.people)
        .where(sql`lower(name) = 'matt dinniman'`);
      expect(total).toBe(1);
    },
  );

  it.skipIf(!dbAvailable)(
    "backfill is idempotent",
    async () => {
      const db = createDb(pool);
      const { id: bookId } = await createBook("Project Hail Mary", [
        "Andy Weir",
      ]);

      await db
        .update(schema.bookAuthors)
        .set({ peopleId: null })
        .where(
          and(
            eq(schema.bookAuthors.bookId, bookId),
            eq(schema.bookAuthors.name, "Andy Weir"),
          ),
        );

      await ctx.people.backfillBookAuthors();
      await ctx.people.backfillBookAuthors();

      const [{ total }] = await db
        .select({ total: count() })
        .from(schema.personCredits)
        .where(
          and(
            eq(schema.personCredits.targetType, "book"),
            eq(schema.personCredits.targetId, bookId),
            eq(schema.personCredits.role, "author"),
          ),
        );
      expect(total).toBe(1);
    },
  );

  it.skipIf(!dbAvailable)(
    "audiobook narrators and authors are linked into the People graph",
    async () => {
      const db = createDb(pool);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/audiobooks",
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: {
          title: "Dungeon Crawler Carl (Audible)",
          authors: ["Jeff Hays"],
          narrators: ["Jeff Hays"],
        },
      });
      expect(res.statusCode).toBe(201);
      const audiobook = res.json().data as { id: string };
      const id = audiobook.id;

      const credits = await db
        .select({ role: schema.personCredits.role })
        .from(schema.personCredits)
        .where(
          and(
            eq(schema.personCredits.targetType, "audiobook"),
            eq(schema.personCredits.targetId, id),
          ),
        );
      const roles = credits.map((c) => c.role);
      expect(roles).toContain("author");
      expect(roles).toContain("narrator");

      const narratorRow = await db.query.audiobookNarrators.findFirst({
        where: eq(schema.audiobookNarrators.audiobookId, id),
      });
      expect(narratorRow?.peopleId).toBeTruthy();
    },
  );
});