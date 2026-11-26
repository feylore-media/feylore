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

describe("Club discussion anchors API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let ownerCookie = "";
  let memberCookie = "";
  let clubId = "";
  let emptyOccurrenceId = "";

  beforeAll(async () => {
    if (!dbAvailable) return;

    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-club-anchors-"),
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
      return login.headers["set-cookie"]?.toString() ?? "";
    }

    ownerCookie = await setupUser("club-anchors-owner@test.local", "anchorsowner");
    memberCookie = await setupUser(
      "club-anchors-member@test.local",
      "anchorsmember",
    );

    const createClub = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Anchors Club",
        visibility: "private",
        context: "book",
      },
    });
    clubId = createClub.json().data.id;

    const invite = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/invites`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { username: "anchorsmember" },
    });
    const token = (
      await db.query.clubInvites.findFirst({
        where: eq(schema.clubInvites.id, invite.json().data.id),
      })
    )?.token;
    if (token) {
      await app.inject({
        method: "POST",
        url: `/api/v1/clubs/invites/${token}/accept`,
        headers: {
          cookie: memberCookie,
          origin: "http://localhost:5173",
        },
      });
    }

    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/schedules`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Reading",
        frequency: "once",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        consumption: { kind: "chapter", start: 6, count: 1 },
        topicTiming: "immediate",
        autoCreateTopic: false,
      },
    });

    const checkIn = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/check-in`,
      headers: { cookie: memberCookie },
    });
    emptyOccurrenceId = checkIn.json().data.target?.id;
    expect(emptyOccurrenceId).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("lists empty anchor without topic", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/discussion-anchors`,
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(200);
    const anchors = res.json().data.anchors as Array<{
      id: string;
      topicId: string | null;
      messageCount: number;
      emphasis: string;
    }>;
    const current = anchors.find((row) => row.emphasis === "current");
    expect(current?.topicId).toBeNull();
    expect(current?.messageCount).toBe(0);
  });

  it.skipIf(!dbAvailable)("creates topic lazily for empty anchor", async () => {
    const open = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/schedule/occurrences/${emptyOccurrenceId}/discussion`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
      },
    });
    expect(open.statusCode).toBe(201);
    const topicId = open.json().data.topicId as string;
    expect(topicId).toBeTruthy();

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/discussion-anchors/all`,
      headers: { cookie: memberCookie },
    });
    const anchor = res.json().data.anchors.find(
      (row: { id: string }) => row.id === emptyOccurrenceId,
    );
    expect(anchor.topicId).toBe(topicId);
    expect(anchor.messageCount).toBeGreaterThan(0);
  });
});
