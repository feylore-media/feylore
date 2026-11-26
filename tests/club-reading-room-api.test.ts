import { readingLocatorSchema } from "../src/shared/books.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hash } from "@node-rs/argon2";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { buildApp } from "../src/server/http/app.js";
import { createDb, createPool } from "../src/server/db/client.js";
import * as schema from "../src/server/db/schema.js";
import { seed } from "../src/server/db/seed.js";
import { generateId } from "../src/server/security/crypto.js";
import { ROLE_NAMES } from "../src/shared/permissions.js";

describe("Clubs Reading Room PostgreSQL API", () => {
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
    method: "POST" | "PATCH" | "GET" | "DELETE",
    path: string,
    payload?: object,
    cookie = owner,
  ) =>
    built.app.inject({
      method,
      url: `/api/v1/clubs/${clubId}${path}`,
      headers:
        method === "DELETE"
          ? { cookie, origin: "http://localhost:5173" }
          : headers(cookie),
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

  let bookId = "",
    readId = "",
    safeTopic = "",
    futureTopic = "",
    quoteId = "";
  it("creates member read discussions and keeps General separate", async () => {
    const book = await built.app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: headers(owner),
      payload: { title: "Reading Room canonical", authors: ["Writer"] },
    });
    expect(book.statusCode).toBe(201);
    bookId = book.json().data.id;
    readId = (
      await request("POST", "/reads", {
        workSubjectType: "book",
        workSubjectId: bookId,
        status: "active",
      })
    ).json().data.id;
    await built.ctx.userState.setReadingProgress(memberId, "book", bookId, {
      type: "epub-cfi",
      title: "Chapter 3",
      totalProgression: 0.3,
    });
    await built.ctx.userState.setReadingProgress(
      fixtureUserIds[0]!,
      "book",
      bookId,
      { type: "epub-cfi", title: "Chapter 20", totalProgression: 1 },
    );
    safeTopic = (
      await request(
        "POST",
        "/topics",
        {
          kind: "discussion",
          title: "Safe title",
          body: "Safe body",
          clubReadId: readId,
          mediaLocation: { kind: "chapter", position: 2 },
        },
        member,
      )
    ).json().data.id;
    expect(safeTopic).toBeTruthy();
    futureTopic = (
      await request(
        "POST",
        "/topics",
        {
          kind: "discussion",
          title: "SECRET FUTURE TITLE",
          body: "SECRET FUTURE BODY",
          clubReadId: readId,
          mediaLocation: { kind: "chapter", position: 8 },
        },
        owner,
      )
    ).json().data.id;
    expect(
      (
        await request(
          "POST",
          "/topics",
          { kind: "discussion", title: "General topic", body: "General body" },
          member,
        )
      ).statusCode,
    ).toBe(201);
    const index = await request("GET", "/topics/index", undefined, member);
    expect(index.statusCode).toBe(200);
    expect(index.body).not.toContain("SECRET");
    expect(
      index.json().data.groups.map((g: { label: string }) => g.label),
    ).toEqual(expect.arrayContaining(["General", "chapter 2", "chapter 8"]));
    const detail = await request(
      "GET",
      `/topics/${safeTopic}`,
      undefined,
      member,
    );
    expect(detail.json().data.topic).toMatchObject({
      title: "Safe title",
      body: "Safe body",
      locked: false,
    });
  });
  it("redacts locked direct details, posts, mentions, copied feeds and moderator views", async () => {
    await built.ctx.db.insert(schema.clubPosts).values({
      id: generateId(),
      topicId: futureTopic,
      authorUserId: fixtureUserIds[0]!,
      body: "SECRET REPLY @member",
    });
    for (const path of [
      `/topics/${futureTopic}`,
      "/topics",
      "/feed",
      "/topics/index",
      "/overview",
    ]) {
      const response = await request("GET", path, undefined, member);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("SECRET");
    }
    const locked = (
      await request("GET", `/topics/${futureTopic}`, undefined, member)
    ).json().data;
    expect(locked.topic.locked).toBe(true);
    expect(locked.canReply).toBe(false);
    expect(locked.posts).toEqual([]);
    expect(
      (
        await request(
          "POST",
          `/topics/${futureTopic}/posts`,
          { body: "Reply" },
          member,
        )
      ).statusCode,
    ).toBe(403);
    await built.ctx.userState.setReadingProgress(
      fixtureUserIds[0]!,
      "book",
      bookId,
      { type: "epub-cfi", totalProgression: 0 },
    );
    expect((await request("GET", `/topics/${futureTopic}`)).body).not.toContain(
      "SECRET",
    );
    await built.ctx.userState.setReadingProgress(
      fixtureUserIds[0]!,
      "book",
      bookId,
      { type: "epub-cfi", title: "Chapter 20", totalProgression: 1 },
    );
    expect(
      (await request("GET", `/topics/${futureTopic}`, undefined, outsider))
        .statusCode,
    ).toBe(403);
  });
  it("persists unread state without marking locked discussions as read", async () => {
    const read = (
      await request("GET", "/topics/index?unread=true", undefined, member)
    ).json().data;
    expect(
      read.groups
        .flatMap((g: { topics: { id: string }[] }) => g.topics)
        .some((t: { id: string }) => t.id === safeTopic),
    ).toBe(false);
    expect(
      read.groups
        .flatMap((g: { topics: { id: string }[] }) => g.topics)
        .some((t: { id: string }) => t.id === futureTopic),
    ).toBe(true);
    await request(
      "POST",
      `/topics/${safeTopic}/posts`,
      { body: "New safe reply" },
      owner,
    );
    expect(
      (await request("GET", "/topics/index?unread=true", undefined, member))
        .json()
        .data.groups.flatMap((g: { topics: { id: string }[] }) => g.topics)
        .some((t: { id: string }) => t.id === safeTopic),
    ).toBe(true);
    await request("GET", `/topics/${safeTopic}`, undefined, member);
  });
  it("shares own annotation snapshots, rejects foreign/private sources and keeps snapshot lifecycle explicit", async () => {
    const annotation = await built.ctx.userState.createAnnotation(
      memberId,
      "book",
      bookId,
      {
        locator: {
          type: "epub-cfi",
          totalProgression: 0.2,
          href: "chapter.xhtml",
          cfi: "epubcfi(/6/2)",
        },
        highlightText: "Shared original snapshot",
      },
    );
    quoteId = (
      await request(
        "POST",
        "/quotes",
        { clubReadId: readId, sourceAnnotationId: annotation.id },
        member,
      )
    ).json().data.id;
    expect(quoteId).toBeTruthy();
    const privateItem = await built.ctx.userState.createAnnotation(
      fixtureUserIds[0]!,
      "book",
      bookId,
      {
        locator: { type: "epub-cfi", totalProgression: 0.8 },
        highlightText: "PRIVATE ANNOTATION SECRET",
      },
    );
    expect(
      (
        await request(
          "POST",
          "/quotes",
          { clubReadId: readId, sourceAnnotationId: privateItem.id },
          member,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await request("GET", "/quotes/shareable-annotations", undefined, member))
        .body,
    ).not.toContain("PRIVATE ANNOTATION SECRET");
    await built.ctx.db
      .update(schema.userAnnotations)
      .set({ highlightText: "Edited private value" })
      .where(eq(schema.userAnnotations.id, annotation.id));
    await built.ctx.db
      .delete(schema.userAnnotations)
      .where(eq(schema.userAnnotations.id, annotation.id));
    const response = await request("GET", "/quotes/all", undefined, member);
    expect(response.body).toContain("Shared original snapshot");
    expect(response.body).not.toContain("Edited private value");
    const started = await request(
      "POST",
      "/topics",
      {
        kind: "discussion",
        title: "Passage discussion",
        body: "A reply to the share",
        clubReadId: readId,
        sharedQuoteId: quoteId,
      },
      member,
    );
    expect(started.statusCode).toBe(201);
    expect(
      (await request("DELETE", `/quotes/${quoteId}`, undefined, outsider))
        .statusCode,
    ).toBe(403);
    expect(
      (await request("DELETE", `/quotes/${quoteId}`, undefined, member))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          "GET",
          `/topics/${started.json().data.id}`,
          undefined,
          member,
        )
      ).statusCode,
    ).toBe(200);
  });
  it("locks future shares and enforces final safety even after completion", async () => {
    const shared = await request(
      "POST",
      "/quotes",
      {
        clubReadId: readId,
        text: "SECRET FINAL PASSAGE",
        mediaLocation: { kind: "final" },
      },
      owner,
    );
    expect(shared.statusCode).toBe(201);
    const readerTopic = await request(
      "POST",
      "/topics",
      {
        kind: "discussion",
        title: "Reader location",
        body: "Selection discussion",
        clubReadId: readId,
        readerLocator: {
          type: "epub-cfi",
          href: "chapter.xhtml",
          cfi: "epubcfi(/6/2)",
          totalProgression: 0.2,
        },
      },
      member,
    );
    expect(readerTopic.statusCode).toBe(201);
    const storedReaderTopic = await built.ctx.db.query.clubTopics.findFirst({
      where: eq(schema.clubTopics.id, readerTopic.json().data.id),
    });
    expect(storedReaderTopic?.mediaLocation?.reference).toContain(
      "epubcfi(/6/2)",
    );
    const access = vi
      .spyOn(built.ctx.books, "canReadBook")
      .mockResolvedValue(true);
    try {
      const readerDetail = (
        await request(
          "GET",
          `/topics/${readerTopic.json().data.id}`,
          undefined,
          member,
        )
      ).json().data;
      const jump = new URL(
        readerDetail.readerHref,
        "http://localhost",
      ).searchParams.get("locator");
      expect(readingLocatorSchema.parse(JSON.parse(jump!)).cfi).toBe(
        "epubcfi(/6/2)",
      );
    } finally {
      access.mockRestore();
    }
    expect(
      (await request("GET", "/quotes/all", undefined, member)).body,
    ).not.toContain("SECRET FINAL PASSAGE");
    await request("PATCH", `/reads/${readId}`, { status: "completed" });
    const archived = await request(
      "GET",
      `/topics/index?clubReadId=${readId}`,
      undefined,
      member,
    );
    expect(archived.statusCode).toBe(200);
    expect(archived.body).not.toContain("SECRET");
    expect(archived.json().data.read.status).toBe("completed");
    await built.ctx.db.insert(schema.clubQuotes).values(
      Array.from({ length: 23 }, (_, index) => ({
        id: randomUUID(),
        clubId,
        authorUserId: fixtureUserIds[0]!,
        clubReadId: readId,
        workSubjectType: "book" as const,
        workSubjectId: bookId,
        text: "SECRET HISTORY " + index,
        mediaLocation: { kind: "final" as const },
        spoilerBoundary: { kind: "final" as const },
      })),
    );
    const firstShares = (
      await request(
        "GET",
        `/topics/index?clubReadId=${readId}`,
        undefined,
        member,
      )
    ).json().data;
    expect(firstShares.passages).toHaveLength(20);
    expect(firstShares.nextPassageCursor).toBeTruthy();
    await built.ctx.db
      .insert(schema.clubQuotes)
      .values({
        id: randomUUID(),
        clubId,
        authorUserId: fixtureUserIds[0]!,
        workSubjectType: "book",
        workSubjectId: bookId,
        text: "Legacy club-wide shared snapshot",
        mediaLocation: { kind: "general" },
        spoilerBoundary: { kind: "general" },
      });
    const generalOnly = (
      await request("GET", "/topics/index", undefined, member)
    ).json().data;
    expect(generalOnly.read).toBeNull();
    expect(
      generalOnly.passages.some(
        (item: { label: string; text: string }) =>
          item.label === "General" &&
          item.text === "Legacy club-wide shared snapshot",
      ),
    ).toBe(true);
    const laterShares = await request(
      "GET",
      `/topics/index?clubReadId=${readId}&quoteCursor=${firstShares.nextPassageCursor}`,
      undefined,
      member,
    );
    expect(laterShares.json().data.passages.length).toBeGreaterThan(0);
    expect(
      laterShares
        .json()
        .data.passages.every(
          (item: { id: string }) =>
            !firstShares.passages.some(
              (old: { id: string }) => old.id === item.id,
            ),
        ),
    ).toBe(true);
    expect(laterShares.body).not.toContain("SECRET HISTORY");
  });
  it("supports external percentage/page fallbacks, unknown progress and bounded indexes", async () => {
    const external = (
      await request("POST", "/reads", {
        candidateSnapshot: {
          title: "External physical book",
          authors: ["Writer"],
        },
        status: "active",
      })
    ).json().data.id;
    const beginning = await request(
      "POST",
      "/topics",
      {
        kind: "discussion",
        title: "Beginning safe",
        body: "Introduction",
        clubReadId: external,
        mediaLocation: { kind: "front_matter" },
      },
      member,
    );
    expect(beginning.statusCode).toBe(201);
    expect(
      (
        await request(
          "POST",
          "/topics",
          {
            kind: "discussion",
            title: "Unknown chapter",
            body: "Text",
            clubReadId: external,
            mediaLocation: { kind: "page", position: 20 },
          },
          member,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          "POST",
          "/quotes",
          {
            clubReadId: external,
            text: "External shared snapshot",
            mediaLocation: { kind: "chapter", progression: 0.5 },
          },
          member,
        )
      ).statusCode,
    ).toBe(201);
    const index = await request("GET", "/topics/index", undefined, member);
    expect(index.body).not.toContain("External shared snapshot");
    expect(
      index
        .json()
        .data.groups.flatMap((g: { topics: { id: string }[] }) => g.topics)
        .some((t: { id: string }) => t.id === safeTopic),
    ).toBe(false);
    await built.ctx.db.insert(schema.clubTopics).values(
      Array.from({ length: 60 }, (_, i) => ({
        id: generateId(),
        clubId,
        clubReadId: external,
        authorUserId: memberId,
        kind: "discussion" as const,
        title: "Bulk " + i,
        body: "INDEX BODY SECRET",
        mediaLocation: { kind: "page" as const, position: i + 1 },
        spoilerBoundary: { kind: "page" as const, position: i + 1 },
      })),
    );
    const bounded = await request("GET", "/topics/index", undefined, member);
    expect(bounded.body).not.toContain("SECRET");
    expect(
      bounded
        .json()
        .data.groups.flatMap((g: { topics: unknown[] }) => g.topics),
    ).toHaveLength(50);
    expect(bounded.json().data.nextCursor).toBeTruthy();
    await built.ctx.db
      .delete(schema.clubMembers)
      .where(
        and(
          eq(schema.clubMembers.clubId, clubId),
          eq(schema.clubMembers.userId, memberId),
        ),
      );
    expect(
      (await request("GET", "/topics/index", undefined, member)).statusCode,
    ).toBe(403);
  });
});
