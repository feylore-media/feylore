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
import { ROLE_NAMES, PERMISSIONS } from "../src/shared/permissions.js";
import { JOB_TYPES } from "../src/server/modules/jobs/types.js";

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

describe("People metadata editing", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let pool: Awaited<ReturnType<typeof buildApp>>["pool"];
  let adminCookie = "";
  let memberCookie = "";
  let storageRoot = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "test-session-secret-min-16-chars";
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-people-edit-"));

    try {
      pool = createPool(DATABASE_URL);
      const db = createDb(pool);
      await migrate(db, { migrationsFolder: "./drizzle" });
      await seed(db);
    } catch {
      console.warn(
        "PostgreSQL unavailable — skipping integration tests. Run: docker compose -f docker-compose.dev.yml up -d",
      );
      return;
    }

    const built = await buildApp();
    app = built.app;
    pool = built.pool;

    const db2 = createDb(pool);
    const adminId = generateId();
    const memberId = generateId();

    const existingAdmin = await db2.query.users.findFirst({
      where: eq(schema.users.email, "admin@people-edit.local"),
    });
    const existingMember = await db2.query.users.findFirst({
      where: eq(schema.users.email, "member@people-edit.local"),
    });
    if (existingAdmin) {
      await db2
        .delete(schema.fieldOverrides)
        .where(eq(schema.fieldOverrides.setByUserId, existingAdmin.id));
      await db2
        .delete(schema.metadataFieldProvenance)
        .where(
          eq(schema.metadataFieldProvenance.updatedByUserId, existingAdmin.id),
        );
    }
    if (existingMember) {
      await db2
        .delete(schema.fieldOverrides)
        .where(eq(schema.fieldOverrides.setByUserId, existingMember.id));
    }
    await db2.delete(schema.users).where(eq(schema.users.email, "admin@people-edit.local"));
    await db2.delete(schema.users).where(eq(schema.users.email, "member@people-edit.local"));
    await db2.insert(schema.users).values({
      id: adminId,
      email: "admin@people-edit.local",
      username: "peditadmin",
      displayName: "Pedit Admin",
      passwordHash: await hash("password123"),
    });
    await db2.insert(schema.users).values({
      id: memberId,
      email: "member@people-edit.local",
      username: "peditmember",
      displayName: "Pedit Member",
      passwordHash: await hash("password123"),
    });
    const adminRole = await db2.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    const memberRole = await db2.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (adminRole) {
      await db2.insert(schema.userRoles).values({ userId: adminId, roleId: adminRole.id });
    }
    if (memberRole) {
      await db2.insert(schema.userRoles).values({ userId: memberId, roleId: memberRole.id });
    }

    const login = async (email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: {
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { email, password: "password123" },
      });
      return res.headers["set-cookie"]?.toString() ?? "";
    };
    adminCookie = await login("admin@people-edit.local");
    memberCookie = await login("member@people-edit.local");
  }, 60000);

  afterAll(async () => {
    if (!dbAvailable) return;
    await app?.close();
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  async function createPerson(name: string): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/books",
      headers: {
        cookie: adminCookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      payload: { title: `Book by ${name}`, authors: [name] },
    });
    expect(res.statusCode).toBe(201);
    const db = createDb(pool);
    const person = await db.query.people.findFirst({
      where: eq(schema.people.name, name),
    });
    expect(person, `person row for ${name} exists`).toBeDefined();
    return person!.id;
  }

  async function personSlug(personId: string): Promise<string> {
    const db = createDb(pool);
    const person = await db.query.people.findFirst({
      where: eq(schema.people.id, personId),
    });
    return person!.slug;
  }

  it.skipIf(!dbAvailable)(
    "admin can set a canonical field with a lock and provenance",
    async () => {
      const personId = await createPerson("Author Alice");
      const slug = await personSlug(personId);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/people/${slug}/metadata`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { field: "bio", value: "A test biography." },
      });
      expect(res.statusCode).toBe(200);

      const db = createDb(pool);
      const person = await db.query.people.findFirst({
        where: eq(schema.people.id, personId),
      });
      expect(person?.bio).toBe("A test biography.");

      const override = await db
        .select({ value: schema.fieldOverrides.value })
        .from(schema.fieldOverrides)
        .where(
          and(
            eq(schema.fieldOverrides.subjectType, "person"),
            eq(schema.fieldOverrides.subjectId, personId),
            eq(schema.fieldOverrides.field, "bio"),
          ),
        );
      expect(override.length).toBe(1);
      expect(override[0]?.value).toBe("A test biography.");

      const provenance = await db
        .select({ origin: schema.metadataFieldProvenance.origin })
        .from(schema.metadataFieldProvenance)
        .where(
          and(
            eq(schema.metadataFieldProvenance.subjectType, "person"),
            eq(schema.metadataFieldProvenance.subjectId, personId),
            eq(schema.metadataFieldProvenance.field, "bio"),
          ),
        );
      expect(provenance[0]?.origin).toBe("edit");
    },
  );

  it.skipIf(!dbAvailable)(
    "rejects direct portrait writes through the metadata field endpoint",
    async () => {
      const personId = await createPerson("Author Photo Case");
      const slug = await personSlug(personId);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/people/${slug}/metadata`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { field: "photo", value: "1970-12-25" },
      });
      expect(res.statusCode).toBe(422);
    },
  );

  it.skipIf(!dbAvailable)(
    "bulk field edits apply commaList parsing and empty clearing",
    async () => {
      const personId = await createPerson("Author Bulk Edits");
      const slug = await personSlug(personId);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/people/${slug}/metadata/fields`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: {
          fields: [
            { fieldId: "alternateNames", value: "Alias One, Alias Two" },
            { fieldId: "pronouns", value: "they/them" },
          ],
        },
      });
      expect(res.statusCode).toBe(200);

      const db = createDb(pool);
      const person = await db.query.people.findFirst({
        where: eq(schema.people.id, personId),
      });
      expect(person?.alternateNames).toEqual(["Alias One", "Alias Two"]);
      expect(person?.pronouns).toBe("they/them");
    },
  );

  it.skipIf(!dbAvailable)(
    "members cannot write person metadata",
    async () => {
      const personId = await createPerson("Author Private");
      const slug = await personSlug(personId);
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/people/${slug}/metadata`,
        headers: {
          cookie: memberCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { field: "bio", value: "nope" },
      });
      expect(res.statusCode).toBe(403);
    },
  );

  it.skipIf(!dbAvailable)(
    "editor payload lists portrait first with enabled provider columns",
    async () => {
      const personId = await createPerson("Author Editor Shape");
      const slug = await personSlug(personId);
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/people/${slug}/metadata/editor`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
        },
      });
      expect(res.statusCode).toBe(200);
      const editor = res.json().data as {
        person: { name: string };
        providerSources: { key: string }[];
        fields: { id: string }[];
      };
      expect(editor.person.name).toBe("Author Editor Shape");
      expect(editor.fields[0]?.id).toBe("photo");
      expect(editor.providerSources.map((s) => s.key)).toContain("wikidata");
    },
  );

  it.skipIf(!dbAvailable)(
    "unlocking a field clears the override but keeps the value",
    async () => {
      const personId = await createPerson("Author Lock Cycle");
      const slug = await personSlug(personId);

      await app.inject({
        method: "PATCH",
        url: `/api/v1/people/${slug}/metadata`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { field: "birthPlace", value: "London" },
      });

      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/people/${slug}/metadata/birthPlace`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
        },
      });
      expect(del.statusCode).toBe(200);

      const db = createDb(pool);
      const person = await db.query.people.findFirst({
        where: eq(schema.people.id, personId),
      });
      expect(person?.birthPlace).toBe("London");
      const override = await db
        .select({ field: schema.fieldOverrides.field })
        .from(schema.fieldOverrides)
        .where(
          and(
            eq(schema.fieldOverrides.subjectType, "person"),
            eq(schema.fieldOverrides.subjectId, personId),
            eq(schema.fieldOverrides.field, "birthPlace"),
          ),
        );
      expect(override.length).toBe(0);
    },
  );

  it.skipIf(!dbAvailable)(
    "fetch route requires write permission and enqueues a person metadata job",
    async () => {
      const personId = await createPerson("Author Fetch Job");
      const slug = await personSlug(personId);

      const memberRes = await app.inject({
        method: "POST",
        url: `/api/v1/people/${slug}/metadata/fetch`,
        headers: {
          cookie: memberCookie,
          origin: "http://localhost:5173",
        },
      });
      expect(memberRes.statusCode).toBe(403);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/people/${slug}/metadata/fetch`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
        },
      });
      expect(res.statusCode).toBe(202);
      const { jobId } = res.json().data as { jobId: string };

      const db = createDb(pool);
      const job = await db.query.jobRuns.findFirst({
        where: eq(schema.jobRuns.id, jobId),
      });
      expect(job).toBeDefined();
      expect(job?.type).toBe(JOB_TYPES.PERSON_METADATA_FETCH);
      expect(job?.payload?.personId).toBe(personId);
    },
  );

  it.skipIf(!dbAvailable)(
    "merging a person moves credits and deletes the source row",
    async () => {
      const sourceId = await createPerson("Author Merge Source");
      const targetId = await createPerson("Author Merge Target");
      const slug = await personSlug(targetId);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/people/${slug}/merge`,
        headers: {
          cookie: adminCookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        payload: { duplicatePeopleId: sourceId },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json().data as { movedCredits: number }).movedCredits).toBeGreaterThan(0);

      const db = createDb(pool);
      const source = await db.query.people.findFirst({
        where: eq(schema.people.id, sourceId),
      });
      expect(source).toBeUndefined();
      const credits = await db
        .select({ peopleId: schema.personCredits.peopleId })
        .from(schema.personCredits)
        .where(eq(schema.personCredits.peopleId, targetId));
      expect(credits.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(!dbAvailable)(
    "PEOPLE_WRITE is granted to curator and admin roles but not member",
    async () => {
      const db = createDb(pool);
      const peopleWritePerm = await db.query.permissions.findFirst({
        where: eq(schema.permissions.key, PERMISSIONS.PEOPLE_WRITE),
      });
      expect(peopleWritePerm).toBeDefined();
      const curatorRole = await db.query.roles.findFirst({
        where: eq(schema.roles.name, ROLE_NAMES.CURATOR),
      });
      const adminRole = await db.query.roles.findFirst({
        where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
      });
      const memberRole = await db.query.roles.findFirst({
        where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
      });
      const curatorGrant = curatorRole
        ? await db.query.rolePermissions.findFirst({
            where: and(
              eq(schema.rolePermissions.roleId, curatorRole.id),
              eq(schema.rolePermissions.permissionId, peopleWritePerm!.id),
            ),
          })
        : null;
      const memberGrant = memberRole
        ? await db.query.rolePermissions.findFirst({
            where: and(
              eq(schema.rolePermissions.roleId, memberRole.id),
              eq(schema.rolePermissions.permissionId, peopleWritePerm!.id),
            ),
          })
        : null;
      expect(curatorGrant).toBeDefined();
      expect(memberGrant).toBeUndefined();
      if (adminRole) {
        const adminGrants = await db.query.rolePermissions.findMany({
          where: eq(schema.rolePermissions.roleId, adminRole.id),
        });
        const permIds = adminGrants.map((g) => g.permissionId);
        expect(permIds).toContain(peopleWritePerm!.id);
      }
    },
  );
});