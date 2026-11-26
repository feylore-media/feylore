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

describe("Clubs API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let ownerCookie = "";
  let otherCookie = "";
  let adminCookie = "";
  let ownerId = "";
  let otherId = "";
  let privateClubId = "";
  let publicClubId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-clubs-"),
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
      roleName?: string,
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
      await db.insert(schema.userPreferences).values({ userId });
      if (roleName) {
        const role = await db.query.roles.findFirst({
          where: eq(schema.roles.name, roleName),
        });
        if (role) {
          await db.insert(schema.userRoles).values({ userId, roleId: role.id });
        }
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

    const owner = await setupUser(
      "club-owner@test.local",
      "clubowner",
      ROLE_NAMES.MEMBER,
    );
    ownerId = owner.userId;
    ownerCookie = owner.cookie;

    const other = await setupUser(
      "club-other@test.local",
      "clubother",
      ROLE_NAMES.MEMBER,
    );
    otherId = other.userId;
    otherCookie = other.cookie;

    const admin = await setupUser(
      "club-admin@test.local",
      "clubadmin",
      ROLE_NAMES.ADMIN,
    );
    adminCookie = admin.cookie;

    const createPrivate = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Private Club",
        visibility: "private",
        context: "general",
      },
    });
    privateClubId = createPrivate.json().data.id;

    const createPublic = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Public Club",
        visibility: "public",
        context: "book",
      },
    });
    publicClubId = createPublic.json().data.id;
  }, 60000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it.skipIf(!dbAvailable)("lists clubs for member", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      headers: { cookie: ownerCookie },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json().data.some((c: { id: string }) => c.id === privateClubId),
    ).toBe(true);
  });

  it.skipIf(!dbAvailable)("private club denied to non-member", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${privateClubId}`,
      headers: { cookie: otherCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("public club visible to non-member", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${publicClubId}`,
      headers: { cookie: otherCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.club.visibility).toBe("public");
    expect(res.json().data.canJoin).toBe(true);
  });

  it.skipIf(!dbAvailable)("public join adds membership", async () => {
    const join = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${publicClubId}/join`,
      headers: {
        cookie: otherCookie,
        origin: "http://localhost:5173",
      },
    });
    expect(join.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${publicClubId}`,
      headers: { cookie: otherCookie },
    });
    expect(detail.json().data.isMember).toBe(true);
  });

  it.skipIf(!dbAvailable)("private join rejected", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${privateClubId}/join`,
      headers: {
        cookie: otherCookie,
        origin: "http://localhost:5173",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("member cannot publish public club", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: otherCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { name: "Blocked Public", visibility: "public" },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("invite accept grants membership", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${privateClubId}/invites`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { username: "clubother" },
    });

    const invite = await db.query.clubInvites.findFirst({
      where: eq(schema.clubInvites.clubId, privateClubId),
    });
    expect(invite).toBeTruthy();

    const accept = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/invites/${invite!.token}/accept`,
      headers: {
        cookie: otherCookie,
        origin: "http://localhost:5173",
      },
    });
    expect(accept.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${privateClubId}`,
      headers: { cookie: otherCookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.isMember).toBe(true);
  });

  it.skipIf(!dbAvailable)("owner can promote member to moderator", async () => {
    const promote = await app.inject({
      method: "PATCH",
      url: `/api/v1/clubs/${privateClubId}/members/${otherId}`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { role: "moderator" },
    });
    expect(promote.statusCode).toBe(200);

    const members = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${privateClubId}/members`,
      headers: { cookie: ownerCookie },
    });
    const otherMember = members.json().data.find(
      (m: { userId: string }) => m.userId === otherId,
    );
    expect(otherMember.role).toBe("moderator");
  });

  it.skipIf(!dbAvailable)("non-owner cannot change roles", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/clubs/${privateClubId}/members/${ownerId}`,
      headers: {
        cookie: otherCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { role: "moderator" },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("owner cannot leave club", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${privateClubId}/leave`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("moderator can leave club", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${privateClubId}/leave`,
      headers: {
        cookie: otherCookie,
        origin: "http://localhost:5173",
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it.skipIf(!dbAvailable)("list exposes canJoin for joinable public clubs", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Joinable List Club",
        visibility: "public",
        context: "general",
      },
    });
    const joinableClubId = create.json().data.id;

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      headers: { cookie: ownerCookie },
    });
    expect(list.statusCode).toBe(200);

    const joinable = list
      .json()
      .data.find((c: { id: string }) => c.id === joinableClubId);
    expect(joinable).toBeTruthy();
    expect(joinable.canJoin).toBe(true);
    expect(joinable.isMember).toBe(false);

    const memberView = list
      .json()
      .data.find((c: { id: string }) => c.id === privateClubId);
    expect(memberView.canJoin).toBe(false);
    expect(memberView.isMember).toBe(true);
  });

  it.skipIf(!dbAvailable)("list lastActivityAt is null for quiet new club", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Quiet Club",
        visibility: "private",
        context: "general",
      },
    });
    const quietClubId = create.json().data.id;

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      headers: { cookie: ownerCookie },
    });
    const quiet = list
      .json()
      .data.find((c: { id: string }) => c.id === quietClubId);
    expect(quiet.lastActivityAt).toBeNull();
    expect(quiet.hasUnreadActivity).toBe(false);
  });

  it.skipIf(!dbAvailable)("list lastActivityAt reflects topic activity", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Active Club",
        visibility: "private",
        context: "general",
      },
    });
    const activeClubId = create.json().data.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${activeClubId}/topics`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        kind: "discussion",
        title: "Hello",
        body: "First topic",
      },
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      headers: { cookie: ownerCookie },
    });
    const active = list
      .json()
      .data.find((c: { id: string }) => c.id === activeClubId);
    expect(active.lastActivityAt).toBeTruthy();
  });

  it.skipIf(!dbAvailable)("list lastActivityAt reflects non-owner member join", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Member Join Activity Club",
        visibility: "public",
        context: "general",
      },
    });
    const clubId = create.json().data.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/join`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
      },
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      headers: { cookie: adminCookie },
    });
    const club = list.json().data.find((c: { id: string }) => c.id === clubId);
    expect(club.lastActivityAt).toBeTruthy();
  });

  it.skipIf(!dbAvailable)("detail visit marks club read and clears unread", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Unread Club",
        visibility: "private",
        context: "general",
      },
    });
    const unreadClubId = create.json().data.id;

    await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${unreadClubId}/topics`,
      headers: {
        cookie: ownerCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        kind: "discussion",
        title: "Update",
        body: "Something happened",
      },
    });

    const listBefore = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      headers: { cookie: ownerCookie },
    });
    const before = listBefore
      .json()
      .data.find((c: { id: string }) => c.id === unreadClubId);
    expect(before.hasUnreadActivity).toBe(true);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${unreadClubId}`,
      headers: { cookie: ownerCookie },
    });
    expect(detail.statusCode).toBe(200);

    const listAfter = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      headers: { cookie: ownerCookie },
    });
    const after = listAfter
      .json()
      .data.find((c: { id: string }) => c.id === unreadClubId);
    expect(after.hasUnreadActivity).toBe(false);

    const detailAgain = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${unreadClubId}`,
      headers: { cookie: ownerCookie },
    });
    expect(detailAgain.statusCode).toBe(200);

    const listAgain = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      headers: { cookie: ownerCookie },
    });
    const stillRead = listAgain
      .json()
      .data.find((c: { id: string }) => c.id === unreadClubId);
    expect(stillRead.hasUnreadActivity).toBe(false);
  });
});
