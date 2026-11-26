import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import type { Database } from "../../src/server/db/client.js";
import * as schema from "../../src/server/db/schema.js";
import { generateId } from "../../src/server/security/crypto.js";

export async function ensureTestUser(
  db: Database,
  email: string,
  options?: { username?: string; displayName?: string; roleId?: string },
): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (existing) {
    await db
      .delete(schema.fieldOverrides)
      .where(eq(schema.fieldOverrides.setByUserId, existing.id));
    await db
      .delete(schema.userRoles)
      .where(eq(schema.userRoles.userId, existing.id));
    await db
      .delete(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, existing.id));
    await db.delete(schema.users).where(eq(schema.users.id, existing.id));
  }

  const userId = generateId();
  await db.insert(schema.users).values({
    id: userId,
    email,
    username: options?.username ?? email.split("@")[0]!,
    displayName: options?.displayName ?? "Test User",
    passwordHash: await hash("password123"),
  });

  if (options?.roleId) {
    await db.insert(schema.userRoles).values({
      userId,
      roleId: options.roleId,
    });
  }

  return userId;
}
