import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hash } from "@node-rs/argon2";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { buildApp } from "../src/server/http/app.js";
import { createDb, createPool } from "../src/server/db/client.js";
import * as s from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { ROLE_NAMES } from "../src/shared/permissions.js";
import { normalizeVocabularyKey } from "../src/shared/metadata-formatting.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://feylore:feylore@localhost:5432/feylore_test";
const available = await (async () => {
  const pool = createPool(databaseUrl);
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
})();

describe.skipIf(!available)("Club member presence and Stats API", () => {
  let built: Awaited<ReturnType<typeof buildApp>>;
  let clubId = "";
  let historyReadId = "";
  const users: string[] = [];
  const cookies: string[] = [];
  const prefix = generateId().slice(-10);
  const headers = (cookie: string) => ({
    cookie,
    origin: "http://localhost:5173",
    "content-type": "application/json",
  });
  const get = (path: string, cookie = cookies[0]!) =>
    built.app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}${path}`,
      headers: headers(cookie),
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    const pool = createPool(databaseUrl);
    try {
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: "./drizzle" });
      await seed(db);
    } finally {
      await pool.end();
    }
    built = await buildApp();
    const role = await built.ctx.db.query.roles.findFirst({
      where: eq(s.roles.name, ROLE_NAMES.MEMBER),
    });
    for (const [index, name] of ["Owner", "Member", "Outsider"].entries()) {
      const id = generateId(),
        username = `club_presence_${index}_${prefix}`;
      users.push(id);
      await built.ctx.db.insert(s.users).values({
        id,
        email: `${username}@example.test`,
        username,
        displayName: name,
        passwordHash: await hash("password123"),
        profileVisibility: index === 1 ? "private" : "public",
      });
      await built.ctx.db.insert(s.userPreferences).values({ userId: id });
      await built.ctx.db
        .insert(s.userRoles)
        .values({ userId: id, roleId: role!.id });
      const login = await built.app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: headers(""),
        payload: { email: `${username}@example.test`, password: "password123" },
      });
      expect(login.statusCode).toBe(200);
      cookies.push(
        login.cookies
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join("; "),
      );
    }
    const created = await built.app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: headers(cookies[0]!),
      payload: {
        name: "Presence test",
        context: "book",
        visibility: "private",
      },
    });
    expect(created.statusCode).toBe(201);
    clubId = created.json().data.id;
    await built.ctx.db
      .insert(s.clubMembers)
      .values({ clubId, userId: users[1]!, role: "member" });
  }, 60000);

  afterAll(async () => {
    if (!built) return;
    if (clubId)
      await built.ctx.db.delete(s.clubs).where(eq(s.clubs.id, clubId));
    if (users.length)
      await built.ctx.db.delete(s.users).where(inArray(s.users.id, users));
    await built.app.close();
  });

  it("shows current membership and an intentional empty Stats state", async () => {
    const members = await get("/members/experience");
    expect(members.statusCode).toBe(200);
    expect(members.json().data.activeRead).toBeNull();
    expect(
      members
        .json()
        .data.members.map(
          (member: { displayName: string }) => member.displayName,
        ),
    ).toEqual(["Member", "Owner"]);
    const stats = await get("/stats");
    expect(stats.statusCode).toBe(200);
    expect(stats.json().data.summary).toMatchObject({
      reads: 0,
      knownPages: null,
      pageCountKnown: 0,
    });
    expect(stats.json().data.length.median).toBeNull();
  });

  it("keeps external progress unknown, private member progress hidden, and detail authorized", async () => {
    const readId = generateId();
    await built.ctx.db.insert(s.clubReads).values({
      id: readId,
      clubId,
      workSubjectType: "book",
      workSubjectId: null,
      candidateSnapshot: {
        title: "External book",
        authors: ["Writer"],
        genres: [],
        contentWarnings: [],
        providerIdentifiers: {},
        provenance: [],
      },
      status: "active",
    });
    const members = (await get("/members/experience")).json().data;
    expect(members.activeRead.title).toBe("External book");
    expect(
      members.members.find(
        (member: { userId: string }) => member.userId === users[0],
      ).progress.state,
    ).toBe("unknown");
    expect(
      members.members.find(
        (member: { userId: string }) => member.userId === users[1],
      ).progress.state,
    ).toBe("private");
    expect((await get(`/members/${users[1]}/experience`)).statusCode).toBe(200);
    expect(
      (await get(`/members/${users[1]}/experience`, cookies[2])).statusCode,
    ).toBe(403);
    await built.ctx.db.delete(s.clubReads).where(eq(s.clubReads.id, readId));
  });

  it("uses canonical progress before legacy fallback and keeps check-ins separate", async () => {
    const created = await built.app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: headers(cookies[0]!),
      payload: { title: `Presence book ${prefix}`, authors: ["Writer"] },
    });
    expect(created.statusCode).toBe(201);
    const bookId = created.json().data.id as string;
    const readId = generateId();
    const incompleteRep = generateId(),
      completedRep = generateId();
    await built.ctx.db.insert(s.representations).values([
      { id: incompleteRep, format: "epub", domainModule: "books" },
      { id: completedRep, format: "epub", domainModule: "books" },
    ]);
    await built.ctx.db.insert(s.clubReads).values({
      id: readId,
      clubId,
      workSubjectType: "book",
      workSubjectId: bookId,
      candidateSnapshot: {
        title: "Presence book",
        authors: ["Writer"],
        genres: [],
        contentWarnings: [],
        providerIdentifiers: {},
        provenance: [],
      },
      status: "active",
    });
    await built.ctx.userState.setReadingProgress(users[0]!, "book", bookId, {
      type: "epub-cfi",
      title: "Chapter 4: Spoiler title",
      totalProgression: 0.2,
    });
    await built.ctx.userState.setReadingProgress(users[1]!, "book", bookId, {
      type: "epub-cfi",
      title: "Chapter 2",
      totalProgression: 0.1,
    });
    await built.ctx.db.insert(s.readingProgress).values([
      {
        id: generateId(),
        userId: users[1]!,
        representationId: incompleteRep,
        workType: "book",
        workId: bookId,
        locatorJson: {
          kind: "reading",
          type: "epub-cfi",
          title: "Chapter 12: Secret name",
          totalProgression: 0.4,
        },
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: generateId(),
        userId: users[1]!,
        representationId: completedRep,
        workType: "book",
        workId: bookId,
        locatorJson: {
          kind: "reading",
          type: "epub-cfi",
          title: "Final secret",
          totalProgression: 1,
        },
        completedAt: new Date("2026-01-02T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    const ownerView = (await get("/members/experience")).json().data;
    expect(
      ownerView.members.find(
        (person: { userId: string }) => person.userId === users[0],
      ).progress,
    ).toMatchObject({ state: "reading", percent: 20, chapter: 4 });
    expect(
      ownerView.members.find(
        (person: { userId: string }) => person.userId === users[1],
      ).progress.state,
    ).toBe("private");
    expect(JSON.stringify(ownerView)).not.toContain("Spoiler title");
    expect(JSON.stringify(ownerView)).not.toContain("Secret name");
    const memberView = (await get("/members/experience", cookies[1])).json()
      .data;
    expect(
      memberView.members.find(
        (person: { userId: string }) => person.userId === users[1],
      ).progress,
    ).toMatchObject({ state: "reading", percent: 40, chapter: 12 });
    expect(
      memberView.members.every(
        (person: { checkIn: string | null }) => person.checkIn === null,
      ),
    ).toBe(true);
    const oldOccurrence = generateId(),
      currentOccurrence = generateId();
    await built.ctx.db.insert(s.clubScheduleOccurrences).values([
      {
        id: oldOccurrence,
        clubId,
        clubReadId: readId,
        scheduledAt: new Date("2026-01-01T00:00:00Z"),
        opensAt: new Date("2026-01-01T00:00:00Z"),
        consumption: { kind: "chapter", chapter: 2 },
        title: "Earlier check-in",
        status: "open",
      },
      {
        id: currentOccurrence,
        clubId,
        clubReadId: readId,
        scheduledAt: new Date("2026-01-02T00:00:00Z"),
        opensAt: new Date("2026-01-02T00:00:00Z"),
        consumption: { kind: "chapter", chapter: 4 },
        title: "Current check-in",
        status: "open",
      },
    ]);
    await built.ctx.db
      .insert(s.clubOccurrenceCheckIns)
      .values({
        id: generateId(),
        clubId,
        occurrenceId: oldOccurrence,
        userId: users[1]!,
      });
    const oldCheckInView = (await get("/members/experience", cookies[1])).json()
      .data;
    expect(
      oldCheckInView.members.find(
        (person: { userId: string }) => person.userId === users[1],
      ).checkIn,
    ).toBe("not_yet");
    await built.ctx.db
      .insert(s.clubOccurrenceCheckIns)
      .values({
        id: generateId(),
        clubId,
        occurrenceId: currentOccurrence,
        userId: users[1]!,
      });
    const currentCheckInView = (
      await get("/members/experience", cookies[1])
    ).json().data;
    expect(
      currentCheckInView.members.find(
        (person: { userId: string }) => person.userId === users[1],
      ).checkIn,
    ).toBe("caught_up");
    await built.ctx.db
      .delete(s.clubScheduleOccurrences)
      .where(
        inArray(s.clubScheduleOccurrences.id, [
          oldOccurrence,
          currentOccurrence,
        ]),
      );
    await built.ctx.db.delete(s.clubReads).where(eq(s.clubReads.id, readId));
    await built.ctx.db
      .delete(s.representations)
      .where(inArray(s.representations.id, [incompleteRep, completedRep]));
    await built.ctx.db.delete(s.books).where(eq(s.books.id, bookId));
  });

  it("counts rereads, multi-label genres and known pages without turning unknown values into zero", async () => {
    const snapshot = {
      title: "Repeat book",
      authors: ["Writer"],
      genres: ["Fantasy", "Science Fiction"],
      pageCount: 250,
      contentWarnings: [],
      providerIdentifiers: {},
      provenance: [],
    };
    const first = generateId(),
      second = generateId(),
      unknown = generateId();
    historyReadId = first;
    await built.ctx.db.insert(s.clubReads).values([
      {
        id: first,
        clubId,
        workSubjectType: "book",
        workSubjectId: null,
        candidateSnapshot: snapshot,
        status: "completed",
        startDate: new Date("2026-01-01T00:00:00Z"),
        completedAt: new Date("2026-01-31T00:00:00Z"),
      },
      {
        id: second,
        clubId,
        workSubjectType: "book",
        workSubjectId: null,
        candidateSnapshot: snapshot,
        status: "completed",
      },
      {
        id: unknown,
        clubId,
        workSubjectType: "book",
        workSubjectId: null,
        candidateSnapshot: {
          ...snapshot,
          title: "Unknown pages",
          pageCount: undefined,
          genres: [],
        },
        status: "completed",
      },
    ]);
    const stats = (await get("/stats")).json().data;
    expect(stats.summary).toMatchObject({
      reads: 3,
      distinctWorks: 2,
      rereads: 1,
      knownPages: 500,
      pageCountKnown: 2,
    });
    expect(stats.pace).toMatchObject({ datedReads: 1, medianDays: 30 });
    expect(stats.genres).toEqual(
      expect.arrayContaining([
        { name: "Fantasy", reads: 2 },
        { name: "Science Fiction", reads: 2 },
      ]),
    );
  });

  it("resolves genre aliases and includes configured parent terms once per read", async () => {
    const parentId = generateId(),
      childId = generateId(),
      aliasId = generateId(),
      readId = generateId();
    const parentName = `Speculative ${prefix}`,
      childName = `Science Fantasy ${prefix}`,
      aliasName = `Space Fantasy ${prefix}`;
    await built.ctx.db.insert(s.metadataVocabularyTerms).values([
      {
        id: parentId,
        kind: "genre",
        name: parentName,
        normalizedName: normalizeVocabularyKey(parentName),
        slug: `speculative-${prefix}`,
      },
      {
        id: childId,
        kind: "genre",
        name: childName,
        normalizedName: normalizeVocabularyKey(childName),
        slug: `science-fantasy-${prefix}`,
        parentId,
      },
    ]);
    await built.ctx.db.insert(s.metadataVocabularyAliases).values({
      id: aliasId,
      termId: childId,
      kind: "genre",
      alias: aliasName,
      normalizedAlias: normalizeVocabularyKey(aliasName),
    });
    await built.ctx.db.insert(s.clubReads).values({
      id: readId,
      clubId,
      workSubjectType: "book",
      workSubjectId: null,
      status: "completed",
      candidateSnapshot: {
        title: "Aliased genre",
        authors: ["Writer"],
        genres: [aliasName, childName],
        contentWarnings: [],
        providerIdentifiers: {},
        provenance: [],
      },
    });
    const stats = (await get("/stats")).json().data;
    expect(stats.genres).toEqual(
      expect.arrayContaining([
        { name: childName, reads: 1 },
        { name: parentName, reads: 1 },
      ]),
    );
    await built.ctx.db.delete(s.clubReads).where(eq(s.clubReads.id, readId));
    await built.ctx.db
      .delete(s.metadataVocabularyAliases)
      .where(eq(s.metadataVocabularyAliases.id, aliasId));
    await built.ctx.db
      .delete(s.metadataVocabularyTerms)
      .where(eq(s.metadataVocabularyTerms.id, childId));
    await built.ctx.db
      .delete(s.metadataVocabularyTerms)
      .where(eq(s.metadataVocabularyTerms.id, parentId));
  });

  it("uses the same read evidence across Library, wrap-up and Stats while retaining a former participant", async () => {
    await built.ctx.db
      .insert(s.clubMembers)
      .values({ clubId, userId: users[2]!, role: "member" });
    await built.ctx.db.insert(s.clubTopics).values({
      id: generateId(),
      clubId,
      clubReadId: historyReadId,
      authorUserId: users[2]!,
      kind: "discussion",
      title: "Shared during the read",
      body: "A shared thought",
    });
    await built.ctx.db
      .delete(s.clubMembers)
      .where(
        and(
          eq(s.clubMembers.clubId, clubId),
          eq(s.clubMembers.userId, users[2]!),
        ),
      );
    const library = (await get("/library")).json().data;
    const read = library.reads.find(
      (item: { read: { id: string } }) => item.read.id === historyReadId,
    );
    expect(read.participantCount).toBe(1);
    const wrapUp = (await get(`/reads/${historyReadId}/experience`)).json()
      .data;
    expect(wrapUp.participantCount).toBe(1);
    expect(
      wrapUp.participants.some(
        (person: { userId: string }) => person.userId === users[2],
      ),
    ).toBe(true);
    const members = (await get("/members/experience")).json().data;
    expect(
      members.members.some(
        (person: { userId: string }) => person.userId === users[2],
      ),
    ).toBe(false);
    expect((await get(`/members/${users[2]}/experience`)).statusCode).toBe(404);
    const stats = (await get("/stats")).json().data;
    expect(stats.participation.participantOccurrences).toBe(1);
    expect(stats.participation.typicalParticipants).toBe(0);
  });

  it("pages a member's read-specific history without duplicate occurrences", async () => {
    const reads = Array.from({ length: 21 }, (_, index) => ({
      id: generateId(),
      clubId,
      workSubjectType: "book",
      workSubjectId: null,
      status: "completed" as const,
      candidateSnapshot: {
        title: `History ${index}`,
        authors: ["Writer"],
        genres: [],
        contentWarnings: [],
        providerIdentifiers: {},
        provenance: [],
      },
      completedAt: new Date(Date.UTC(2025, 0, index + 1)),
    }));
    await built.ctx.db.insert(s.clubReads).values(reads);
    await built.ctx.db.insert(s.clubTopics).values(
      reads.map((read) => ({
        id: generateId(),
        clubId,
        clubReadId: read.id,
        authorUserId: users[1]!,
        kind: "discussion" as const,
        title: "Read together",
        body: "Shared discussion",
      })),
    );
    const firstResponse = await get(`/members/${users[1]}/experience`);
    expect(firstResponse.statusCode, firstResponse.body).toBe(200);
    const first = firstResponse.json().data;
    expect(first.recentReads).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    const secondResponse = await get(
      `/members/${users[1]}/experience?cursor=${first.nextCursor}`,
    );
    expect(secondResponse.statusCode, secondResponse.body).toBe(200);
    const second = secondResponse.json().data;
    expect(second.recentReads).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set(
        [...first.recentReads, ...second.recentReads].map(
          (read: { id: string }) => read.id,
        ),
      ).size,
    ).toBe(21);
  });
});
