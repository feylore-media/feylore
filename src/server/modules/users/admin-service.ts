import { hash } from "@node-rs/argon2";
import { and, count, eq, max, ne, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors.js";
import {
  ELEVATED_ROLES,
  RESTRICTIVE_ROLES,
  ROLE_NAMES,
} from "../../../shared/permissions.js";
import type { AuthorizationService } from "../authorization/service.js";
import type { ProfileService } from "./profile-service.js";
import type { ApplicationConfigService } from "../settings/application-config-service.js";

export interface AdminUserSummary {
  id: string;
  email: string;
  username: string;
  displayName: string;
  disabledAt: Date | null;
  roleNames: string[];
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface AdminUserDetail extends AdminUserSummary {
  hasPassword: boolean;
  oidcIdentityCount: number;
}

function roleCombinationWarnings(roleNames: string[]): string[] {
  const warnings: string[] = [];
  const hasElevated = roleNames.some((r) =>
    ELEVATED_ROLES.includes(r as (typeof ELEVATED_ROLES)[number]),
  );
  const hasRestrictive = roleNames.some((r) =>
    RESTRICTIVE_ROLES.includes(r as (typeof RESTRICTIVE_ROLES)[number]),
  );
  if (hasElevated && hasRestrictive) {
    warnings.push(
      "Restrictive and elevated roles combined; effective grants are a union.",
    );
  }
  return warnings;
}

export class UserAdminService {
  constructor(
    private readonly db: Database,
    private readonly authz: AuthorizationService,
    private readonly profiles: ProfileService,
    private readonly applicationConfig: ApplicationConfigService,
  ) {}

  private async loadRoleNames(userId: string): Promise<string[]> {
    return this.authz.loadUserRoleNames(userId);
  }

  private async countAdmins(excludeUserId?: string): Promise<number> {
    const adminRole = await this.db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (!adminRole) return 0;

    const conditions = [eq(schema.userRoles.roleId, adminRole.id)];
    if (excludeUserId) {
      conditions.push(ne(schema.userRoles.userId, excludeUserId));
    }

    const [row] = await this.db
      .select({ count: count() })
      .from(schema.userRoles)
      .where(and(...conditions));
    return row?.count ?? 0;
  }

  private async userHasAdminRole(userId: string): Promise<boolean> {
    const roleNames = await this.loadRoleNames(userId);
    return roleNames.includes(ROLE_NAMES.ADMIN);
  }

  private assertNotSelf(actorId: string, targetId: string, action: string) {
    if (actorId === targetId) {
      throw new ForbiddenError(`Cannot ${action} your own account`);
    }
  }

  private async assertCanRemoveAdmin(
    targetUserId: string,
    newRoleNames: string[],
  ) {
    const currentlyAdmin = await this.userHasAdminRole(targetUserId);
    const willBeAdmin = newRoleNames.includes(ROLE_NAMES.ADMIN);
    if (currentlyAdmin && !willBeAdmin) {
      const otherAdmins = await this.countAdmins(targetUserId);
      if (otherAdmins === 0) {
        throw new ForbiddenError("Cannot remove admin role from the last admin");
      }
    }
  }

  private async assertCanDeleteAdmin(targetUserId: string) {
    if (await this.userHasAdminRole(targetUserId)) {
      const otherAdmins = await this.countAdmins(targetUserId);
      if (otherAdmins === 0) {
        throw new ForbiddenError("Cannot delete the last admin");
      }
    }
  }

  private async assertUniqueEmail(email: string, excludeUserId?: string) {
    const existing = await this.db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (existing && existing.id !== excludeUserId) {
      throw new ConflictError("Email is already in use");
    }
  }

  private async assertUniqueUsername(username: string, excludeUserId?: string) {
    const normalized = username.toLowerCase();
    const existing = await this.db.query.users.findFirst({
      where: sql`lower(${schema.users.username}) = ${normalized}`,
    });
    if (existing && existing.id !== excludeUserId) {
      throw new ConflictError("Username is already in use");
    }
  }

  private async assignRoles(userId: string, roleNames: string[]) {
    await this.db
      .delete(schema.userRoles)
      .where(eq(schema.userRoles.userId, userId));

    for (const roleName of roleNames) {
      const role = await this.db.query.roles.findFirst({
        where: eq(schema.roles.name, roleName),
      });
      if (role) {
        await this.db
          .insert(schema.userRoles)
          .values({ userId, roleId: role.id });
      }
    }
  }

  private async revokeAllSessions(userId: string) {
    await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
  }

  async listUsers(): Promise<AdminUserSummary[]> {
    const rows = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        username: schema.users.username,
        displayName: schema.users.displayName,
        disabledAt: schema.users.disabledAt,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .orderBy(schema.users.username);

    const loginRows = await this.db
      .select({
        userId: schema.sessions.userId,
        lastLoginAt: max(schema.sessions.createdAt),
      })
      .from(schema.sessions)
      .groupBy(schema.sessions.userId);
    const lastLoginByUser = new Map(
      loginRows.map((row) => [row.userId, row.lastLoginAt]),
    );

    const result: AdminUserSummary[] = [];
    for (const row of rows) {
      result.push({
        ...row,
        roleNames: await this.loadRoleNames(row.id),
        lastLoginAt: lastLoginByUser.get(row.id) ?? null,
      });
    }
    return result;
  }

  async getUser(id: string): Promise<AdminUserDetail> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
    if (!user) throw new NotFoundError("User not found");

    const [oidcRow] = await this.db
      .select({ count: count() })
      .from(schema.userOidcIdentities)
      .where(eq(schema.userOidcIdentities.userId, id));

    const [loginRow] = await this.db
      .select({ lastLoginAt: max(schema.sessions.createdAt) })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, id));

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      disabledAt: user.disabledAt,
      createdAt: user.createdAt,
      roleNames: await this.loadRoleNames(id),
      lastLoginAt: loginRow?.lastLoginAt ?? null,
      hasPassword: Boolean(user.passwordHash),
      oidcIdentityCount: oidcRow?.count ?? 0,
    };
  }

  async createUser(
    input: {
      email: string;
      username: string;
      displayName: string;
      password?: string;
      roleNames?: string[];
      locale?: string;
    },
    _actorId: string,
  ) {
    const username = this.profiles.validateUsernameForCreate(input.username);
    await this.assertUniqueEmail(input.email);
    await this.assertUniqueUsername(username);

    const roleNames = input.roleNames ?? [ROLE_NAMES.MEMBER];
    const locale =
      input.locale ?? (await this.applicationConfig.getDefaultLocale());

    const userId = generateId();
    const passwordHash = input.password ? await hash(input.password) : null;

    await this.db.insert(schema.users).values({
      id: userId,
      email: input.email,
      username,
      displayName: input.displayName,
      passwordHash,
      locale,
    });
    await this.db.insert(schema.userPreferences).values({ userId });
    await this.assignRoles(userId, roleNames);

    return {
      id: userId,
      warnings: roleCombinationWarnings(roleNames),
    };
  }

  async updateUser(
    id: string,
    input: {
      email?: string;
      username?: string;
      displayName?: string;
      password?: string;
    },
    _actorId: string,
  ) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
    if (!user) throw new NotFoundError("User not found");

    const updates: Partial<typeof schema.users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.email !== undefined) {
      await this.assertUniqueEmail(input.email, id);
      updates.email = input.email;
    }
    if (input.username !== undefined) {
      const username = this.profiles.validateUsernameForCreate(input.username);
      await this.assertUniqueUsername(username, id);
      updates.username = username;
    }
    if (input.displayName !== undefined) {
      updates.displayName = input.displayName;
    }
    if (input.password !== undefined) {
      updates.passwordHash = await hash(input.password);
    }

    if (Object.keys(updates).length > 1) {
      await this.db
        .update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, id));
    }

    return this.getUser(id);
  }

  async setDisabled(id: string, disabled: boolean, actorId: string) {
    this.assertNotSelf(actorId, id, disabled ? "disable" : "enable");

    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
    if (!user) throw new NotFoundError("User not found");

    if (disabled) {
      await this.assertCanDeleteAdmin(id);
    }

    await this.db
      .update(schema.users)
      .set({
        disabledAt: disabled ? new Date() : null,
        disabledByUserId: disabled ? actorId : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id));

    if (disabled) {
      await this.revokeAllSessions(id);
    }

    return this.getUser(id);
  }

  async deleteUser(id: string, actorId: string) {
    this.assertNotSelf(actorId, id, "delete");
    await this.assertCanDeleteAdmin(id);

    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
    if (!user) throw new NotFoundError("User not found");

    await this.db.delete(schema.users).where(eq(schema.users.id, id));
  }

  async setUserRoles(userId: string, roleNames: string[], _actorId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (!user) throw new NotFoundError("User not found");

    if (roleNames.length === 0) {
      throw new ValidationError("At least one role is required");
    }

    await this.assertCanRemoveAdmin(userId, roleNames);
    await this.assignRoles(userId, roleNames);

    return {
      user: await this.getUser(userId),
      warnings: roleCombinationWarnings(roleNames),
    };
  }
}
