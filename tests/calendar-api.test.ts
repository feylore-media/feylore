import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
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

function shortId(): string {
  return randomBytes(3).toString("hex").padStart(6, "0");
}

describe("Calendar API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookie = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-calendar-api-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const userId = generateId();
    const priorUsers = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, "calendar-api@test.local"));
    for (const prior of priorUsers) {
      await db
        .delete(schema.fieldOverrides)
        .where(eq(schema.fieldOverrides.setByUserId, prior.id));
    }
    await db.delete(schema.users).where(eq(schema.users.email, "calendar-api@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "calendar-api@test.local",
      username: "calendarapi",
      displayName: "Calendar API",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });
    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await db.insert(schema.userRoles).values({
        userId,
        roleId: memberRole.id,
      });
    }

    const clubId = generateId();
    const clubReadId = generateId();
    await db.delete(schema.clubs).where(eq(schema.clubs.name, "Calendar Test Club"));
    await db.insert(schema.clubs).values({
      id: clubId,
      ownerUserId: userId,
      name: "Calendar Test Club",
      visibility: "private",
    });
    await db.insert(schema.clubMembers).values({
      clubId,
      userId,
      joinedAt: new Date(),
    });
    await db.insert(schema.clubReads).values({
      id: clubReadId,
      clubId,
      workSubjectType: "book",
      candidateSnapshot: {
        title: "Calendar Club Book",
        authors: ["Feylore Author"],
        genres: [],
        contentWarnings: [],
        providerIdentifiers: {},
        provenance: [],
      },
      status: "scheduled",
      startDate: new Date("2027-03-05T00:00:00.000Z"),
      targetEndDate: new Date("2027-03-30T00:00:00.000Z"),
    });

    const cleanupTargets = [
      { table: schema.books, slug: "calendar-book" },
      { table: schema.audiobooks, slug: "calendar-audiobook" },
      { table: schema.albums, slug: "calendar-album" },
      { table: schema.movies, slug: "calendar-movie" },
      { table: schema.tvShows, slug: "calendar-show" },
      { table: schema.podcastShows, slug: "calendar-podcast" },
    ] as const;
    for (const target of cleanupTargets) {
      await db.delete(target.table).where(eq(target.table.slug, target.slug));
    }

    const bookId = shortId();
    const audiobookId = shortId();
    const albumId = shortId();
    const movieId = shortId();
    const showId = shortId();
    const podcastShowId = shortId();
    const seasonId = generateId();
    const episodeId = shortId();

    await db.insert(schema.books).values({
      id: bookId,
      slug: "calendar-book",
      slugStatus: "canonical",
      title: "Calendar Book",
      description: "Upcoming book",
    });
    await db.insert(schema.metadataRecords).values({
      id: generateId(),
      providerKey: "hardcover",
      subjectType: "book",
      subjectId: bookId,
      payload: { publicationDate: "2027-03-01" },
    });
    await db.insert(schema.fieldOverrides).values({
      id: generateId(),
      subjectType: "book",
      subjectId: bookId,
      field: "publicationDate",
      value: "2027-06-15",
      setByUserId: userId,
    });

    await db.insert(schema.audiobooks).values({
      id: audiobookId,
      slug: "calendar-audiobook",
      slugStatus: "canonical",
      title: "Calendar Audiobook",
    });
    await db.insert(schema.metadataRecords).values({
      id: generateId(),
      providerKey: "audible",
      subjectType: "audiobook",
      subjectId: audiobookId,
      payload: { releaseDate: "2027-09" },
    });

    await db.insert(schema.albums).values({
      id: albumId,
      slug: "calendar-album",
      slugStatus: "canonical",
      title: "Calendar Album",
      releaseDate: "2027-05-20",
    });

    await db.insert(schema.movies).values({
      id: movieId,
      slug: "calendar-movie",
      slugStatus: "canonical",
      title: "Calendar Movie",
      releaseDate: "2027-04-10",
    });

    await db.insert(schema.tvShows).values({
      id: showId,
      slug: "calendar-show",
      slugStatus: "canonical",
      title: "Calendar Show",
      premiereDate: "2026-02-15",
    });
    await db.insert(schema.tvSeasons).values({
      id: seasonId,
      showId,
      seasonNumber: 1,
    });
    await db.insert(schema.tvEpisodes).values({
      id: episodeId,
      showId,
      seasonId,
      episodeNumber: 5,
      title: "Calendar Episode",
      airDate: "2027-06-30",
    });

    await db.insert(schema.podcastShows).values({
      id: podcastShowId,
      slug: "calendar-podcast",
      slugStatus: "canonical",
      title: "Calendar Podcast",
      author: "Calendar Host",
    });
    await db.insert(schema.podcastEpisodes).values({
      id: generateId(),
      showId: podcastShowId,
      slug: "calendar-episode-1",
      title: "Pod Episode",
      guid: `calendar-guid-${podcastShowId}`,
      publishedAt: new Date("2027-07-05T08:00:00.000Z"),
    });
    await db.insert(schema.podcastSubscriptions).values({
      userId,
      showId: podcastShowId,
    });

    await db.insert(schema.libraryMemberships).values([
      { userId, targetType: "book", targetId: bookId },
      { userId, targetType: "audiobook", targetId: audiobookId },
      { userId, targetType: "album", targetId: albumId },
      { userId, targetType: "movie", targetId: movieId },
      { userId, targetType: "show", targetId: showId },
    ]);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { email: "calendar-api@test.local", password: "password123" },
    });
    cookie = login.headers["set-cookie"]?.toString() ?? "";
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("requires authentication", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2027-01-01&to=2027-12-31",
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(401);
  });

  it.skipIf(!dbAvailable)("lists library release events across media", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2027-01-01&to=2027-12-31",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    const events = res.json().data as Array<{
      domain: string;
      kind: string;
      releaseDate: string | null;
      releaseBucket: string | null;
      datePrecision: string;
      status: string;
      reasons: string[];
      startsAt: string | null;
      title: string | null;
    }>;

    const key = (e: { domain: string; releaseDate: string | null; kind: string }) =>
      `${e.domain}:${e.kind}:${e.releaseDate}`;
    const present = new Map(events.map((e) => [key(e), e]));

    expect(present.has("book:release:2027-06-15")).toBe(true);
    expect(present.has("audiobook:release:null")).toBe(true);
    expect(present.has("movie:release:2027-04-10")).toBe(true);
    expect(present.has("music:release:2027-05-20")).toBe(true);
    expect(present.has("tv:episode:2027-06-30")).toBe(true);
    expect(present.has("podcast:episode:2027-07-05")).toBe(true);
    expect(present.has("club:club_read_start:2027-03-05")).toBe(true);

    const book = present.get("book:release:2027-06-15");
    expect(book?.status).toBe("confirmed");
    expect(book?.reasons).toEqual(["library"]);
    expect(book?.title).toBe("Calendar Book");

    const episode = present.get("tv:episode:2027-06-30");
    expect(episode?.title).toBe("Calendar Episode");
  });

  it.skipIf(!dbAvailable)("treats a user override as authoritative over provider payload", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2027-01-01&to=2027-12-31&media=book",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    const events = res.json().data as Array<{ releaseDate: string | null }>;
    expect(events.some((e) => e.releaseDate === "2027-06-15")).toBe(true);
    expect(events.some((e) => e.releaseDate === "2027-03-01")).toBe(false);
  });

  it.skipIf(!dbAvailable)("never fabricates a day for partial dates", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2027-01-01&to=2027-12-31&media=audiobook",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    const events = res.json().data as Array<{
      datePrecision: string;
      releaseDate: string | null;
      releaseBucket: string | null;
      status: string;
      startsAt: string | null;
      releaseWindowLabel: string | null;
    }>;
    expect(events.length).toBe(1);
    const event = events[0];
    expect(event.datePrecision).toBe("month");
    expect(event.releaseDate).toBeNull();
    expect(event.releaseBucket).toBe("2027-09");
    expect(event.status).toBe("tentative");
    expect(event.startsAt).toBeNull();
    expect(event.releaseWindowLabel).toBeNull();
  });

  it.skipIf(!dbAvailable)("filters by media domain", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2027-01-01&to=2027-12-31&media=movie",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    const events = res.json().data as Array<{ domain: string }>;
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.every((e) => e.domain === "movie")).toBe(true);
  });

  it.skipIf(!dbAvailable)("reveals club schedule events for the club source", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2027-01-01&to=2027-12-31&media=&sources=club",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    const events = res.json().data as Array<{
      domain: string;
      kind: string;
      releaseDate: string | null;
      reasons: string[];
    }>;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.domain === "club")).toBe(true);
    expect(events.every((e) => e.reasons.includes("club"))).toBe(true);
    expect(events.some((e) => e.kind === "club_read_start")).toBe(true);
  });

  it.skipIf(!dbAvailable)("omits library events when the source picker excludes them", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2027-01-01&to=2027-12-31&media=&sources=library",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    const events = res.json().data as Array<{ domain: string }>;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.domain !== "club")).toBe(true);
  });

  it.skipIf(!dbAvailable)("round-trips per-user preferences", async () => {
    const payload = {
      view: "month",
      domains: ["book", "movie"],
      sources: ["library"],
    };
    const put = await app.inject({
      method: "PUT",
      url: "/api/v1/calendar/preferences",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload,
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({
      method: "GET",
      url: "/api/v1/calendar/preferences",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data).toEqual(payload);
  });

  it.skipIf(!dbAvailable)("keeps /api/v1/upcoming working (Home compatibility)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/upcoming",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it.skipIf(!dbAvailable)("clamps oversized windows", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/calendar?from=2027-01-01&to=2035-01-01",
      headers: { cookie, origin: "http://localhost:5173" },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });
});