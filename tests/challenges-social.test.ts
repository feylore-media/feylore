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
import { ROLE_NAMES, type RoleName } from "../src/shared/permissions.js";

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

function jsonHeaders(cookie: string): Record<string, string> {
  return {
    cookie,
    origin: "http://localhost:5173",
    "content-type": "application/json",
  };
}

describe.runIf(dbAvailable)("Challenges 1.3 social API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let creatorCookie = "";
  let creatorId = "";
  let inviteeCookie = "";
  let inviteeId = "";
  let strangerCookie = "";
  let challengeId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-challenges-social-"),
    );

    pool = createPool(DATABASE_URL);
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    async function setupUser(
      email: string,
      username: string,
      roleName: RoleName,
    ) {
      const userId = generateId();
      await db.delete(schema.users).where(eq(schema.users.email, email));
      await db.insert(schema.users).values({
        id: userId,
        email,
        username,
        displayName: username,
        passwordHash: await hash("password123"),
      });
      await db
        .delete(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId));
      await db.insert(schema.userPreferences).values({ userId });
      const role = await db.query.roles.findFirst({
        where: eq(schema.roles.name, roleName),
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

    const creator = await setupUser(
      "ch-creator@test.local",
      "chcreator",
      ROLE_NAMES.MEMBER,
    );
    creatorId = creator.userId;
    creatorCookie = creator.cookie;
    const invitee = await setupUser(
      "ch-invitee@test.local",
      "chinvitee",
      ROLE_NAMES.MEMBER,
    );
    inviteeId = invitee.userId;
    inviteeCookie = invitee.cookie;
    const stranger = await setupUser(
      "ch-stranger@test.local",
      "chstranger",
      ROLE_NAMES.MEMBER,
    );
    strangerCookie = stranger.cookie;
  }, 90000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("runs the invite-only accept flow without leaking visibility", async () => {
    // Invite-only challenge in its active window.
    const now = Date.now();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/challenges",
      headers: jsonHeaders(creatorCookie),
      payload: {
        title: "Secret quest club",
        format: "simple",
        visibility: "private",
        joinPolicy: "invite_only",
        startsAt: new Date(now - 86400000).toISOString(),
        endsAt: new Date(now + 86400000 * 30).toISOString(),
        objectives: [
          {
            metric: "works",
            aggregation: { kind: "count" },
            target: 5,
            domains: ["books"],
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    challengeId = created.json().data.id;

    // Publish it: draft → active.
    const activated = await app.inject({
      method: "PATCH",
      url: `/api/v1/challenges/${challengeId}`,
      headers: jsonHeaders(creatorCookie),
      payload: { state: "active" },
    });
    expect(activated.statusCode).toBe(200);

    // Strangers cannot see invite-only challenges…
    const strangerView = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: { cookie: strangerCookie },
    });
    expect(strangerView.statusCode).toBe(403);

    // …managers cannot invite themselves…
    const selfInvite = await app.inject({
      method: "POST",
      url: `/api/v1/challenges/${challengeId}/invites`,
      headers: jsonHeaders(creatorCookie),
      payload: { userId: creatorId },
    });
    expect(selfInvite.statusCode).toBe(422);

    // …non-managers cannot invite.
    const strangerInvite = await app.inject({
      method: "POST",
      url: `/api/v1/challenges/${challengeId}/invites`,
      headers: jsonHeaders(strangerCookie),
      payload: { userId: inviteeId },
    });
    expect(strangerInvite.statusCode).toBe(403);

    // Invite the invitee.
    const invited = await app.inject({
      method: "POST",
      url: `/api/v1/challenges/${challengeId}/invites`,
      headers: jsonHeaders(creatorCookie),
      payload: { userId: inviteeId },
    });
    expect(invited.statusCode).toBe(201);
    expect(invited.json().data.state).toBe("pending");
    const inviteId = invited.json().data.id as string;

    // Invitees can view to decide…
    const inviteeView = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}`,
      headers: { cookie: inviteeCookie },
    });
    expect(inviteeView.statusCode).toBe(200);

    // …see it in their hub's invited bucket…
    const hubBefore = await app.inject({
      method: "GET",
      url: "/api/v1/challenges/hub",
      headers: { cookie: inviteeCookie },
    });
    expect(hubBefore.statusCode).toBe(200);
    const invitedIds = hubBefore
      .json()
      .data.hub.invited.map((record: { id: string }) => record.id);
    expect(invitedIds).toContain(challengeId);

    // …and accept into participation.
    const accepted = await app.inject({
      method: "POST",
      url: `/api/v1/challenges/invites/${inviteId}/accept`,
      headers: { cookie: inviteeCookie },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().data.state).toBe("accepted");

    const hubAfter = await app.inject({
      method: "GET",
      url: "/api/v1/challenges/hub",
      headers: { cookie: inviteeCookie },
    });
    const yoursIds = hubAfter
      .json()
      .data.hub.yours.map((record: { id: string }) => record.id);
    expect(yoursIds).toContain(challengeId);

    // Summaries share counts, never counted items.
    const summaries = await app.inject({
      method: "GET",
      url: `/api/v1/challenges/${challengeId}/participants/summaries`,
      headers: { cookie: creatorCookie },
    });
    expect(summaries.statusCode).toBe(200);
    const rows = summaries.json().data as Array<{
      userId: string;
      summary: { format: string; current: number; target: number } | null;
    }>;
    const inviteeRow = rows.find((row) => row.userId === inviteeId);
    expect(inviteeRow?.summary).toMatchObject({
      format: "simple",
      current: 0,
      target: 5,
    });
    expect(JSON.stringify(rows)).not.toContain("candidates");
  });

  it("supports decline plus re-invite without rewriting history", async () => {
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/challenges",
      headers: jsonHeaders(creatorCookie),
      payload: {
        title: "Second secret",
        format: "simple",
        visibility: "private",
        joinPolicy: "invite_only",
        startsAt: new Date(Date.now() - 86400000).toISOString(),
        endsAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        objectives: [
          {
            metric: "works",
            aggregation: { kind: "count" },
            target: 3,
            domains: ["books"],
          },
        ],
      },
    });
    const secondId = second.json().data.id as string;
    await app.inject({
      method: "PATCH",
      url: `/api/v1/challenges/${secondId}`,
      headers: jsonHeaders(creatorCookie),
      payload: { state: "active" },
    });

    const invited = await app.inject({
      method: "POST",
      url: `/api/v1/challenges/${secondId}/invites`,
      headers: jsonHeaders(creatorCookie),
      payload: { userId: inviteeId },
    });
    const inviteId = invited.json().data.id as string;

    const declined = await app.inject({
      method: "POST",
      url: `/api/v1/challenges/invites/${inviteId}/decline`,
      headers: { cookie: inviteeCookie },
    });
    expect(declined.statusCode).toBe(200);
    expect(declined.json().data.state).toBe("declined");

    // Re-inviting returns the same row to pending.
    const reinvited = await app.inject({
      method: "POST",
      url: `/api/v1/challenges/${secondId}/invites`,
      headers: jsonHeaders(creatorCookie),
      payload: { userId: inviteeId },
    });
    expect(reinvited.statusCode).toBe(201);
    expect(reinvited.json().data.id).toBe(inviteId);
    expect(reinvited.json().data.state).toBe("pending");
  });
});
