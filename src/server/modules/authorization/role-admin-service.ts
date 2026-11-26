import { eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import {
  ALL_PERMISSIONS,
  ROLE_NAMES,
  type Permission,
} from "../../../shared/permissions.js";

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  permissions: string[];
}

export class RoleAdminService {
  constructor(private readonly db: Database) {}

  private async loadPermissionsForRole(roleId: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: schema.permissions.key })
      .from(schema.rolePermissions)
      .innerJoin(
        schema.permissions,
        eq(schema.rolePermissions.permissionId, schema.permissions.id),
      )
      .where(eq(schema.rolePermissions.roleId, roleId));
    return rows.map((r) => r.key);
  }

  async listRolesWithPermissions(): Promise<RoleWithPermissions[]> {
    const roles = await this.db.select().from(schema.roles);
    const result: RoleWithPermissions[] = [];
    for (const role of roles) {
      result.push({
        ...role,
        permissions: await this.loadPermissionsForRole(role.id),
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getRole(name: string): Promise<RoleWithPermissions> {
    const role = await this.db.query.roles.findFirst({
      where: eq(schema.roles.name, name),
    });
    if (!role) throw new NotFoundError("Role not found");

    return {
      ...role,
      permissions: await this.loadPermissionsForRole(role.id),
    };
  }

  async setRolePermissions(
    roleName: string,
    permissionKeys: string[],
  ): Promise<RoleWithPermissions> {
    if (roleName === ROLE_NAMES.ADMIN) {
      throw new ForbiddenError("Admin role permissions cannot be modified");
    }

    const role = await this.db.query.roles.findFirst({
      where: eq(schema.roles.name, roleName),
    });
    if (!role) throw new NotFoundError("Role not found");

    const uniqueKeys = [...new Set(permissionKeys)];
    const invalid = uniqueKeys.filter(
      (key) => !ALL_PERMISSIONS.includes(key as Permission),
    );
    if (invalid.length > 0) {
      throw new ValidationError("Unknown permission keys", { invalid });
    }

    const permissionRows =
      uniqueKeys.length > 0
        ? await this.db
            .select({ id: schema.permissions.id, key: schema.permissions.key })
            .from(schema.permissions)
            .where(inArray(schema.permissions.key, uniqueKeys))
        : [];

    if (permissionRows.length !== uniqueKeys.length) {
      throw new ValidationError("One or more permission keys were not found");
    }

    await this.db
      .delete(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, role.id));

    for (const perm of permissionRows) {
      await this.db.insert(schema.rolePermissions).values({
        roleId: role.id,
        permissionId: perm.id,
      });
    }

    return this.getRole(roleName);
  }
}
