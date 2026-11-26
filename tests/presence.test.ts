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

const ORIGIN = "http://localhost:5173";
const jsonHeaders = (cookie: string) => ({
  cookie,
  origin: ORIGIN,
  "content-type": "application/json",
});

describe("Presence 1.0", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookieA = "";
  let cookieB = "";
  let userAId = "";
  let userBId = "";
  let bookX = "";
  let bookY = "";
  let audioY = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-presence-"),
    );

    const setupPool = createPool(DATABASE_URL);
    const db = createDb(setupPool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    userAId = generateId();
    userBId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "presence-a@test.local"));
    await db.delete(schema.users).where(eq(schema.users.email, "presence-b@test.local"));
    await db.insert(schema.users).values({
      id: userAId,
      email: "presence-a@test.local",
      username: "presence_alice",
      displayName: "Presence Alice",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: userAId });
    await db.insert(schema.users).values({
      id: userBId,
      email: "presence-b@test.local",
      username: "presence_bob",
      displayName: "Presence Bob",
      passwordHash: await hash("password123"),
    });
    await db.insert(schema.userPreferences).values({ userId: userBId });
    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (adminRole) {
      await db.insert(schema.userRoles).values({ userId: userAId, roleId: adminRole.id }).onConflictDoNothing();
    }
    if (memberRole) {
      await db.insert(schema.userRoles).values({ userId: userBId, roleId: memberRole.id }).onConflictDoNothing();
    }
    await setupPool.end();

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    for (const [email, setCookie] of [
      ["presence-a@test.local", (c: string) => (cookieA = c)],
      ["presence-b@test.local", (c: string) => (cookieB = c)],
    ] as const) {
      const login = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        payload: { email, password: "password123" },
      });
      expect(login.statusCode).toBe(200);
      setCookie(login.headers["set-cookie"]?.toString() ?? "");
    }

    async function createBook(title: string): Promise<string> {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/books",
        headers: jsonHeaders(cookieA),
        payload: { title },
      });
      expect(res.statusCode).toBe(201);
      return res.json().data.id as string;
    }
    bookX = await createBook("Presence Book X");
    bookY = await createBook("Presence Book Y");

    const ab = await app.inject({
      method: "POST",
      url: "/api/v1/audiobooks",
      headers: jsonHeaders(cookieA),
      payload: { title: "Presence Audio Y" },
    });
    expect(ab.statusCode).toBe(201);
    audioY = ab.json().data.id as string;
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  async function start(
    cookie: string,
    body: Record<string, unknown>,
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/presence/start",
      headers: jsonHeaders(cookie),
      payload: body,
    });
    return res;
  }

  async function presenceMe(cookie: string) {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/presence/me",
      headers: { cookie, origin: ORIGIN },
    });
    return res.json().data as {
      presence: { workId: string; kind: string; liveness: string } | null;
      active: Array<{ workId: string; kind: string }>;
    };
  }

  it.skipIf(!dbAvailable)("Reading X → Listening Y → music ends → Reading X", async () => {
    const reading = await start(cookieA, {
      kind: "reading",
      workType: "book",
      workId: bookX,
      source: "feylore-reader",
      metadata: { progressPercent: 63 },
    });
    expect(reading.statusCode).toBe(201);
    const readingId = (reading.json() as { data: { id: string } }).data.id;

    let me = await presenceMe(cookieA);
    expect(me.presence?.workId).toBe(bookX);
    expect(me.presence?.kind).toBe("reading");
    expect(me.presence?.liveness).toBe("live");

    const listening = await start(cookieA, {
      kind: "listening",
      workType: "audiobook",
      workId: audioY,
      source: "feylore-player",
    });
    expect(listening.statusCode).toBe(201);
    const listeningId = listening.json().data.id;

    me = await presenceMe(cookieA);
    expect(me.presence?.workId).toBe(audioY);
    expect(me.presence?.kind).toBe("listening");
    // Both sessions preserved internally.
    expect(me.active.map((a) => a.workId)).toContain(bookX);
    expect(me.active.map((a) => a.workId)).toContain(audioY);

    // Music stops → resolver falls back to Reading X with no restore op.
    const end = await app.inject({
      method: "POST",
      url: "/api/v1/presence/end",
      headers: jsonHeaders(cookieA),
      payload: { sessionId: listeningId },
    });
    expect(end.statusCode).toBe(200);

    me = await presenceMe(cookieA);
    expect(me.presence?.workId).toBe(bookX);

    // Clean reader close ends live session but preserves recent eligibility.
    const endReading = await app.inject({
      method: "POST",
      url: "/api/v1/presence/end",
      headers: jsonHeaders(cookieA),
      payload: { sessionId: readingId },
    });
    expect(endReading.statusCode).toBe(200);
    me = await presenceMe(cookieA);
    expect(me.presence?.workId).toBe(bookX);
    expect(me.presence?.liveness).toBe("recent");
  });

  it.skipIf(!dbAvailable)("newest of two recent books wins", async () => {
    await start(cookieA, {
      kind: "reading",
      workType: "book",
      workId: bookX,
      source: "feylore-reader",
    });
    await new Promise((r) => setTimeout(r, 10));
    await start(cookieA, {
      kind: "reading",
      workType: "book",
      workId: bookY,
      source: "feylore-reader",
    });
    const me = await presenceMe(cookieA);
    expect(me.presence?.workId).toBe(bookY);
  });

  it.skipIf(!dbAvailable)("reading ages out beyond recency window", async () => {
    const db = createDb(pool);
    const s = await start(cookieA, {
      kind: "reading",
      workType: "book",
      workId: bookX,
      source: "feylore-reader",
    });
    const sessionId = s.json().data.id;
    const old = new Date(Date.now() - 49 * 3_600_000);
    await db
      .update(schema.presenceSessions)
      .set({ lastEngagedAt: old })
      .where(eq(schema.presenceSessions.id, sessionId));
    // Age every other reading session for this user too.
    await db
      .update(schema.presenceSessions)
      .set({ lastEngagedAt: old, endedAt: old })
      .where(eq(schema.presenceSessions.userId, userAId));
    const me = await presenceMe(cookieA);
    expect(me.presence).toBeNull();
  });

  it.skipIf(!dbAvailable)("stale crashed playback expires automatically", async () => {
    const db = createDb(pool);
    const s = await start(cookieA, {
      kind: "listening",
      workType: "audiobook",
      workId: audioY,
      source: "feylore-player",
    });
    const sessionId = s.json().data.id;
    const stale = new Date(Date.now() - 10 * 60_000);
    await db
      .update(schema.presenceSessions)
      .set({ lastHeartbeatAt: stale, lastEngagedAt: stale })
      .where(eq(schema.presenceSessions.id, sessionId));
    const me = await presenceMe(cookieA);
    // No eligible reading (aged out above) and playback is stale.
    expect(me.presence).toBeNull();
  });

  it.skipIf(!dbAvailable)("presence visibility is enforced server-side", async () => {
    await start(cookieA, {
      kind: "reading",
      workType: "book",
      workId: bookX,
      source: "feylore-reader",
    });
    // Default prefs are private → other viewer sees nothing.
    const hidden = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/presence_alice/presence",
      headers: { cookie: cookieB, origin: ORIGIN },
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().data).toBeNull();

    // Owner always sees their own presence.
    const me = await presenceMe(cookieA);
    expect(me.presence?.workId).toBe(bookX);

    // Public → other viewer sees it.
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/presence",
      headers: jsonHeaders(cookieA),
      payload: { visibility: "public" },
    });
    expect(patch.statusCode).toBe(200);
    const visible = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/presence_alice/presence",
      headers: { cookie: cookieB, origin: ORIGIN },
    });
    expect(visible.json().data?.workId).toBe(bookX);

    // Disabled source drops the session from resolution.
    await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/presence",
      headers: jsonHeaders(cookieA),
      payload: { readerEnabled: false },
    });
    const suppressed = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/presence_alice/presence",
      headers: { cookie: cookieB, origin: ORIGIN },
    });
    expect(suppressed.json().data).toBeNull();
    // Restore for later tests.
    await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/presence",
      headers: jsonHeaders(cookieA),
      payload: { readerEnabled: true, visibility: "private" },
    });
  });

  it.skipIf(!dbAvailable)("deleted works drop out of presence", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: jsonHeaders(cookieA),
      payload: { title: "Presence Ephemeral Book" },
    });
    const ephemeralId = create.json().data.id as string;
    const ephemeralSlug = create.json().data.slug as string;
    await start(cookieA, {
      kind: "reading",
      workType: "book",
      workId: ephemeralId,
      source: "feylore-reader",
    });
    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/books/${ephemeralSlug}`,
      headers: { cookie: cookieA, origin: ORIGIN },
    });
    expect(del.statusCode).toBe(200);
    const me = await presenceMe(cookieA);
    // The deleted work must not resolve; another recent book may surface instead.
    if (me.presence) {
      expect(me.presence.workId).not.toBe(ephemeralId);
    }
  });

  it.skipIf(!dbAvailable)("heartbeat rejected for reading; touch rejected after end", async () => {
    const s = await start(cookieA, {
      kind: "reading",
      workType: "book",
      workId: bookX,
      source: "feylore-reader",
    });
    const sessionId = s.json().data.id;
    const hb = await app.inject({
      method: "POST",
      url: "/api/v1/presence/heartbeat",
      headers: jsonHeaders(cookieA),
      payload: { sessionId },
    });
    expect(hb.statusCode).toBe(403);
    await app.inject({
      method: "POST",
      url: "/api/v1/presence/end",
      headers: jsonHeaders(cookieA),
      payload: { sessionId },
    });
    const touch = await app.inject({
      method: "POST",
      url: "/api/v1/presence/touch",
      headers: jsonHeaders(cookieA),
      payload: { sessionId },
    });
    expect(touch.statusCode).toBe(403);
  });

  it.skipIf(!dbAvailable)("unknown works are rejected for owned sources", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/presence/start",
      headers: jsonHeaders(cookieA),
      payload: {
        kind: "reading",
        workType: "book",
        workId: "zzzzzz",
        source: "feylore-reader",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it.skipIf(!dbAvailable)("admin can read and update presence policy", async () => {
    const get = await app.inject({
      method: "GET",
      url: "/api/v1/admin/system/presence",
      headers: { cookie: cookieA, origin: ORIGIN },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.readingRecencyHours).toBe(48);
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/system/presence",
      headers: jsonHeaders(cookieA),
      payload: { readingRecencyHours: 48 },
    });
    expect(patch.statusCode).toBe(200);
    const denied = await app.inject({
      method: "GET",
      url: "/api/v1/admin/system/presence",
      headers: { cookie: cookieB, origin: ORIGIN },
    });
    expect(denied.statusCode).toBe(403);
  });
});
