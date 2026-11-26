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

describe("Club check-ins API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let ownerCookie = "";
  let memberCookie = "";
  let clubId = "";
  let occurrenceId = "";

  beforeAll(async () => {
    if (!dbAvailable) return;

    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-club-checkins-"),
    );

    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
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

    ownerCookie = await setupUser("club-checkin-owner@test.local", "checkowner");
    memberCookie = await setupUser(
      "club-checkin-member@test.local",
      "checkmember",
    );

    const bookId = await createBook(app, ownerCookie, "Check-in Book");

    const createClub = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Check-in Club",
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
      payload: { username: "checkmember" },
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

    const createSchedule = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/schedules`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        title: "Weekly Reading",
        frequency: "once",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        consumption: { kind: "chapter", start: 6, count: 1 },
        topicTiming: "immediate",
      },
    });
    expect(createSchedule.statusCode).toBe(201);

    const checkIn = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/check-in`,
      headers: { cookie: memberCookie },
    });
    expect(checkIn.statusCode).toBe(200);
    occurrenceId = checkIn.json().data.target?.id;
    expect(occurrenceId).toBeTruthy();
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("returns check-in summary with member counts", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/check-in`,
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.memberCount).toBe(2);
    expect(data.checkedInCount).toBe(0);
    expect(data.viewerCheckedIn).toBe(false);
    expect(data.target?.consumptionLabel).toContain("Chapter 6");
  });

  it.skipIf(!dbAvailable)("member can check in and undo on active occurrence", async () => {
    const checkIn = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/schedule/occurrences/${occurrenceId}/check-in`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
      },
    });
    expect(checkIn.statusCode).toBe(200);
    expect(checkIn.json().data.viewerCheckedIn).toBe(true);
    expect(checkIn.json().data.checkedInCount).toBe(1);

    const undo = await app.inject({
      method: "DELETE",
      url: `/api/v1/clubs/${clubId}/schedule/occurrences/${occurrenceId}/check-in`,
      headers: {
        cookie: memberCookie,
        origin: "http://localhost:5173",
      },
    });
    expect(undo.statusCode).toBe(200);
    expect(undo.json().data.viewerCheckedIn).toBe(false);
    expect(undo.json().data.checkedInCount).toBe(0);
  });

  it.skipIf(!dbAvailable)("returns current work detail with author subtitle", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${clubId}/works/current`,
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(200);
    const work = res.json().data;
    expect(work.title).toBe("Check-in Book");
    expect(work.subtitle).toBe("Author");
  });
});
