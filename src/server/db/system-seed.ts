import { eq, and } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Database } from "./client.js";
import * as schema from "./schema.js";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from "../../shared/permissions.js";
import { NOTIFICATION_TYPE_LIST } from "../../shared/notifications.js";
import { seedMetadataFormatting } from "./seed-formatting.js";
import { seedRatings } from "./seed-ratings.js";

export async function initializeSystemRecords(database: Database) {
  for (const key of ALL_PERMISSIONS) {
    const existing = await database.query.permissions.findFirst({
      where: eq(schema.permissions.key, key),
    });
    if (!existing) {
      await database
        .insert(schema.permissions)
        .values({ id: uuidv7(), key })
        .onConflictDoNothing({ target: schema.permissions.key });
    }
  }

  const allPerms = await database.select().from(schema.permissions);
  const permByKey = new Map(allPerms.map((p) => [p.key, p]));

  for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSIONS)) {
    let role = await database.query.roles.findFirst({
      where: eq(schema.roles.name, roleName),
    });
    if (!role) {
      const [inserted] = await database
        .insert(schema.roles)
        .values({
          id: uuidv7(),
          name: roleName,
          description: `${roleName} role`,
        })
        .returning();
      role = inserted;
    }

    for (const permKey of permKeys) {
      const perm = permByKey.get(permKey);
      if (!perm) continue;
      const existing = await database
        .select()
        .from(schema.rolePermissions)
        .where(
          and(
            eq(schema.rolePermissions.roleId, role.id),
            eq(schema.rolePermissions.permissionId, perm.id),
          ),
        )
        .limit(1);
      if (existing.length === 0) {
        await database.insert(schema.rolePermissions).values({
          roleId: role.id,
          permissionId: perm.id,
        });
      }
    }
  }

  for (const def of NOTIFICATION_TYPE_LIST) {
    await database
      .insert(schema.notificationTypes)
      .values({
        key: def.key,
        labelKey: def.labelKey,
        description: def.description,
        category: def.category,
        defaultEnabled: true,
      })
      .onConflictDoNothing({ target: schema.notificationTypes.key });
  }

  await seedMetadataFormatting(database);
  await seedRatings(database);
}
