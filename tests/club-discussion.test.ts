import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
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

describe("Club discussion API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let ownerCookie = "";
  let memberCookie = "";
  let outsiderCookie = "";
  let memberId = "";
  let clubId = "";
  let topicId = "";
  let postId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-club-discussion-"),
    );

    pool = createPool(DATABASE_URL);
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    async function setupUser(email: string, username: string) {
      const userId = generateId();
      await db.delete(schema.users).where(eq(schema.users.email, email));
      await db.insert(schema.users).values({
        id: userId,
        email,
        username,
        displayName: username,
        passwordHash: await hash("password123"),
      });
      await db.insert(schema.userPreferences).values({ userId });
      const role = await db.query.roles.findFirst({
        where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
      });
      if (role) {
        await db.insert(schema.userRoles).values({ userId, roleId: role.id });
      }
      const login = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: {
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { email, password: "password123" },
      });
      return { userId, cookie: login.headers["set-cookie"]?.toString() ?? "" };
    }

    const owner = await setupUser("discussion-owner@test.local", "discowner");
    ownerCookie = owner.cookie;

    const member = await setupUser(
      "discussion-member@test.local",
      "discmember",
    );
    memberId = member.userId;
    memberCookie = member.cookie;

    const outsider = await setupUser(
      "discussion-outsider@test.local",
      "discoutsider",
    );
    outsiderCookie = outsider.cookie;

    const createClub = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Discussion Club",
        visibility: "private",
        context: "book",
      },
    });
    clubId = createClub.json().data.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/invites`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { username: "discmember" },
    });

    const invite = await db.query.clubInvites.findFirst({
      where: eq(schema.clubInvites.clubId, clubId),
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/invites/${invite!.token}/accept`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
      },
    });
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("moderator creates discussion topic", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/topics`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        kind: "discussion",
        title: "Welcome",
        body: "Hello @discmember",
      },
    });
    expect(res.statusCode).toBe(201);
    topicId = res.json().data.id;
  });

  it.skipIf(!dbAvailable)("member can create general discussion", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/topics`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        kind: "discussion",
        title: "Member discussion",
        body: "Started by member",
        userId: "forged-user",
      },
    });
    expect(res.statusCode).toBe(201);
    const topic = await db.query.clubTopics.findFirst({
      where: eq(schema.clubTopics.id, res.json().data.id),
    });
    expect(topic?.authorUserId).toBe(memberId);
  });

  it.skipIf(!dbAvailable)("outsider cannot view topics", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/topics`,
      headers: { cookie: outsiderCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("member replies to topic", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/topics/${topicId}/posts`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { body: "Thanks @discowner!" },
    });
    expect(res.statusCode).toBe(201);
    postId = res.json().data.id;
  });

  it.skipIf(!dbAvailable)(
    "topic detail includes mentions and replies",
    async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/clubs/${clubId}/topics/${topicId}`,
        headers: { cookie: memberCookie },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(
        data.topic.mentions.some(
          (m: { username: string }) => m.username === "discmember",
        ),
      ).toBe(true);
      expect(data.posts).toHaveLength(1);
      expect(
        data.posts[0].mentions.some(
          (m: { username: string }) => m.username === "discowner",
        ),
      ).toBe(true);
      expect(data.canReply).toBe(true);
    },
  );

  it.skipIf(!dbAvailable)("invalid mention rejected", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/topics/${topicId}/posts`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { body: "Hi @discoutsider" },
    });
    expect(res.statusCode).toBe(422);
  });

  it.skipIf(!dbAvailable)("owner creates announcement", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/topics`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        kind: "announcement",
        title: "Rules",
        body: "Be kind.",
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it.skipIf(!dbAvailable)("pinned topics sort first", async () => {
    await app.inject({
      method: "PATCH",
      url: `/api/v1/clubs/${clubId}/topics/${topicId}`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { pinned: true },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/topics`,
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.topics[0].pinned).toBe(true);
  });

  it.skipIf(!dbAvailable)("reaction toggle is idempotent", async () => {
    const headers = {
      cookie: memberCookie,
      origin: "http://localhost:5173",
      "content-type": "application/json",
    };
    const url = `/api/v1/clubs/${clubId}/topics/${topicId}/posts/${postId}/reactions`;

    const like = await app.inject({
      method: "POST",
      url,
      headers,
      payload: { reaction: "like" },
    });
    expect(like.statusCode).toBe(200);
    expect(like.json().data.active).toBe(true);

    const unlike = await app.inject({
      method: "POST",
      url,
      headers,
      payload: { reaction: "like" },
    });
    expect(unlike.statusCode).toBe(200);
    expect(unlike.json().data.active).toBe(false);
  });

  it.skipIf(!dbAvailable)("author can delete own post", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/clubs/${clubId}/topics/${topicId}/posts/${postId}`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
      },
    });
    expect(res.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/topics/${topicId}`,
      headers: { cookie: memberCookie },
    });
    expect(detail.json().data.posts[0].deleted).toBe(true);
  });

  it.skipIf(!dbAvailable)("closed topic rejects replies", async () => {
    await app.inject({
      method: "PATCH",
      url: `/api/v1/clubs/${clubId}/topics/${topicId}`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { closed: true },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/topics/${topicId}/posts`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { body: "Too late" },
    });
    expect(res.statusCode).toBe(422);
  });

  it.skipIf(!dbAvailable)("feed returns activity items", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/feed`,
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().data.items;
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.some((i: { type: string }) => i.type === "topic_created"),
    ).toBe(true);
    expect(
      items.some((i: { type: string }) => i.type === "member_joined"),
    ).toBe(true);
  });
});
