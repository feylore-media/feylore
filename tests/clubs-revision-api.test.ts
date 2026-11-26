import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hash } from "@node-rs/argon2";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { buildApp } from "../src/server/http/app.js";
import { createDb, createPool } from "../src/server/db/client.js";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { ROLE_NAMES } from "../src/shared/permissions.js";

describe("Clubs revision PostgreSQL API", () => {
  let built: Awaited<ReturnType<typeof buildApp>>;
  let owner = "",
    member = "",
    outsider = "",
    memberId = "";
  let clubId = "";
  const fixtureUserIds: string[] = [];
  const prefix = generateId().slice(-12);
  const headers = (cookie: string) => ({
    cookie,
    origin: "http://localhost:5173",
    "content-type": "application/json",
  });
  const request = (
    method: "POST" | "PATCH" | "GET",
    path: string,
    payload?: object,
    cookie = owner,
  ) =>
    built.app.inject({
      method,
      url: `/api/v1/clubs/${clubId}${path}`,
      headers: headers(cookie),
      payload,
    });

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ??
      "postgresql://feylore:feylore@localhost:5432/feylore_test";
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    const pool = createPool(process.env.DATABASE_URL);
    try {
      await migrate(createDb(pool), { migrationsFolder: "./drizzle" });
      await seed(createDb(pool));
    } finally {
      await pool.end();
    }
    built = await buildApp();
    const role = await built.ctx.db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    async function user(name: string) {
      const id = generateId(),
        username = `revision_${name}_${prefix}`;
      fixtureUserIds.push(id);
      await built.ctx.db.insert(schema.users).values({
        id,
        email: `${username}@example.test`,
        username,
        displayName: name,
        passwordHash: await hash("password123"),
      });
      await built.ctx.db.insert(schema.userPreferences).values({ userId: id });
      await built.ctx.db
        .insert(schema.userRoles)
        .values({ userId: id, roleId: role!.id });
      const login = await built.app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: headers(""),
        payload: { email: `${username}@example.test`, password: "password123" },
      });
      expect(login.statusCode).toBe(200);
      return {
        id,
        cookie: login.cookies
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join("; "),
      };
    }
    owner = (await user("owner")).cookie;
    const participant = await user("member");
    member = participant.cookie;
    memberId = participant.id;
    outsider = (await user("outsider")).cookie;
    const created = await built.app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: headers(owner),
      payload: {
        name: "Revision test",
        context: "book",
        visibility: "private",
      },
    });
    expect(created.statusCode).toBe(201);
    clubId = created.json().data.id;
    await built.ctx.db
      .insert(schema.clubMembers)
      .values({ clubId, userId: memberId, role: "member" });
  }, 60000);
  afterAll(async () => {
    if (built) {
      await built.ctx.db
        .delete(schema.clubs)
        .where(eq(schema.clubs.id, clubId));
      if (fixtureUserIds.length)
        await built.ctx.db
          .delete(schema.users)
          .where(inArray(schema.users.id, fixtureUserIds));
      await built.app.close();
    }
  });

  it("keeps rereads distinct, limits active/upcoming reads, and preserves completed history", async () => {
    const body = {
      status: "active",
      candidateSnapshot: { title: "External read", authors: ["Author"] },
    };
    const first = await request("POST", "/reads", body);
    expect(first.statusCode).toBe(201);
    const firstId = first.json().data.id;
    const attempts = await Promise.all([
      request("POST", "/reads", body),
      request("POST", "/reads", body),
    ]);
    expect(attempts.map((response) => response.statusCode)).toEqual([409, 409]);
    expect(
      (await request("PATCH", `/reads/${firstId}`, { status: "completed" }))
        .statusCode,
    ).toBe(200);
    const second = await request("POST", "/reads", body);
    expect(second.statusCode).toBe(201);
    expect(second.json().data.id).not.toBe(firstId);
    expect((await request("GET", `/reads/${firstId}`)).json().data.status).toBe(
      "completed",
    );
    expect(
      (await request("PATCH", `/reads/${firstId}`, { status: "active" }))
        .statusCode,
    ).toBe(422);
    expect(
      (await request("GET", "/reads/current", undefined, outsider)).statusCode,
    ).toBe(403);
    expect((await request("POST", "/reads", body, member)).statusCode).toBe(
      403,
    );
    await request("PATCH", `/reads/${second.json().data.id}`, {
      status: "completed",
    });
  });

  it("enforces nomination allowance under concurrency, owns ballots, and preserves external random results", async () => {
    const create = await request("POST", "/selection-rounds", {
      title: "External draw",
      method: "random_draw",
      nominationLimit: 1,
      nominationEndsAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(create.statusCode).toBe(201);
    const roundId = create.json().data.id,
      path = `/selection-rounds/${roundId}`;
    expect(
      (
        await request("POST", `${path}/transition`, {
          phase: "nominations_open",
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request("PATCH", path, { nominationLimit: 9 })).statusCode,
    ).toBe(409);
    expect(
      (
        await request("PATCH", path, {
          nominationEndsAt: new Date(Date.now() + 172800000).toISOString(),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request("PATCH", path, {
          nominationEndsAt: new Date(Date.now() + 86400000).toISOString(),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(
          "POST",
          path + "/nominations",
          { snapshot: { title: "Missing author", authors: [] } },
          member,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await request("GET", "/overview", undefined, member)).json().data
        .selection,
    ).toMatchObject({
      id: roundId,
      phase: "nominations_open",
      method: "random_draw",
      remainingNominations: 1,
      candidateCount: 0,
    });
    const attempts = await Promise.all(
      ["One", "Two"].map((title) =>
        request(
          "POST",
          `${path}/nominations`,
          { snapshot: { title, authors: ["Author"] } },
          member,
        ),
      ),
    );
    expect(attempts.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    const id = attempts.find((response) => response.statusCode === 201)!.json()
      .data.id;
    expect(
      (
        await request(
          "POST",
          `${path}/transition`,
          { phase: "nominations_closed" },
          member,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request("POST", `${path}/transition`, {
          phase: "nominations_closed",
        })
      ).statusCode,
    ).toBe(200);
    const first = await request("POST", `${path}/finalize`, {});
    expect(first.statusCode).toBe(200);
    const result = first.json().data;
    expect(result.eligibleIds).toEqual([id]);
    expect(result.winnerId).toBe(id);
    expect((await request("POST", `${path}/finalize`, {})).json().data).toEqual(
      result,
    );
    const read = (await request("GET", `/reads/${result.clubReadId}`)).json()
      .data;
    expect(read.workSubjectId).toBeNull();
    expect(read.candidateSnapshot.title).toMatch(/One|Two/);
    expect(read.selectionRoundId).toBe(roundId);
    expect(read.status).toBe("scheduled");
    const ballots = await built.ctx.db
      .select()
      .from(schema.clubSelectionBallots)
      .where(eq(schema.clubSelectionBallots.roundId, roundId));
    expect(ballots).toHaveLength(0);
    await request("PATCH", `/reads/${result.clubReadId}`, {
      status: "cancelled",
    });
  });

  it("uses authenticated ballot ownership and rejects closed deadlines and foreign candidates", async () => {
    const create = await request("POST", "/selection-rounds", {
      title: "Vote",
      method: "ranked_choice",
    });
    const roundId = create.json().data.id,
      path = `/selection-rounds/${roundId}`;
    await request("POST", `${path}/transition`, { phase: "nominations_open" });
    const candidate = await request(
      "POST",
      `${path}/nominations`,
      { snapshot: { title: "A book", authors: ["Writer"] } },
      member,
    );
    const id = candidate.json().data.id;
    await request("POST", `${path}/transition`, {
      phase: "nominations_closed",
    });
    await request("POST", `${path}/transition`, { phase: "voting_open" });
    expect(
      (
        await request(
          "POST",
          `${path}/ballot`,
          { ranking: [generateId()] },
          member,
        )
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await request(
          "POST",
          `${path}/ballot`,
          { ranking: [id], userId: generateId() },
          member,
        )
      ).statusCode,
    ).toBe(200);
    const ballot = await built.ctx.db.query.clubSelectionBallots.findFirst({
      where: and(
        eq(schema.clubSelectionBallots.roundId, roundId),
        eq(schema.clubSelectionBallots.userId, memberId),
      ),
    });
    expect(ballot?.ranking).toEqual([id]);
    expect((await request("GET", path)).json().data.viewerBallot).toEqual([]);
    expect((await request("GET", path, undefined, outsider)).statusCode).toBe(
      403,
    );
    expect((await request("POST", `${path}/close-voting`, {})).statusCode).toBe(
      200,
    );
    const closedExperience = await request(
      "GET",
      `/selection-rounds/experience?roundId=${roundId}`,
      undefined,
      member,
    );
    expect(closedExperience.statusCode, closedExperience.body).toBe(200);
    expect(closedExperience.json().data.canVote).toBe(false);
    expect(
      (await request("POST", `${path}/ballot`, { ranking: [id] }, member))
        .statusCode,
    ).toBe(409);
    const finalized = await request("POST", `${path}/finalize`, {});
    expect(finalized.statusCode).toBe(200);
    expect(finalized.json().data.rounds).toHaveLength(1);
    await request("PATCH", `/reads/${finalized.json().data.clubReadId}`, {
      status: "cancelled",
    });
  });

  it("projects bounded candidate snapshots, canonical search and hidden persisted pools", async () => {
    const nominationTitle = `Canonical Nomination Search ${prefix}`;
    const book = await built.app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: headers(owner),
      payload: {
        title: nominationTitle,
        authors: ["Snapshot Author"],
      },
    });
    const bookId = book.json().data.id;
    await built.ctx.db
      .insert(schema.bookGenres)
      .values({ id: generateId(), bookId, name: "Speculative" });
    const created = await request("POST", "/selection-rounds", {
      title: "Candidate projection",
      method: "random_draw",
      nominationLimit: 3,
      configuration: { resultVisibility: "after_completion" },
    });
    const roundId = created.json().data.id,
      path = `/selection-rounds/${roundId}`;
    await request("POST", path + "/transition", { phase: "nominations_open" });
    const search = await request(
      "GET",
      `/selection-candidates/search?q=${encodeURIComponent(nominationTitle)}`,
      undefined,
      member,
    );
    expect(search.statusCode, search.body).toBe(200);
    expect(
      search.json().data.some((item: { id: string }) => item.id === bookId),
    ).toBe(true);
    const canonical = await request(
      "POST",
      path + "/nominations",
      { workSubjectId: bookId, reason: "Stored reason" },
      member,
    );
    expect(canonical.statusCode, canonical.body).toBe(201);
    const external = await request(
      "POST",
      path + "/nominations",
      {
        snapshot: {
          title: "Outside the library",
          authors: ["External Author"],
          contentWarnings: [
            { code: "violence", provenance: { source: "user" } },
          ],
        },
        reason: "External reason",
      },
      member,
    );
    expect(external.statusCode).toBe(201);
    await built.ctx.db
      .update(schema.books)
      .set({ title: "Changed canonical title" })
      .where(eq(schema.books.id, bookId));
    const detail = await request(
      "GET",
      `${path}/candidates/${canonical.json().data.id}`,
      undefined,
      member,
    );
    expect(detail.json().data).toMatchObject({
      availableToRead: false,
      snapshot: {
        title: expect.stringContaining("Canonical Nomination"),
        genres: ["Speculative"],
      },
      nominators: [{ reason: "Stored reason" }],
    });
    expect(detail.json().data.readerHref).toBeNull();
    const externalDetail = await request(
      "GET",
      `${path}/candidates/${external.json().data.id}`,
      undefined,
      member,
    );
    expect(externalDetail.body).toContain("External Author");
    expect(externalDetail.body).toContain(memberId);
    const extras = Array.from({ length: 25 }, (_, index) => ({
      id: generateId(),
      roundId,
      workSubjectType: "book" as const,
      snapshot: {
        title: "Candidate " + index,
        authors: ["Author"],
        genres: [],
        contentWarnings: [],
        providerIdentifiers: {},
        provenance: [],
      },
    }));
    await built.ctx.db.insert(schema.clubSelectionCandidates).values(extras);
    const first = (
      await request(
        "GET",
        `/selection-rounds/experience?roundId=${roundId}`,
        undefined,
        member,
      )
    ).json().data;
    expect(first.candidates).toHaveLength(24);
    expect(first.nextCursor).toBeTruthy();
    expect(first.candidateCount).toBe(27);
    expect(
      (
        await request(
          "GET",
          `/selection-rounds/experience?roundId=${roundId}`,
          undefined,
          outsider,
        )
      ).statusCode,
    ).toBe(403);
    await request("POST", path + "/transition", {
      phase: "nominations_closed",
    });
    expect(
      (await request("GET", path + "/audit", undefined, member)).statusCode,
    ).toBe(403);
    const result = (await request("POST", path + "/finalize", {})).json().data;
    const repeated = (await request("POST", path + "/finalize", {})).json()
      .data;
    expect(repeated).toEqual(result);
    const audit = (
      await request("GET", path + "/audit", undefined, member)
    ).json().data;
    expect(audit.eligibleCount).toBe(27);
    expect(audit.eligibleIds).toBeUndefined();
    const pool = (
      await request("GET", path + "/pool", undefined, member)
    ).json().data;
    expect(pool.candidates).toHaveLength(24);
    expect(pool.nextCursor).toBeTruthy();
    await request("PATCH", `/reads/${result.clubReadId}`, {
      status: "cancelled",
    });
    await built.ctx.db.delete(schema.books).where(eq(schema.books.id, bookId));
  });

  it("keeps legacy Current Work mutations consistent and preserves rereads through the same association", async () => {
    const book = await built.app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: headers(owner),
      payload: { title: "Reread bridge", authors: ["Author"] },
    });
    expect(book.statusCode).toBe(201);
    const bookId = book.json().data.id;
    await built.ctx.userState.setReadingProgress(memberId, "book", bookId, {
      type: "epub-cfi",
      title: "Chapter 3",
      totalProgression: 0.25,
    });
    const personalProgress = await built.ctx.userState.getProgress(
      memberId,
      "book",
      bookId,
    );
    const work = await request("POST", "/works", {
      workSubjectType: "book",
      workSubjectId: bookId,
      status: "current",
    });
    expect(work.statusCode).toBe(201);
    const workId = work.json().data.id;
    const first = (await request("GET", "/reads/current")).json().data;
    expect(first.workSubjectId).toBe(bookId);
    expect(first.legacyClubWorkId).toBe(workId);
    expect(
      (await request("PATCH", `/works/${workId}`, { status: "completed" }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request("GET", `/reads/${first.id}`)).json().data.status,
    ).toBe("completed");
    expect(
      (await request("PATCH", `/works/${workId}`, { status: "current" }))
        .statusCode,
    ).toBe(200);
    const second = (await request("GET", "/reads/current")).json().data;
    expect(second.id).not.toBe(first.id);
    expect(second.legacyClubWorkId).toBe(workId);
    expect(
      (await request("PATCH", `/reads/${second.id}`, { status: "completed" }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/works"))
        .json()
        .data.find((item: { id: string }) => item.id === workId).status,
    ).toBe("completed");
    expect(
      await built.ctx.userState.getProgress(memberId, "book", bookId),
    ).toEqual(personalProgress);
  });

  it("links read schedules, occurrences and generated topics while allowing club-wide schedules", async () => {
    const read = await request("POST", "/reads", {
      status: "active",
      candidateSnapshot: {
        title: "Scheduled external read",
        authors: ["Author"],
      },
    });
    const readId = read.json().data.id;
    const body = {
      title: "Check-in",
      frequency: "once",
      startsAt: "2026-01-01T00:00:00.000Z",
      timeOfDay: "00:00",
      consumption: { kind: "chapter", start: 1 },
      autoCreateTopic: true,
      topicTiming: "immediate",
    };
    const schedule = await request("POST", "/schedules", {
      ...body,
      clubReadId: readId,
    });
    expect(schedule.statusCode).toBe(201);
    const occurrence =
      await built.ctx.db.query.clubScheduleOccurrences.findFirst({
        where: eq(
          schema.clubScheduleOccurrences.scheduleId,
          schedule.json().data.id,
        ),
      });
    expect(occurrence?.clubReadId).toBe(readId);
    await built.ctx.clubSchedules.runScheduleTick();
    const topic = await built.ctx.db.query.clubTopics.findFirst({
      where: eq(schema.clubTopics.scheduleOccurrenceId, occurrence!.id),
    });
    expect(topic?.clubReadId).toBe(readId);
    await built.ctx.db
      .update(schema.clubScheduleOccurrences)
      .set({ status: "open", opensAt: new Date(Date.now() - 60000) })
      .where(eq(schema.clubScheduleOccurrences.id, occurrence!.id));
    const check = await request(
      "POST",
      `/reads/${readId}/check-in`,
      { checkedIn: true },
      member,
    );
    expect(check.statusCode).toBe(200);
    const checked = (
      await request("GET", `/reads/${readId}/experience`, undefined, member)
    ).json().data;
    expect(checked.viewerCheckedIn).toBe(true);
    expect(checked.viewerProgress).toBeNull();
    expect(
      (
        await request(
          "POST",
          `/reads/${readId}/check-in`,
          { checkedIn: false },
          outsider,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          "POST",
          `/reads/${readId}/check-in`,
          { checkedIn: false },
          member,
        )
      ).statusCode,
    ).toBe(200);
    const general = await request("POST", "/schedules", {
      ...body,
      autoCreateTopic: false,
    });
    expect(general.statusCode).toBe(201);
    const generalRow = await built.ctx.db.query.clubSchedules.findFirst({
      where: eq(schema.clubSchedules.id, general.json().data.id),
    });
    expect(generalRow?.clubReadId).toBeNull();
    expect(
      (
        await request("POST", "/schedules", {
          ...body,
          clubReadId: generateId(),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await request("PATCH", `/reads/${readId}`, { status: "completed" }))
        .statusCode,
    ).toBe(200);
    expect(
      (await request("POST", "/schedules", { ...body, clubReadId: readId }))
        .statusCode,
    ).toBe(422);
  });

  it("persists an auditable tied poll and starts a separate runoff with fresh ballots", async () => {
    const round = await request("POST", "/selection-rounds", {
      title: "Tie",
      method: "simple_poll",
      configuration: { tieBehavior: "runoff" },
    });
    const id = round.json().data.id,
      path = `/selection-rounds/${id}`;
    await request("POST", `${path}/transition`, { phase: "nominations_open" });
    const one = (
      await request("POST", `${path}/nominations`, {
        snapshot: { title: "First", authors: ["Writer"] },
      })
    ).json().data.id;
    const two = (
      await request(
        "POST",
        `${path}/nominations`,
        { snapshot: { title: "Second", authors: ["Writer"] } },
        member,
      )
    ).json().data.id;
    await request("POST", `${path}/transition`, {
      phase: "nominations_closed",
    });
    await request("POST", `${path}/transition`, { phase: "voting_open" });
    await request("POST", `${path}/ballot`, { ranking: [one] });
    await request("POST", `${path}/ballot`, { ranking: [two] }, member);
    const finalized = await request("POST", `${path}/finalize`, {});
    expect(finalized.statusCode).toBe(200);
    const result = finalized.json().data;
    expect(result.winnerId).toBeNull();
    expect(result.tiedIds).toHaveLength(2);
    expect(result.runoffRoundId).toBeTruthy();
    const runoff = (
      await request("GET", `/selection-rounds/${result.runoffRoundId}`)
    ).json().data;
    expect(runoff.phase).toBe("voting_open");
    expect(runoff.votedCount).toBe(0);
    expect(runoff.candidates).toHaveLength(2);
    const runoffExperience = (
      await request(
        "GET",
        `/selection-rounds/experience?roundId=${result.runoffRoundId}`,
        undefined,
        member,
      )
    ).json().data;
    expect(runoffExperience.parentRoundId).toBe(id);
    expect(runoffExperience.viewerBallot).toEqual([]);
    expect(
      (await request("GET", "/selection-rounds/current")).json().data.id,
    ).toBe(result.runoffRoundId);
    expect((await request("POST", `${path}/finalize`, {})).json().data).toEqual(
      result,
    );
    await request(
      "POST",
      `/selection-rounds/${result.runoffRoundId}/transition`,
      { phase: "cancelled" },
    );
  });
  it("projects external reads safely and preserves separate historical occurrences", async () => {
    const create = await request("POST", "/reads", {
      candidateSnapshot: {
        title: "External physical book",
        authors: ["Writer"],
      },
      status: "active",
    });
    expect(create.statusCode).toBe(201);
    const readId = create.json().data.id;
    const topicId = generateId(),
      quoteId = generateId();
    await built.ctx.db.insert(schema.clubTopics).values({
      id: topicId,
      clubId,
      clubReadId: readId,
      authorUserId: memberId,
      kind: "discussion",
      title: "SECRET TITLE",
      body: "SECRET BODY",
      mediaLocation: {
        kind: "chapter",
        position: 8,
        reference: "SECRET CHAPTER",
      },
      spoilerBoundary: { kind: "chapter", position: 8 },
    });
    await built.ctx.db.insert(schema.clubQuotes).values({
      id: quoteId,
      clubId,
      clubReadId: readId,
      authorUserId: memberId,
      workSubjectType: "book",
      workSubjectId: "external",
      text: "SECRET PASSAGE",
      mediaLocation: {
        kind: "chapter",
        position: 8,
        reference: "SECRET LABEL",
      },
      spoilerBoundary: { kind: "chapter", position: 8 },
    });
    const overview = await request("GET", "/overview", undefined, member);
    expect(overview.statusCode).toBe(200);
    const data = overview.json().data;
    expect(data.activeRead.snapshot.title).toBe("External physical book");
    expect(data.activeRead.readerHref).toBeNull();
    expect(data.activeRead.workHref).toBeNull();
    expect(data.activeRead.discussions[0]).toMatchObject({
      locked: true,
      text: null,
      label: "chapter 8",
    });
    expect(data.activeRead.journal[0]).toMatchObject({
      locked: true,
      text: null,
    });
    expect(overview.body).not.toContain("SECRET");
    expect(
      (await request("GET", `/reads/${readId}/experience`, undefined, outsider))
        .statusCode,
    ).toBe(403);
    await request("PATCH", `/reads/${readId}`, { status: "completed" });
    await built.ctx.db
      .update(schema.clubReads)
      .set({ completedAt: null, startDate: null, targetEndDate: null })
      .where(eq(schema.clubReads.id, readId));
    const reread = await request("POST", "/reads", {
      candidateSnapshot: {
        title: "External physical book",
        authors: ["Writer"],
      },
      status: "active",
    });
    expect(reread.statusCode).toBe(201);
    await request("PATCH", `/reads/${reread.json().data.id}`, {
      status: "completed",
    });
    const library = (await request("GET", "/library")).json().data.reads;
    expect(
      library.filter(
        (r: { snapshot: { title: string } }) =>
          r.snapshot.title === "External physical book",
      ),
    ).toHaveLength(2);
    expect(
      library.find((r: { read: { id: string } }) => r.read.id === readId).read
        .completedAt,
    ).toBeNull();
    const empty = (await request("GET", "/overview")).json().data;
    expect(empty.activeRead).toBeNull();
    expect(empty.lastRead.read.id).toBe(reread.json().data.id);
    expect(
      (await request("GET", `/reads/${readId}/experience`, undefined, outsider))
        .statusCode,
    ).toBe(403);
  });
  it("projects canonical progress and derives completed ratings without changing user records", async () => {
    const book = await built.app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: headers(owner),
      payload: { title: "Projection canonical", authors: ["Author"] },
    });
    expect(book.statusCode).toBe(201);
    const bookId = book.json().data.id;
    const created = await request("POST", "/reads", {
      workSubjectType: "book",
      workSubjectId: bookId,
      status: "active",
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id;
    await built.ctx.userState.setReadingProgress(memberId, "book", bookId, {
      type: "epub-cfi",
      title: "Chapter 3",
      totalProgression: 0.25,
    });
    const memberPresence = (await request("GET", "/members/experience"))
      .json()
      .data.members.find(
        (person: { userId: string }) => person.userId === memberId,
      );
    expect(memberPresence.progress).toMatchObject({
      state: "reading",
      percent: 25,
      chapter: 3,
    });
    expect(memberPresence.checkIn).toBeNull();
    await built.ctx.db.insert(schema.clubQuotes).values({
      id: generateId(),
      clubId,
      clubReadId: id,
      authorUserId: memberId,
      workSubjectType: "book",
      workSubjectId: bookId,
      text: "Safe shared passage",
      spoilerBoundary: { kind: "chapter", progression: 0.2 },
    });
    const data = (await request("GET", "/overview", undefined, member)).json()
      .data;
    expect(data.activeRead.progressPercent).toBe(25);
    expect(data.activeRead.progressLabel).toBe("Chapter 3");
    expect(data.activeRead.viewerCheckedIn).toBe(false);
    expect(data.activeRead.journal[0].text).toBe("Safe shared passage");
    await built.ctx.userState.createAnnotation(memberId, "book", bookId, {
      locator: { type: "epub-cfi", totalProgression: 0.1 },
      highlightText: "PRIVATE JOURNAL SECRET",
    });
    expect(
      (await request("GET", "/overview", undefined, member)).body,
    ).not.toContain("PRIVATE JOURNAL SECRET");
    await built.ctx.db.insert(schema.userRatings).values({
      userId: memberId,
      subjectType: "book",
      subjectId: bookId,
      rating: 4,
    });
    await request("PATCH", `/reads/${id}`, { status: "completed" });
    const detail = await request(
      "GET",
      `/reads/${id}/experience`,
      undefined,
      member,
    );
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.averageRating).toBe(4);
    const ownerId = fixtureUserIds[0]!;
    await built.ctx.db.insert(schema.clubQuotes).values({
      id: generateId(),
      clubId,
      clubReadId: id,
      authorUserId: ownerId,
      workSubjectType: "book",
      workSubjectId: bookId,
      text: "Shared general passage",
      spoilerBoundary: { kind: "general" },
    });
    await built.ctx.db.insert(schema.bookReviews).values([
      {
        id: generateId(),
        userId: memberId,
        bookId,
        status: "completed",
        finalRating: 4,
        recommendation: "yes",
        coreValues: { story: 4 },
        trajectory: [
          { progress: 0, rating: 2 },
          { progress: 1, rating: 4 },
        ],
        summary: "PRIVATE REVIEW SECRET",
      },
      {
        id: generateId(),
        userId: ownerId,
        bookId,
        status: "completed",
        finalRating: 2,
        recommendation: "no",
        coreValues: { story: 2 },
        trajectory: [
          { progress: 0, rating: 4 },
          { progress: 1, rating: 2 },
        ],
      },
      {
        id: generateId(),
        userId: fixtureUserIds[2]!,
        bookId,
        status: "completed",
        finalRating: 1,
        recommendation: "yes",
      },
    ]);
    const aggregate = await request(
      "GET",
      `/reads/${id}/experience`,
      undefined,
      member,
    );
    expect(aggregate.json().data).toMatchObject({
      averageRating: 3,
      ratingCount: 2,
      recommendations: 1,
      rating: {
        coreValues: { story: 3 },
        trajectory: [
          { progress: 0, rating: 3 },
          { progress: 1, rating: 3 },
        ],
      },
    });
    expect(aggregate.body).not.toContain("PRIVATE REVIEW SECRET");
    const clubStats = (await request("GET", "/stats")).json().data;
    expect(clubStats.ratings.count).toBeGreaterThanOrEqual(2);
    expect(clubStats.recommendations.yes).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(clubStats)).not.toContain("PRIVATE REVIEW SECRET");
    expect(
      (
        await built.ctx.db.query.bookReviews.findFirst({
          where: eq(schema.bookReviews.userId, memberId),
        })
      )?.finalRating,
    ).toBe(4);
    expect(
      (await built.ctx.userState.getProgress(memberId, "book", bookId))
        ?.locator,
    ).toMatchObject({ totalProgression: 0.25 });
  });

  it("copies defaults, recovers missed selection phases, and projects private upcoming dates", async () => {
    const created = await built.app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: headers(owner),
      payload: {
        name: `Upcoming ${prefix}`,
        context: "book",
        visibility: "private",
      },
    });
    const localClubId = created.json().data.id as string;
    const call = (
      method: "GET" | "POST" | "PATCH",
      path: string,
      payload?: object,
      cookie = owner,
    ) =>
      built.app.inject({
        method,
        url: `/api/v1/clubs/${localClubId}${path}`,
        headers: headers(cookie),
        payload,
      });
    try {
      expect(
        (
          await call("PATCH", "/defaults", {
            selection: {
              nominationDays: 2,
              votingDays: 3,
              nominationLimit: 4,
              method: "simple_poll",
              configuration: {
                tieBehavior: "moderator",
                resultVisibility: "after_completion",
                excludePreviouslyRead: true,
              },
            },
            reading: { durationDays: 14 },
          })
        ).statusCode,
      ).toBe(200);
      await built.ctx.db
        .insert(schema.clubMembers)
        .values({ clubId: localClubId, userId: memberId, role: "member" });
      expect(
        (await call("GET", "", undefined, member)).json().data
          .selectionDefaults,
      ).toBeUndefined();
      expect(
        (
          await call(
            "PATCH",
            "/defaults",
            { reading: { durationDays: 10 } },
            member,
          )
        ).statusCode,
      ).toBe(403);
      await built.ctx.db
        .update(schema.clubMembers)
        .set({ role: "moderator" })
        .where(
          and(
            eq(schema.clubMembers.clubId, localClubId),
            eq(schema.clubMembers.userId, memberId),
          ),
        );
      expect(
        (
          await call(
            "PATCH",
            "/defaults",
            { reading: { durationDays: 14 } },
            member,
          )
        ).statusCode,
      ).toBe(200);
      await built.ctx.db
        .update(schema.clubMembers)
        .set({ role: "member" })
        .where(
          and(
            eq(schema.clubMembers.clubId, localClubId),
            eq(schema.clubMembers.userId, memberId),
          ),
        );
      const clubOwner = (await built.ctx.db.query.clubs.findFirst({
        where: eq(schema.clubs.id, localClubId),
      }))!.ownerUserId;
      const legacyId = generateId();
      await built.ctx.db.insert(schema.clubPolls).values({
        id: legacyId,
        clubId: localClubId,
        title: "Old poll",
        status: "active",
        createdByUserId: clubOwner,
      });
      expect(
        (
          await call("POST", "/selection-rounds", {
            title: "Blocked by legacy poll",
          })
        ).statusCode,
      ).toBe(409);
      await built.ctx.db
        .delete(schema.clubPolls)
        .where(eq(schema.clubPolls.id, legacyId));
      const roundResponse = await call("POST", "/selection-rounds", {
        title: "Next read",
      });
      expect(roundResponse.statusCode, roundResponse.body).toBe(201);
      const roundId = roundResponse.json().data.id as string;
      await built.ctx.db.insert(schema.clubPolls).values({
        id: legacyId,
        clubId: localClubId,
        title: "Old draft",
        status: "draft",
        createdByUserId: clubOwner,
      });
      expect(
        (await call("POST", `/polls/${legacyId}/publish`, {})).statusCode,
      ).toBe(409);
      await built.ctx.db
        .delete(schema.clubPolls)
        .where(eq(schema.clubPolls.id, legacyId));
      const original = await built.ctx.db.query.clubSelectionRounds.findFirst({
        where: eq(schema.clubSelectionRounds.id, roundId),
      });
      expect(original).toMatchObject({
        method: "simple_poll",
        nominationLimit: 4,
        configuration: { excludePreviouslyRead: true },
      });
      expect(
        (original!.nominationEndsAt!.getTime() -
          original!.nominationStartsAt!.getTime()) /
          86400000,
      ).toBe(2);
      expect(
        (
          await call("POST", `/selection-rounds/${roundId}/transition`, {
            phase: "nominations_open",
          })
        ).statusCode,
      ).toBe(200);
      await call("PATCH", "/defaults", {
        selection: {
          nominationDays: 5,
          votingDays: 5,
          nominationLimit: 1,
          method: "ranked_choice",
          configuration: {
            tieBehavior: "runoff",
            resultVisibility: "during_voting",
            excludePreviouslyRead: false,
          },
        },
      });
      expect(
        (
          await built.ctx.db.query.clubSelectionRounds.findFirst({
            where: eq(schema.clubSelectionRounds.id, roundId),
          })
        )?.nominationLimit,
      ).toBe(4);
      const start = new Date(Date.now() + 3 * 86400000).toISOString();
      const read = await call("POST", "/reads", {
        status: "scheduled",
        startDate: start,
        candidateSnapshot: {
          title: "External planned read",
          authors: ["Writer"],
        },
      });
      expect(read.statusCode, read.body).toBe(201);
      const readId = read.json().data.id as string;
      expect(
        (await call("GET", `/reads/${readId}`)).json().data.targetEndDate,
      ).toBe(new Date(new Date(start).getTime() + 14 * 86400000).toISOString());
      const discussion = await call("POST", "/schedules", {
        clubReadId: readId,
        title: "Wrap-up",
        eventKind: "final_discussion",
        frequency: "once",
        startsAt: new Date(Date.now() + 6 * 86400000).toISOString(),
        consumption: { kind: "custom", label: "Final discussion" },
      });
      expect(discussion.statusCode, discussion.body).toBe(201);
      const upcoming = async (cookie: string) =>
        (
          await built.app.inject({
            method: "GET",
            url: "/api/v1/upcoming",
            headers: headers(cookie),
          })
        ).json().data as { id: string; startsAt: string }[];
      const first = (await upcoming(owner)).find(
        (event) => event.id === `club_read_start:${readId}`,
      );
      expect(first?.startsAt).toBe(start);
      expect(
        (await upcoming(member)).some((event) => event.id === first?.id),
      ).toBe(true);
      expect(
        (await upcoming(owner)).some((event) =>
          event.id.startsWith("club_final_discussion:"),
        ),
      ).toBe(true);
      expect(
        (await upcoming(outsider)).some((event) => event.id === first?.id),
      ).toBe(false);
      const moved = new Date(Date.now() + 4 * 86400000).toISOString();
      await call("PATCH", `/reads/${readId}`, { startDate: moved });
      const second = (await upcoming(owner)).find(
        (event) => event.id === first?.id,
      );
      expect(second?.startsAt).toBe(moved);
      await built.ctx.db
        .delete(schema.clubMembers)
        .where(
          and(
            eq(schema.clubMembers.clubId, localClubId),
            eq(schema.clubMembers.userId, memberId),
          ),
        );
      expect(
        (await upcoming(member)).some((event) => event.id === first?.id),
      ).toBe(false);
      expect(
        (await call("GET", "/overview"))
          .json()
          .data.upcoming.some(
            (event: { id: string }) => event.id === first?.id,
          ),
      ).toBe(true);
      await call("PATCH", `/reads/${readId}`, { status: "cancelled" });
      expect(
        (await upcoming(owner)).some((event) => event.id === first?.id),
      ).toBe(false);
      const candidateId = generateId();
      await built.ctx.db.insert(schema.clubSelectionCandidates).values({
        id: candidateId,
        roundId,
        workSubjectType: "book",
        snapshot: {
          title: "Winner",
          authors: ["Writer"],
          genres: [],
          contentWarnings: [],
          providerIdentifiers: {},
          provenance: [],
        },
      });
      await built.ctx.db
        .insert(schema.clubSelectionBallots)
        .values({ roundId, userId: memberId, ranking: [candidateId] });
      const past = new Date(Date.now() - 86400000);
      await built.ctx.db
        .update(schema.clubSelectionRounds)
        .set({
          nominationStartsAt: past,
          nominationEndsAt: past,
          votingStartsAt: past,
          votingEndsAt: past,
        })
        .where(eq(schema.clubSelectionRounds.id, roundId));
      const sweep = await built.ctx.clubSelection.runTransitionSweep();
      expect(sweep.advanced).toBeGreaterThanOrEqual(3);
      expect(
        (
          await built.ctx.db.query.clubSelectionRounds.findFirst({
            where: eq(schema.clubSelectionRounds.id, roundId),
          })
        )?.phase,
      ).toBe("completed");
      expect(
        (await built.ctx.clubSelection.runTransitionSweep()).advanced,
      ).toBe(0);
      await built.ctx.db.insert(schema.clubPolls).values({
        id: legacyId,
        clubId: localClubId,
        title: "No return to legacy polls",
        status: "draft",
        createdByUserId: clubOwner,
      });
      expect(
        (await call("POST", `/polls/${legacyId}/publish`, {})).statusCode,
      ).toBe(409);
      await built.ctx.db
        .delete(schema.clubPolls)
        .where(eq(schema.clubPolls.id, legacyId));
      await built.ctx.db
        .update(schema.clubReads)
        .set({ status: "cancelled" })
        .where(eq(schema.clubReads.selectionRoundId, roundId));
      const club = await built.ctx.db.query.clubs.findFirst({
        where: eq(schema.clubs.id, localClubId),
      });
      const makeRound = async (
        method: "ranked_choice" | "random_draw" | "simple_poll",
        tieBehavior: "moderator" | "runoff" = "moderator",
      ) => {
        const response = await call("POST", "/selection-rounds", {
          title: `${method} test`,
          method,
          configuration: {
            tieBehavior,
            resultVisibility: "after_completion",
            excludePreviouslyRead: false,
          },
        });
        expect(response.statusCode, response.body).toBe(201);
        const id = response.json().data.id as string;
        if (method === "random_draw") {
          const configured =
            await built.ctx.db.query.clubSelectionRounds.findFirst({
              where: eq(schema.clubSelectionRounds.id, id),
            });
          expect(configured?.votingStartsAt).toBeNull();
          expect(configured?.votingEndsAt).toBeNull();
        }
        const candidates = [generateId(), generateId()];
        await built.ctx.db.insert(schema.clubSelectionCandidates).values(
          candidates.map((candidateId, index) => ({
            id: candidateId,
            roundId: id,
            workSubjectType: "book",
            snapshot: {
              title: `Choice ${index}`,
              authors: ["Writer"],
              genres: [],
              contentWarnings: [],
              providerIdentifiers: {},
              provenance: [],
            },
          })),
        );
        await built.ctx.db
          .update(schema.clubSelectionRounds)
          .set({
            nominationStartsAt: past,
            nominationEndsAt: past,
            votingStartsAt: past,
            votingEndsAt: past,
          })
          .where(eq(schema.clubSelectionRounds.id, id));
        return { id, candidates };
      };
      const ranked = await makeRound("ranked_choice");
      await built.ctx.db.insert(schema.clubSelectionBallots).values({
        roundId: ranked.id,
        userId: memberId,
        ranking: ranked.candidates,
      });
      await built.ctx.clubSelection.runTransitionSweep();
      const rankedResult =
        await built.ctx.db.query.clubSelectionRounds.findFirst({
          where: eq(schema.clubSelectionRounds.id, ranked.id),
        });
      expect(rankedResult?.phase).toBe("completed");
      expect(rankedResult?.result?.winnerId).toBe(ranked.candidates[0]);
      await built.ctx.db
        .update(schema.clubReads)
        .set({ status: "cancelled" })
        .where(eq(schema.clubReads.selectionRoundId, ranked.id));
      const draw = await makeRound("random_draw");
      await built.ctx.clubSelection.runTransitionSweep();
      const drawResult = await built.ctx.db.query.clubSelectionRounds.findFirst(
        { where: eq(schema.clubSelectionRounds.id, draw.id) },
      );
      expect(drawResult?.phase).toBe("completed");
      expect(draw.candidates).toContain(drawResult?.result?.winnerId);
      expect(
        (await built.ctx.clubSelection.runTransitionSweep()).advanced,
      ).toBe(0);
      expect(
        (
          await built.ctx.db.query.clubSelectionRounds.findFirst({
            where: eq(schema.clubSelectionRounds.id, draw.id),
          })
        )?.result,
      ).toEqual(drawResult?.result);
      await built.ctx.db
        .update(schema.clubReads)
        .set({ status: "cancelled" })
        .where(eq(schema.clubReads.selectionRoundId, draw.id));
      const tied = await makeRound("simple_poll");
      await built.ctx.db.insert(schema.clubSelectionBallots).values([
        { roundId: tied.id, userId: memberId, ranking: [tied.candidates[0]!] },
        {
          roundId: tied.id,
          userId: club!.ownerUserId,
          ranking: [tied.candidates[1]!],
        },
      ]);
      await built.ctx.clubSelection.runTransitionSweep();
      expect(
        (
          await built.ctx.db.query.clubSelectionRounds.findFirst({
            where: eq(schema.clubSelectionRounds.id, tied.id),
          })
        )?.result?.requiresTieResolution,
      ).toBe(true);
      expect(
        (await built.ctx.clubSelection.runTransitionSweep()).advanced,
      ).toBe(0);
      await call("POST", `/selection-rounds/${tied.id}/transition`, {
        phase: "cancelled",
      });
      const runoff = await makeRound("simple_poll", "runoff");
      await built.ctx.db.insert(schema.clubSelectionBallots).values([
        {
          roundId: runoff.id,
          userId: memberId,
          ranking: [runoff.candidates[0]!],
        },
        {
          roundId: runoff.id,
          userId: club!.ownerUserId,
          ranking: [runoff.candidates[1]!],
        },
      ]);
      await built.ctx.clubSelection.runTransitionSweep();
      const runoffResult =
        await built.ctx.db.query.clubSelectionRounds.findFirst({
          where: eq(schema.clubSelectionRounds.id, runoff.id),
        });
      expect(runoffResult?.phase).toBe("completed");
      expect(runoffResult?.result?.tieResolution).toBe("runoff");
      expect(runoffResult?.result?.runoffRoundId).toBeTruthy();
    } finally {
      await built.ctx.db
        .delete(schema.clubs)
        .where(eq(schema.clubs.id, localClubId));
    }
  });
});
