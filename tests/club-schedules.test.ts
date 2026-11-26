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
  return res.json().data.id as string;
}

describe("Club schedules API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let ownerCookie = "";
  let memberCookie = "";
  let clubId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-club-schedules-"),
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

    ownerCookie = await setupUser(
      "club-sched-owner@test.local",
      "schedowner",
    );
    memberCookie = await setupUser(
      "club-sched-member@test.local",
      "schedmember",
    );

    const bookId = await createBook(app, ownerCookie, "Scheduled Book");

    const createClub = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Schedule Club",
        visibility: "private",
        context: "book",
      },
    });
    clubId = createClub.json().data.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/works`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        workSubjectType: "book",
        workSubjectId: bookId,
        status: "current",
      },
    });

    const invite = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/invites`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { username: "schedmember" },
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
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("creates weekly schedule with occurrences", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const create = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/schedules`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Weekly Reading",
        frequency: "weekly",
        dayOfWeek: 5,
        startsAt: past,
        consumption: { kind: "chapter", start: 1, increment: 1, count: 1 },
        topicTiming: "immediate",
      },
    });
    expect(create.statusCode).toBe(201);

    const view = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/schedule`,
      headers: { cookie: memberCookie },
    });
    expect(view.statusCode).toBe(200);
    const data = view.json().data;
    expect(
      data.upcoming.length + (data.current ? 1 : 0) + data.past.length,
    ).toBeGreaterThan(0);
  });

  it.skipIf(!dbAvailable)("immediate schedule creates discussion topic", async () => {
    const topicsBefore = await db
      .select()
      .from(schema.clubTopics)
      .where(eq(schema.clubTopics.clubId, clubId));

    const create = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/schedules`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Check-in",
        frequency: "once",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        consumption: { kind: "custom", label: "Weekly check-in" },
        topicTiming: "immediate",
      },
    });
    expect(create.statusCode).toBe(201);

    const topicsAfter = await db
      .select()
      .from(schema.clubTopics)
      .where(eq(schema.clubTopics.clubId, clubId));

    expect(topicsAfter.length).toBeGreaterThan(topicsBefore.length);
    const linked = topicsAfter.find((t) => t.scheduleOccurrenceId);
    expect(linked).toBeTruthy();
  });

  it.skipIf(!dbAvailable)("paused schedule stops at update", async () => {
    const create = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/schedules`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "To Pause",
        frequency: "weekly",
        dayOfWeek: 1,
        startsAt: new Date().toISOString(),
        consumption: { kind: "chapter", start: 10, increment: 1, count: 1 },
      },
    });
    const scheduleId = create.json().data.id;

    const pause = await app.inject({
      method: "PATCH",
      url: `/api/v1/clubs/${clubId}/schedules/${scheduleId}`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { status: "paused" },
    });
    expect(pause.statusCode).toBe(200);

    const row = await db.query.clubSchedules.findFirst({
      where: eq(schema.clubSchedules.id, scheduleId),
    });
    expect(row?.status).toBe("paused");
  });
});
