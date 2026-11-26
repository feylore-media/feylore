import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { createPool, createDb } from "../src/server/db/client.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/server/db/schema.js";
import { generateId } from "../src/server/security/crypto.js";
import { bootstrapRbac } from "../src/server/db/bootstrap.js";
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

describe("RBAC bootstrap repair", () => {
  let pool: ReturnType<typeof createPool>;

  beforeAll(async () => {
    if (!dbAvailable) return;
    process.env.DATABASE_URL = DATABASE_URL;
    pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await bootstrapRbac(db);
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await pool?.end();
  });

  it.skipIf(!dbAvailable)("assigns a role to users with no role assignments", async () => {
    const db = createDb(pool);
    const userId = generateId();
    const email = `bootstrap-${generateId()}@test.local`;

    await db.delete(schema.users).where(eq(schema.users.email, email));
    await db.insert(schema.users).values({
      id: userId,
      email,
      username: `boot${generateId().slice(0, 8)}`,
      displayName: "Bootstrap User",
      passwordHash: await hash("password123"),
    });

    await bootstrapRbac(db);

    const roleNames = await db
      .select({ name: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(eq(schema.userRoles.userId, userId));

    expect(roleNames.length).toBeGreaterThan(0);
    expect(roleNames.map((r) => r.name)).toContain(ROLE_NAMES.MEMBER);

    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it.skipIf(!dbAvailable)("promotes oldest user when installation has no admin", async () => {
    const db = createDb(pool);
    const adminRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    expect(adminRole).toBeTruthy();
    if (!adminRole) return;

    const userId = generateId();
    const email = `bootstrap-admin-${generateId()}@test.local`;
    await db.delete(schema.users).where(eq(schema.users.email, email));
    await db.insert(schema.users).values({
      id: userId,
      email,
      username: `badmin${generateId().slice(0, 8)}`,
      displayName: "Bootstrap Admin",
      passwordHash: await hash("password123"),
      createdAt: new Date("2020-01-01"),
    });

    await db
      .delete(schema.userRoles)
      .where(eq(schema.userRoles.roleId, adminRole.id));

    await bootstrapRbac(db);

    const roles = await db
      .select({ name: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(eq(schema.userRoles.userId, userId));

    expect(roles.map((r) => r.name)).toContain(ROLE_NAMES.ADMIN);

    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await bootstrapRbac(db);
  });
});
