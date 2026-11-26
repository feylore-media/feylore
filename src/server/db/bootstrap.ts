import { asc, count, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import * as schema from "./schema.js";
import { seed } from "./seed.js";
import { ROLE_NAMES } from "../../shared/permissions.js";

/**
 * Ensures RBAC seed data exists and repairs common bootstrap failures:
 * - first user created before roles were seeded
 * - installation left without any admin
 * - users with no role assignments
 */
export async function bootstrapRbac(db: Database) {
  await seed(db);

  const adminRole = await db.query.roles.findFirst({
    where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
  });
  if (!adminRole) return;

  const memberRole = await db.query.roles.findFirst({
    where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
  });

  const [userCountRow] = await db
    .select({ count: count() })
    .from(schema.users);
  const userCount = userCountRow?.count ?? 0;
  if (userCount === 0) return;

  const [adminCountRow] = await db
    .select({ count: count() })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.roleId, adminRole.id));
  const adminCount = adminCountRow?.count ?? 0;

  if (adminCount === 0) {
    const [oldest] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .orderBy(asc(schema.users.createdAt))
      .limit(1);
    if (oldest) {
      await db
        .insert(schema.userRoles)
        .values({ userId: oldest.id, roleId: adminRole.id })
        .onConflictDoNothing();
    }
  }

  const usersWithRoles = await db
    .selectDistinct({ userId: schema.userRoles.userId })
    .from(schema.userRoles);
  const assignedIds = new Set(usersWithRoles.map((row) => row.userId));

  const allUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .orderBy(asc(schema.users.createdAt));

  for (const user of allUsers) {
    if (assignedIds.has(user.id)) continue;
    const roleId =
      userCount === 1 ? adminRole.id : memberRole?.id ?? adminRole.id;
    await db
      .insert(schema.userRoles)
      .values({ userId: user.id, roleId })
      .onConflictDoNothing();
  }
}
