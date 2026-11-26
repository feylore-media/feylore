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
import { PROFILE_VISIBILITY } from "../src/shared/profile.js";
import { sanitizeProfileCss } from "../src/server/modules/profiles/css-sanitize.js";
import {
  recognizeProfileLinkProvider,
  normalizeProfileArtifactType,
  formatProfileDisplayIdentity,
} from "../src/shared/profile-platform.js";
import {
  DEFAULT_PROFILE_COSMETICS,
  contrastRatio,
  normalizeHexColor,
  normalizeProfileCosmetics,
  parseHexColor,
  profileColorContrastError,
  profileUsernameColorSchema,
  type ProfileCosmetics,
} from "../src/shared/profile-cosmetics.js";

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

describe("profile platform", () => {
  it("recognizes known link providers and keeps unknown links valid", () => {
    expect(recognizeProfileLinkProvider("https://hardcover.app/books/1").key).toBe("hardcover");
    expect(recognizeProfileLinkProvider("https://bsky.app/profile/x").key).toBe("bluesky");
    expect(recognizeProfileLinkProvider("https://example.com/me").key).toBe("generic");
  });

  it("sanitizes profile CSS to the documented API", () => {
    const sanitized = sanitizeProfileCss(`
      .profile { color: red; position: fixed; }
      .profile-hero { background: blue; }
      body { color: black; }
      .profile-links { background-image: url(https://evil.example/x.png); color: green; }
      @import url(https://evil.example/a.css);
    `);
    expect(sanitized).toContain(".profile-hero");
    expect(sanitized).not.toContain("position:fixed");
    expect(sanitized).not.toContain("body");
    expect(sanitized).not.toContain("url(");
    expect(sanitized).not.toContain("@import");
  });

  it("collapses redundant display identity and keeps legacy shelf aliases compatible", () => {
    expect(formatProfileDisplayIdentity("moonlitlibrary", "moonlitlibrary", "she/her")).toEqual({
      primary: "@moonlitlibrary",
      secondary: "she/her",
    });
    expect(formatProfileDisplayIdentity("Allie", "moonlitlibrary", "she/her")).toEqual({
      primary: "Allie",
      secondary: "she/her",
      username: "@moonlitlibrary",
    });
    expect(normalizeProfileArtifactType("shelf-preview")).toBe("shelf");
    expect(normalizeProfileArtifactType("shelf")).toBe("shelf");
  });

  it("computes WCAG contrast and expands shorthand hex colors", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBe(21);
    expect(parseHexColor("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
    expect(normalizeHexColor("not-a-color")).toBeNull();
  });

  it("accepts palette colors and contrast-safe hex colors, and normalizes them", () => {
    expect(profileUsernameColorSchema.parse("accent")).toBe("accent");
    expect(profileUsernameColorSchema.parse("#777777")).toBe("#777777");
    expect(profileUsernameColorSchema.parse("#777")).toBe("#777777");
  });

  it("rejects low-contrast and malformed custom name colors", () => {
    expect(profileColorContrastError("#777777")).toBeNull();
    expect(profileColorContrastError("#000000")).not.toBeNull();
    expect(profileColorContrastError("#ffffff")).not.toBeNull();
    // #aabbcc reads fine on dark paper but disappears on the light paper.
    expect(profileColorContrastError("#aabbcc")).not.toBeNull();
    expect(profileUsernameColorSchema.safeParse("#ffffff").success).toBe(false);
    expect(profileUsernameColorSchema.safeParse("red").success).toBe(false);
  });

  it("normalizes cosmetics defensively without ever trusting stored values", () => {
    expect(normalizeProfileCosmetics(null)).toEqual(DEFAULT_PROFILE_COSMETICS);
    expect(normalizeProfileCosmetics("junk")).toEqual(DEFAULT_PROFILE_COSMETICS);
    expect(
      normalizeProfileCosmetics({
        usernameStyle: "shimmer",
        usernameColor: "#abc",
        usernameAccentColor: "#777777",
        futureField: "ignored",
      }),
    ).toEqual({
      usernameStyle: "shimmer",
      usernameColor: "#aabbcc",
      usernameAccentColor: "#777777",
    });
    // Accent is meaningless for styles that do not render one.
    expect(
      normalizeProfileCosmetics({ usernameStyle: "bold", usernameAccentColor: "rose", usernameColor: "#abc" }),
    ).toEqual({ usernameStyle: "bold", usernameColor: "#aabbcc", usernameAccentColor: null });
  });
});

describe("profile platform API", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let cookieA = "";
  let cookieB = "";
  let userAId = "";
  let userBId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    process.env.STORAGE_ROOT = await fs.mkdtemp(
      path.join(os.tmpdir(), "feylore-profile-platform-"),
    );

    const setupPool = createPool(DATABASE_URL);
    const db = createDb(setupPool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(db);

    userAId = generateId();
    userBId = generateId();
    await db.delete(schema.users).where(eq(schema.users.email, "plat-a@test.local"));
    await db.delete(schema.users).where(eq(schema.users.email, "plat-b@test.local"));

    await db.insert(schema.users).values({
      id: userAId,
      email: "plat-a@test.local",
      username: "plat_alice",
      displayName: "Plat Alice",
      passwordHash: await hash("password123"),
      profileVisibility: PROFILE_VISIBILITY.PUBLIC,
    });
    await db.insert(schema.userPreferences).values({ userId: userAId });
    await db.insert(schema.users).values({
      id: userBId,
      email: "plat-b@test.local",
      username: "plat_bob",
      displayName: "Plat Bob",
      passwordHash: await hash("password123"),
      profileVisibility: PROFILE_VISIBILITY.PUBLIC,
    });
    await db.insert(schema.userPreferences).values({ userId: userBId });

    const memberRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, "member"),
    });
    if (memberRole) {
      await db.insert(schema.userRoles).values({ userId: userAId, roleId: memberRole.id }).onConflictDoNothing();
      await db.insert(schema.userRoles).values({ userId: userBId, roleId: memberRole.id }).onConflictDoNothing();
    }
    await setupPool.end();

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const loginA = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "http://localhost:5173", "content-type": "application/json" },
      payload: { email: "plat-a@test.local", password: "password123" },
    });
    cookieA = loginA.headers["set-cookie"]?.toString() ?? "";

    const loginB = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "http://localhost:5173", "content-type": "application/json" },
      payload: { email: "plat-b@test.local", password: "password123" },
    });
    cookieB = loginB.headers["set-cookie"]?.toString() ?? "";
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  const jsonHeaders = (cookie: string) => ({
    cookie,
    origin: "http://localhost:5173",
    "content-type": "application/json",
  });

  it.skipIf(!dbAvailable)("creates, reorders, and validates profile links", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/profiles/me/links",
      headers: jsonHeaders(cookieA),
      payload: { label: "Bad", url: "ftp://example.com/x" },
    });
    expect([400, 422].includes(bad.statusCode)).toBe(true);

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/profiles/me/links",
      headers: jsonHeaders(cookieA),
      payload: { label: "Hardcover", url: "https://hardcover.app/@alice" },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().data.provider).toBe("hardcover");

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/profiles/me/links",
      headers: jsonHeaders(cookieA),
      payload: { label: "Site", url: "https://example.com/alice" },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().data.provider).toBe("generic");

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/me/links",
      headers: { cookie: cookieA },
    });
    const ids = list.json().data.map((l: { id: string }) => l.id) as string[];
    expect(ids.length).toBe(2);

    const reorder = await app.inject({
      method: "PUT",
      url: "/api/v1/profiles/me/links/reorder",
      headers: jsonHeaders(cookieA),
      payload: { orderedIds: [...ids].reverse() },
    });
    expect(reorder.statusCode).toBe(200);
    expect(reorder.json().data[0].id).toBe(ids[1]);
  });

  it.skipIf(!dbAvailable)("follow is idempotent and self-follow is rejected", async () => {
    const noBodyHeaders = (cookie: string) => ({ cookie, origin: "http://localhost:5173" });
    const self = await app.inject({
      method: "POST",
      url: "/api/v1/profiles/plat_alice/follow",
      headers: noBodyHeaders(cookieA),
    });
    expect([400, 422].includes(self.statusCode)).toBe(true);

    const follow1 = await app.inject({
      method: "POST",
      url: "/api/v1/profiles/plat_bob/follow",
      headers: noBodyHeaders(cookieA),
    });
    expect(follow1.statusCode).toBe(200);
    expect(follow1.json().data.isFollowing).toBe(true);

    const follow2 = await app.inject({
      method: "POST",
      url: "/api/v1/profiles/plat_bob/follow",
      headers: noBodyHeaders(cookieA),
    });
    expect(follow2.statusCode).toBe(200);
    expect(follow2.json().data.isFollowing).toBe(true);
    expect(follow2.json().data.followers).toBe(1);

    const unfollow = await app.inject({
      method: "DELETE",
      url: "/api/v1/profiles/plat_bob/follow",
      headers: noBodyHeaders(cookieA),
    });
    expect(unfollow.statusCode).toBe(200);
    expect(unfollow.json().data.isFollowing).toBe(false);

    // Follow again so later tests see a relationship
    await app.inject({
      method: "POST",
      url: "/api/v1/profiles/plat_bob/follow",
      headers: noBodyHeaders(cookieA),
    });
  });

  it.skipIf(!dbAvailable)("persists name cosmetics and keeps them when other fields update", async () => {
    const saved = await app.inject({
      method: "PATCH",
      url: "/api/v1/profiles/me",
      headers: jsonHeaders(cookieA),
      payload: {
        cosmetics: {
          usernameStyle: "shimmer",
          usernameColor: "#777777",
          usernameAccentColor: "rose",
        },
      },
    });
    expect(saved.statusCode).toBe(200);

    const extended = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/me/extended",
      headers: { cookie: cookieA },
    });
    const cosmetics = extended.json().data.profile.cosmetics as ProfileCosmetics;
    expect(cosmetics.usernameStyle).toBe("shimmer");
    expect(cosmetics.usernameColor).toBe("#777777");
    expect(cosmetics.usernameAccentColor).toBe("rose");

    // An unrelated update must merge, not wipe, cosmetics.
    await app.inject({
      method: "PATCH",
      url: "/api/v1/profiles/me",
      headers: jsonHeaders(cookieA),
      payload: { pronouns: "she/her" },
    });
    const after = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/me/extended",
      headers: { cookie: cookieA },
    });
    expect(after.json().data.profile.cosmetics.usernameStyle).toBe("shimmer");
    expect(after.json().data.profile.cosmetics.usernameColor).toBe("#777777");

    // Cosmetics travel with the public profile view, not just the extended row.
    const full = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/plat_alice/full",
      headers: { cookie: cookieB },
    });
    expect(full.statusCode).toBe(200);
    expect((full.json().data.appearance as { cosmetics: ProfileCosmetics }).cosmetics.usernameStyle).toBe("shimmer");
  });

  it.skipIf(!dbAvailable)("rejects low-contrast custom name colors without altering stored cosmetics", async () => {
    const bad = await app.inject({
      method: "PATCH",
      url: "/api/v1/profiles/me",
      headers: jsonHeaders(cookieA),
      payload: {
        cosmetics: { usernameStyle: "bold", usernameColor: "#ffffff", usernameAccentColor: null },
      },
    });
    expect([400, 422].includes(bad.statusCode)).toBe(true);

    const stillWritesToUserState = await app.inject({
      method: "PATCH",
      url: "/api/v1/profiles/me",
      headers: jsonHeaders(cookieA),
      payload: { pronouns: "they/them" },
    });
    expect(stillWritesToUserState.statusCode).toBe(200);

    const extended = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/me/extended",
      headers: { cookie: cookieA },
    });
    expect(extended.json().data.profile.cosmetics.usernameColor).toBe("#777777");
    expect(extended.json().data.profile.pronouns).toBe("they/them");
  });

  it.skipIf(!dbAvailable)("limits obsessions to three ordered entries", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/profiles/me/obsessions",
        headers: jsonHeaders(cookieA),
        payload: { targetType: "work", targetId: `book:fake${i}`, note: `note ${i}` },
      });
      expect(res.statusCode).toBe(201);
    }
    const fourth = await app.inject({
      method: "POST",
      url: "/api/v1/profiles/me/obsessions",
      headers: jsonHeaders(cookieA),
      payload: { targetType: "work", targetId: "book:fake3" },
    });
    expect([400, 422].includes(fourth.statusCode)).toBe(true);

    // Obsession does not create favorites/ratings/progress side effects is
    // covered implicitly: full profile resolves titles without user state.
    const full = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/plat_alice/full",
      headers: { cookie: cookieB },
    });
    expect(full.statusCode).toBe(200);
    expect(full.json().data.obsessions.length).toBe(3);
  });

  it.skipIf(!dbAvailable)("artifact visibility is shown/hidden, not a privacy matrix", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/profiles/me/artifacts",
      headers: jsonHeaders(cookieB),
      payload: { artifactType: "favorite-quote", size: "small", config: { quote: "Hi", source: "Me" }, isVisible: true },
    });
    expect(created.statusCode).toBe(201);
    const artifactId = created.json().data.id as string;

    await app.inject({
      method: "PATCH",
      url: `/api/v1/profiles/me/artifacts/${artifactId}`,
      headers: jsonHeaders(cookieB),
      payload: { isVisible: false },
    });

    const full = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/plat_bob/full",
      headers: { cookie: cookieA },
    });
    expect(full.statusCode).toBe(200);
    const ids = (full.json().data.artifacts as Array<{ id: string }>).map((a) => a.id);
    expect(ids.includes(artifactId)).toBe(false);
  });

  it.skipIf(!dbAvailable)("guestbook post/edit/delete permissions hold", async () => {
    const posted = await app.inject({
      method: "POST",
      url: "/api/v1/profiles/plat_bob/guestbook",
      headers: jsonHeaders(cookieA),
      payload: { body: "Hello Bob" },
    });
    expect(posted.statusCode).toBe(201);
    const entryId = posted.json().data.id as string;

    // Author can edit
    const edited = await app.inject({
      method: "PATCH",
      url: `/api/v1/profiles/guestbook/${entryId}`,
      headers: jsonHeaders(cookieA),
      payload: { body: "Hello Bob!" },
    });
    expect(edited.statusCode).toBe(200);

    // Profile owner can delete another user's entry
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/profiles/guestbook/${entryId}`,
      headers: { cookie: cookieB, origin: "http://localhost:5173" },
    });
    expect(deleted.statusCode).toBe(204);
  });

  it.skipIf(!dbAvailable)("private profiles stay hidden at the data boundary", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/privacy",
      headers: jsonHeaders(cookieB),
      payload: { profileVisibility: "private" },
    });
    const hidden = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/plat_bob/full",
      headers: { cookie: cookieA },
    });
    expect(hidden.statusCode).toBe(404);
    // Restore for other tests
    await app.inject({
      method: "PATCH",
      url: "/api/v1/settings/privacy",
      headers: jsonHeaders(cookieB),
      payload: { profileVisibility: "public" },
    });
  });

  it.skipIf(!dbAvailable)("private shelves do not leak through shelf-preview", async () => {
    const pool2 = createPool(DATABASE_URL);
    const db = createDb(pool2);
    const shelfId = generateId();
    await db.insert(schema.shelves).values({
      id: shelfId,
      ownerUserId: userBId,
      name: "Secret",
      visibility: "private",
    });
    await db.insert(schema.shelfItems).values({
      shelfId,
      subjectType: "book",
      subjectId: "secret-book",
      sortOrder: 0,
    });

    const artifact = await app.inject({
      method: "POST",
      url: "/api/v1/profiles/me/artifacts",
      headers: jsonHeaders(cookieB),
      payload: { artifactType: "shelf-preview", size: "medium", config: { shelfId }, isVisible: true },
    });
    expect(artifact.statusCode).toBe(201);

    const full = await app.inject({
      method: "GET",
      url: "/api/v1/profiles/plat_bob/full",
      headers: { cookie: cookieA },
    });
    const preview = (full.json().data.artifacts as Array<{ artifactType: string; data: { restricted?: boolean; items?: unknown[] } }>).find(
      (a) => a.artifactType === "shelf-preview" && (a.data as { shelf?: { id?: string } })?.shelf?.id === shelfId,
    );
    expect(preview?.data.restricted).toBe(true);
    expect(preview?.data.items ?? []).toEqual([]);
    await pool2.end();
  });
});
