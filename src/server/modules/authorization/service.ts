import type { Permission } from "../../../shared/permissions.js";
import { ForbiddenError } from "../../../shared/errors.js";
import type { Database } from "../../db/client.js";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema.js";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  locale: string;
  permissions: Set<Permission>;
  roleNames: string[];
  sessionId: string;
}

export class AuthorizationService {
  constructor(private readonly db: Database) {}

  async loadUserPermissions(userId: string): Promise<Set<Permission>> {
    const rows = await this.db
      .select({ key: schema.permissions.key })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .innerJoin(
        schema.rolePermissions,
        eq(schema.roles.id, schema.rolePermissions.roleId),
      )
      .innerJoin(
        schema.permissions,
        eq(schema.rolePermissions.permissionId, schema.permissions.id),
      )
      .where(eq(schema.userRoles.userId, userId));

    return new Set(rows.map((r) => r.key as Permission));
  }

  async loadUserRoleNames(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(eq(schema.userRoles.userId, userId));
    return rows.map((r) => r.name);
  }

  can(user: AuthUser | null, permission: Permission): boolean {
    if (!user) return false;
    return user.permissions.has(permission);
  }

  require(user: AuthUser | null, permission: Permission): void {
    if (!this.can(user, permission)) {
      throw new ForbiddenError();
    }
  }
}
