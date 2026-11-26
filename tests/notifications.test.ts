import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq, and } from "drizzle-orm";
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
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LIST,
} from "../src/shared/notifications.js";
import { DomainEventBus } from "../src/server/modules/notifications/events.js";
import {
  NotificationService,
  registerNotificationSource,
} from "../src/server/modules/notifications/service.js";
import { NotificationSourceRegistry } from "../src/server/modules/notifications/sources.js";
import type { NotificationDraft } from "../src/server/modules/notifications/sources.js";
import { ClubMentionSource } from "../src/server/modules/notifications/sources/club-mention.js";

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

describe("Notifications API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let db: ReturnType<typeof createDb>;
  let adminCookie = "";
  let memberAId = "";
  let memberACookie = "";
  let memberBId = "";
  let memberBCookie = "";
  let ghostId = "";
  let ghostCookie = "";
  let disabledBirdId = "";
  let clubId = "";
  let topicId = "";

  let serviceDb: ReturnType<typeof createDb>;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-notifications-"),
    );

    pool = createPool(DATABASE_URL);
    db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);
    serviceDb = createDb(pool);

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

    const admin = await setupUser(
      "notif-admin@test.local",
      "notifadmin",
      ROLE_NAMES.ADMIN,
    );
    adminCookie = admin.cookie;

    const memberA = await setupUser(
      "notif-a@test.local",
      "notifmembera",
      ROLE_NAMES.MEMBER,
    );
    memberAId = memberA.userId;
    memberACookie = memberA.cookie;

    const memberB = await setupUser(
      "notif-b@test.local",
      "notifmemberb",
      ROLE_NAMES.MEMBER,
    );
    memberBId = memberB.userId;
    memberBCookie = memberB.cookie;

    const ghost = await setupUser(
      "notif-ghost@test.local",
      "notifghost",
      ROLE_NAMES.MEMBER,
    );
    ghostId = ghost.userId;
    ghostCookie = ghost.cookie;

    await db.delete(schema.users).where(eq(schema.users.email, "notif-bird@test.local"));
    await db.insert(schema.users).values({
      id: generateId(),
      email: "notif-bird@test.local",
      username: "notifbird",
      displayName: "Notif Bird",
      passwordHash: await hash("password123"),
    });

    const createClub = await app.inject({
      method: "POST",
      url: "/api/v1/clubs",
      headers: {
        cookie: memberACookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        name: "Notification Club",
        visibility: "private",
        context: "book",
      },
    });
    clubId = createClub.json().data.id;

    for (const username of ["notifmemberb", "notifghost"]) {
      await app.inject({
        method: "POST",
        url: `/api/v1/clubs/${clubId}/invites`,
        headers: {
          cookie: memberACookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { username },
      });
    }

    const invites = await db
      .select()
      .from(schema.clubInvites)
      .where(eq(schema.clubInvites.clubId, clubId));
    for (const invite of invites) {
      const invitee = await db.query.users.findFirst({
        where: eq(schema.users.id, invite.inviteeUserId),
      });
      const cookie =
        invitee?.username === "notifghost" ? ghostCookie : memberBCookie;
      await app.inject({
        method: "POST",
        url: `/api/v1/clubs/invites/${invite.token}/accept`,
        headers: {
          cookie,
          origin: "http://localhost:5173",
        },
      });
    }

    const bird = await db.query.users.findFirst({
      where: eq(schema.users.email, "notif-bird@test.local"),
    });
    disabledBirdId = bird!.id;
    await db.insert(schema.clubMembers).values({
      clubId,
      userId: disabledBirdId,
    });
  }, 90000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  async function unreadCount(cookie: string): Promise<number> {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/notifications/unread-count",
      headers: { cookie },
    });
    return res.json().data.count as number;
  }

  async function mentionTopic(postBody: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/topics`,
      headers: {
        cookie: memberACookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        kind: "discussion",
        title: "Let's talk",
        body: postBody,
      },
    });
  }

  it.skipIf(!dbAvailable)("mention in a topic delivers a notification", async () => {
    const res = await mentionTopic("Hey @notifmemberb");
    expect(res.statusCode).toBe(201);
    topicId = res.json().data.id;

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: { cookie: memberBCookie },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().data;
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe(NOTIFICATION_TYPES.CLUB_MENTION);
    expect(items[0].actorDisplayName).toBe("notifmembera");
    expect(items[0].href).toBe(`/clubs/${clubId}/topics/${topicId}`);
    expect(items[0].readAt).toBeNull();
    expect(items[0].aggregatedCount).toBe(1);
    expect(await unreadCount(memberBCookie)).toBe(1);
  });

  it.skipIf(!dbAvailable)("mention in a post delivers a notification", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/topics/${topicId}/posts`,
      headers: {
        cookie: memberACookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { body: "Great point @notifmemberb" },
    });
    expect(res.statusCode).toBe(201);

    expect(await unreadCount(memberBCookie)).toBe(2);
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: { cookie: memberBCookie },
    });
    expect(list.json().data).toHaveLength(2);
    expect(list.json().data[0].subjectId).toBe(topicId);
  });

  it.skipIf(!dbAvailable)("dedupe key prevents duplicate deliveries", async () => {
    const service = new NotificationService(serviceDb);
    const draft: NotificationDraft = {
      recipient: { kind: "users", userIds: [memberBId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Dedupe",
      dedupeKey: "dedupe-test:1",
    };
    expect(await service.deliverDraft(draft)).toBe(1);
    expect(await service.deliverDraft(draft)).toBe(0);

    const row = await db.query.notifications.findFirst({
      where: eq(schema.notifications.dedupeKey, "dedupe-test:1"),
    });
    expect(row).toBeDefined();
    const result = await service.listForUser(memberBId, { limit: 100 });
    expect(result.items.filter((n) => n.id === row!.id).length).toBe(1);
  });

  it.skipIf(!dbAvailable)("aggregation merges unread rows", async () => {
    const service = new NotificationService(serviceDb);
    const aggregateKey = `aggregate-test:${generateId()}`;
    await service.deliverDraft({
      recipient: { kind: "users", userIds: [memberBId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      aggregateKey,
      title: "Aggregated mention",
    });
    await service.deliverDraft({
      recipient: { kind: "users", userIds: [memberBId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      aggregateKey,
      title: "Aggregated mention (newest)",
    });

    const result = await service.listForUser(memberBId, { limit: 100 });
    const matching = result.items.filter(
      (n) => n.title === "Aggregated mention (newest)",
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].aggregatedCount).toBe(2);
  });

  it.skipIf(!dbAvailable)("mark read/seen and ownership checks", async () => {
    const before = await unreadCount(memberBCookie);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: { cookie: memberBCookie },
    });
    const target = list.json().data[0] as { id: string };
    expect(before).toBeGreaterThan(0);

    const read = await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${target.id}/read`,
      headers: { cookie: memberBCookie },
    });
    expect(read.statusCode).toBe(200);
    expect(await unreadCount(memberBCookie)).toBe(before - 1);

    const seen = await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${target.id}/seen`,
      headers: { cookie: memberBCookie },
    });
    expect(seen.statusCode).toBe(200);

    const otherRead = await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${target.id}/read`,
      headers: { cookie: memberACookie },
    });
    expect(otherRead.statusCode).toBe(404);

    const missing = await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${generateId()}/read`,
      headers: { cookie: memberBCookie },
    });
    expect(missing.statusCode).toBe(404);
  });

  it.skipIf(!dbAvailable)("read-all clears unread count", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/notifications/read-all",
      headers: { cookie: memberBCookie },
    });
    expect(await unreadCount(memberBCookie)).toBe(0);
  });

  it.skipIf(!dbAvailable)("member cannot send system announcement", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/notifications",
      headers: {
        cookie: memberACookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Not you" },
    });
    expect(res.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("admin announcement reaches admins only", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/notifications",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: "Maintenance window", body: "10pm", target: "admins" },
    });
    expect(res.statusCode).toBe(200);

    const adminList = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: { cookie: adminCookie },
    });
    expect(
      adminList
        .json()
        .data.some(
          (n: { type: string; title: string }) =>
            n.type === NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT &&
            n.title === "Maintenance window",
        ),
    ).toBe(true);

    const memberList = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
      headers: { cookie: memberACookie },
    });
    expect(
      memberList
        .json()
        .data.some((n: { type: string }) => n.type === NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT),
    ).toBe(false);
  });

  it.skipIf(!dbAvailable)("disabled type preference suppresses delivery", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/notifications",
      headers: {
        cookie: memberBCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        preferences: [{ type: NOTIFICATION_TYPES.CLUB_MENTION, enabled: false }],
      },
    });
    const before = await unreadCount(memberBCookie);
    await mentionTopic("Quiet @notifmemberb");
    expect(await unreadCount(memberBCookie)).toBe(before);

    await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/notifications",
      headers: {
        cookie: memberBCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        preferences: [{ type: NOTIFICATION_TYPES.CLUB_MENTION, enabled: true }],
      },
    });
    await mentionTopic("Loud @notifmemberb");
    expect(await unreadCount(memberBCookie)).toBe(before + 1);
  });

  it.skipIf(!dbAvailable)("disabled users are excluded from delivery", async () => {
    const service = new NotificationService(serviceDb);
    await db
      .update(schema.users)
      .set({ disabledAt: new Date() })
      .where(eq(schema.users.id, disabledBirdId));

    const delivered = await service.deliverDraft({
      recipient: { kind: "users", userIds: [disabledBirdId, memberBId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Bird check",
      dedupeKey: `disabled-exclusion:${generateId()}`,
    });
    expect(delivered).toBe(1);
  });

  it.skipIf(!dbAvailable)("mention source excludes former members", async () => {
    const mentionRes = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/topics`,
      headers: {
        cookie: memberACookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        kind: "discussion",
        title: "Ghost topic",
        body: "Hi @notifghost",
      },
    });
    expect(mentionRes.statusCode).toBe(201);
    const ghostTopicId = mentionRes.json().data.id;
    const ghostMention = await db.query.notifications.findFirst({
      where: and(
        eq(schema.notifications.recipientUserId, ghostId),
        eq(schema.notifications.subjectId, ghostTopicId),
      ),
    });
    expect(ghostMention).toBeDefined();

    const leave = await app.inject({
      method: "POST",
      url: `/api/v1/clubs/${clubId}/leave`,
      headers: { cookie: ghostCookie },
    });
    expect(leave.statusCode).toBe(200);

    const events = new DomainEventBus();
    const registry = new NotificationSourceRegistry();
    const service = new NotificationService(serviceDb, registry);
    registerNotificationSource(
      events,
      registry,
      service,
      new ClubMentionSource(serviceDb),
    );

    const beforeGhost = (await service.listForUser(ghostId, { limit: 100 }))
      .items.length;
    const beforeB = (await service.listForUser(memberBId, { limit: 100 }))
      .items.length;

    await events.publish(
      "club.mention.created",
      {
        clubId,
        topicId: ghostTopicId,
        mentionedUserIds: [ghostId, memberBId],
        actorUsername: "notifmembera",
        actorDisplayName: "Notif Member A",
      },
      { actorUserId: memberAId },
    );

    const afterGhost = (await service.listForUser(ghostId, { limit: 100 }))
      .items.length;
    const afterB = (await service.listForUser(memberBId, { limit: 100 }))
      .items.length;
    expect(afterGhost).toBe(beforeGhost);
    expect(afterB).toBe(beforeB + 1);
  });

  it.skipIf(!dbAvailable)(
    "list exposes the actor avatar url when the actor has one",
    async () => {
      const locationId = generateId();
      const fileId = generateId();
      await db.insert(schema.storageLocations).values({
        id: locationId,
        name: "avatar-test",
        kind: "managed",
        rootPath: "/tmp/feylore-avatar-test",
      });
      await db.insert(schema.files).values({
        id: fileId,
        storageLocationId: locationId,
        relativePath: `avatars/${fileId}.png`,
        size: 1,
        mediaType: "image/png",
      });
      await db
        .update(schema.users)
        .set({ avatarFileId: fileId })
        .where(eq(schema.users.id, memberAId));

      const service = new NotificationService(serviceDb);
      await service.deliverDraft({
        recipient: { kind: "users", userIds: [memberBId] },
        type: NOTIFICATION_TYPES.CLUB_MENTION,
        title: "Avatar check",
        actorUserId: memberAId,
        dedupeKey: `avatar-test:${generateId()}`,
      });

      const list = await service.listForUser(memberBId, { limit: 100 });
      const item = list.items.find((n) => n.title === "Avatar check");
      expect(item).toBeDefined();
      expect(item!.actorDisplayName).toBe("notifmembera");
      expect(item!.actorAvatarUrl).toBe(`/api/v1/files/${fileId}/content`);
    },
  );

  it.skipIf(!dbAvailable)("list paginates with the createdAt cursor", async () => {
    const first = await app.inject({
      method: "GET",
      url: "/api/v1/notifications?limit=1",
      headers: { cookie: memberBCookie },
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody.data).toHaveLength(1);

    const cursor = firstBody.page.nextCursor as string | null;
    expect(cursor).not.toBeNull();

    const second = await app.inject({
      method: "GET",
      url: `/api/v1/notifications?limit=1&cursor=${encodeURIComponent(cursor as string)}`,
      headers: { cookie: memberBCookie },
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json();
    expect(secondBody.data).toHaveLength(1);
    expect(secondBody.data[0].id).not.toBe(firstBody.data[0].id);
    expect(secondBody.page.nextCursor).not.toBeNull();

    // Skipping past two items yields the next distinct item, proving the
    // cursor continues beyond the first page.
    const third = await app.inject({
      method: "GET",
      url: `/api/v1/notifications?limit=1&cursor=${encodeURIComponent(secondBody.page.nextCursor as string)}`,
      headers: { cookie: memberBCookie },
    });
    expect(third.statusCode).toBe(200);
    expect(third.json().data).toHaveLength(1);
    expect(third.json().data[0].id).not.toBe(secondBody.data[0].id);
  });

  it.skipIf(!dbAvailable)("seen marks seen without clearing unread", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/notifications?limit=5",
      headers: { cookie: memberBCookie },
    });
    const target = (list.json().data as Array<{ id: string }>)[0];
    expect(target).toBeDefined();

    const before = await unreadCount(memberBCookie);
    const seen = await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${target.id}/seen`,
      headers: { cookie: memberBCookie },
    });
    expect(seen.statusCode).toBe(200);
    expect(await unreadCount(memberBCookie)).toBe(before);

    const read = await app.inject({
      method: "POST",
      url: `/api/v1/notifications/${target.id}/read`,
      headers: { cookie: memberBCookie },
    });
    expect(read.statusCode).toBe(200);
    expect(await unreadCount(memberBCookie)).toBe(before - 1);
  });

  it.skipIf(!dbAvailable)("settings expose the catalog shape with pause off", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/settings/notifications",
      headers: { cookie: ghostCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.paused).toBe(false);
    expect(body.preferences).toHaveLength(
      NOTIFICATION_TYPE_LIST.length,
    );
    const mention = body.preferences.find(
      (p: { type: string }) => p.type === NOTIFICATION_TYPES.CLUB_MENTION,
    );
    expect(mention).toBeDefined();
    expect(mention.category).toBe("club");
    expect(mention.enabled).toBe(true);
    expect(mention.emailEnabled).toBe(false);
    const system = body.preferences.find(
      (p: { type: string }) => p.type === NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
    );
    expect(system).toBeDefined();
    expect(system.category).toBe("system");
    expect(system.enabled).toBe(true);
    expect(system.emailEnabled).toBe(false);
    // No SMTP in the test environment means the email channel is unavailable.
    expect(body.emailAvailable).toBe(false);
  });

  it.skipIf(!dbAvailable)("settings patch persists pause and per-type toggles", async () => {
    const patchPaused = await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/notifications",
      headers: {
        cookie: ghostCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { paused: true },
    });
    expect(patchPaused.statusCode).toBe(200);
    expect(patchPaused.json().data.paused).toBe(true);

    const patchPref = await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/notifications",
      headers: {
        cookie: ghostCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        preferences: [{ type: NOTIFICATION_TYPES.CLUB_MENTION, enabled: false }],
        paused: false,
      },
    });
    expect(patchPref.statusCode).toBe(200);
    const body = patchPref.json().data;
    expect(body.paused).toBe(false);
    const mention = body.preferences.find(
      (p: { type: string }) => p.type === NOTIFICATION_TYPES.CLUB_MENTION,
    );
    expect(mention.enabled).toBe(false);
    const system = body.preferences.find(
      (p: { type: string }) => p.type === NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
    );
    // Unlisted types keep their previous/catalog value.
    expect(system.enabled).toBe(true);

    const reEnabled = await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/notifications",
      headers: {
        cookie: ghostCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        preferences: [{ type: NOTIFICATION_TYPES.CLUB_MENTION, enabled: true }],
      },
    });
    expect(reEnabled.statusCode).toBe(200);
    expect(reEnabled.json().data.paused).toBe(false);
  });

  it.skipIf(!dbAvailable)("settings patch rejects an empty body", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/notifications",
      headers: {
        cookie: ghostCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it.skipIf(!dbAvailable)("settings patch toggles email without touching in-app", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/notifications",
      headers: {
        cookie: ghostCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        preferences: [
          { type: NOTIFICATION_TYPES.CLUB_MENTION, emailEnabled: true },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const mention = res.json().data.preferences.find(
      (p: { type: string }) => p.type === NOTIFICATION_TYPES.CLUB_MENTION,
    );
    expect(mention.emailEnabled).toBe(true);
    expect(mention.enabled).toBe(true);

    const restored = await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/notifications",
      headers: {
        cookie: ghostCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        preferences: [
          { type: NOTIFICATION_TYPES.CLUB_MENTION, emailEnabled: false },
        ],
      },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().data.preferences[0].emailEnabled).toBe(false);
  });

  it.skipIf(!dbAvailable)("settings patch rejects a type with no channel field", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/notifications",
      headers: {
        cookie: ghostCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: {
        preferences: [{ type: NOTIFICATION_TYPES.CLUB_MENTION }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it.skipIf(!dbAvailable)("fresh inserts dispatch to configured channels", async () => {
    const userId = generateId();
    const email = `notif-channel-${generateId().toLowerCase()}@test.local`;
    await db.insert(schema.users).values({
      id: userId,
      email,
      username: "notifchannel",
      displayName: "Notif Channel",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    const dispatches: Array<{
      userId: string;
      notificationId: string;
      type: string;
    }> = [];
    const service = new NotificationService(serviceDb, undefined, {
      async dispatch(input) {
        dispatches.push(input);
      },
    });

    const dedupeKey = `channel-dedupe:${generateId()}`;
    const first = await service.deliverDraft({
      recipient: { kind: "users", userIds: [userId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Channel first",
      dedupeKey,
    });
    expect(first).toBe(1);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!.type).toBe(NOTIFICATION_TYPES.CLUB_MENTION);
    expect(dispatches[0]!.userId).toBe(userId);
    const inserted = await db.query.notifications.findFirst({
      where: eq(schema.notifications.dedupeKey, dedupeKey),
    });
    expect(inserted?.id).toBe(dispatches[0]!.notificationId);

    // Deduplicated replay does not dispatch again.
    const replay = await service.deliverDraft({
      recipient: { kind: "users", userIds: [userId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Channel replay",
      dedupeKey,
    });
    expect(replay).toBe(0);
    expect(dispatches).toHaveLength(1);

    // Aggregate merges do not dispatch (no fresh row).
    const aggregate = `channel-agg:${generateId()}`;
    const firstAgg = await service.deliverDraft({
      recipient: { kind: "users", userIds: [userId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Aggregate one",
      aggregateKey: aggregate,
    });
    expect(firstAgg).toBe(1);
    expect(dispatches).toHaveLength(2);
    const mergedAgg = await service.deliverDraft({
      recipient: { kind: "users", userIds: [userId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Aggregate two",
      aggregateKey: aggregate,
    });
    expect(mergedAgg).toBe(0);
    expect(dispatches).toHaveLength(2);

    // Paused users never reach the channel dispatch.
    await db
      .update(schema.userPreferences)
      .set({ notificationsPaused: true })
      .where(eq(schema.userPreferences.userId, userId));
    const paused = await service.deliverDraft({
      recipient: { kind: "users", userIds: [userId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Paused channel",
      dedupeKey: `channel-paused:${generateId()}`,
    });
    expect(paused).toBe(0);
    expect(dispatches).toHaveLength(2);

    // Per-type disabled preference never reaches the channel dispatch.
    await db
      .update(schema.userPreferences)
      .set({ notificationsPaused: false })
      .where(eq(schema.userPreferences.userId, userId));
    await db
      .insert(schema.userNotificationPreferences)
      .values({ userId, typeKey: NOTIFICATION_TYPES.CLUB_MENTION, enabled: false })
      .onConflictDoUpdate({
        target: [
          schema.userNotificationPreferences.userId,
          schema.userNotificationPreferences.typeKey,
        ],
        set: { enabled: false },
      });
    const disabledType = await service.deliverDraft({
      recipient: { kind: "users", userIds: [userId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Disabled channel",
      dedupeKey: `channel-disabled:${generateId()}`,
    });
    expect(disabledType).toBe(0);
    expect(dispatches).toHaveLength(2);

    await db.delete(schema.users).where(eq(schema.users.email, email));
  });

  it.skipIf(!dbAvailable)("paused users are suppressed on delivery", async () => {
    const userId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "notif-pause@test.local"));
    await db.insert(schema.users).values({
      id: userId,
      email: "notif-pause@test.local",
      username: "notifpause",
      displayName: "Notif Pause",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId });

    const service = new NotificationService(serviceDb);
    await service.deliverDraft({
      recipient: { kind: "users", userIds: [userId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "Before pause",
      dedupeKey: `pause-before:${generateId()}`,
    });
    expect(
      (await service.listForUser(userId, { limit: 100 })).items.filter(
        (n) => n.title === "Before pause",
      ),
    ).toHaveLength(1);

    await db
      .update(schema.userPreferences)
      .set({ notificationsPaused: true })
      .where(eq(schema.userPreferences.userId, userId));

    const suppressed = await service.deliverDraft({
      recipient: { kind: "users", userIds: [userId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "While paused",
      dedupeKey: `pause-during:${generateId()}`,
    });
    expect(suppressed).toBe(0);
    expect(
      (await service.listForUser(userId, { limit: 100 })).items.filter(
        (n) => n.title === "While paused",
      ),
    ).toHaveLength(0);

    await db
      .update(schema.userPreferences)
      .set({ notificationsPaused: false })
      .where(eq(schema.userPreferences.userId, userId));

    const resumed = await service.deliverDraft({
      recipient: { kind: "users", userIds: [userId] },
      type: NOTIFICATION_TYPES.CLUB_MENTION,
      title: "After unpause",
      dedupeKey: `pause-after:${generateId()}`,
    });
    expect(resumed).toBe(1);

    await db.delete(schema.users).where(eq(schema.users.email, "notif-pause@test.local"));
  });
});