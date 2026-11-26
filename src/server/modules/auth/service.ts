import { hash, verify } from "@node-rs/argon2";
import { eq, count, and, ne, gt, desc } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  generateId,
  generateSessionToken,
  hashSessionToken,
} from "../../security/crypto.js";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../../shared/errors.js";
import type { AuthorizationService } from "../authorization/service.js";
import type { DeviceService } from "../downloads/service.js";
import { ROLE_NAMES } from "../../../shared/permissions.js";
import { bootstrapRbac } from "../../db/bootstrap.js";

const SESSION_COOKIE = "feylore_session";
const SESSION_DAYS = 30;

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly sessionSecret: string,
    private readonly authz: AuthorizationService,
    private readonly devices: DeviceService,
  ) {}

  async userCount(): Promise<number> {
    const [row] = await this.db.select({ count: count() }).from(schema.users);
    return row?.count ?? 0;
  }

  async setup(input: {
    email: string;
    username: string;
    displayName: string;
    password: string;
    locale?: string;
  }) {
    const total = await this.userCount();
    if (total > 0) throw new ValidationError("Setup already completed");

    await bootstrapRbac(this.db);

    const passwordHash = await hash(input.password);
    const userId = generateId();

    await this.db.insert(schema.users).values({
      id: userId,
      email: input.email,
      username: input.username,
      displayName: input.displayName,
      passwordHash,
      locale: input.locale ?? "en",
    });

    await this.db.insert(schema.userPreferences).values({ userId });

    const adminRole = await this.db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.ADMIN),
    });
    if (adminRole) {
      await this.db
        .insert(schema.userRoles)
        .values({ userId, roleId: adminRole.id });
    }

    return this.createSession(userId);
  }

  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ip?: string; deviceId?: string },
  ) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError("Invalid credentials");
    }

    if (user.disabledAt) {
      throw new UnauthorizedError("Account is disabled");
    }

    const valid = await verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedError("Invalid credentials");

    return this.createSession(user.id, meta);
  }

  async createSession(
    userId: string,
    meta?: { userAgent?: string; ip?: string; deviceId?: string },
  ) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (!user) throw new UnauthorizedError("User not found");
    if (user.disabledAt) {
      throw new UnauthorizedError("Account is disabled");
    }

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token, this.sessionSecret);
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    const sessionId = generateId();

    let linkedDeviceId: string | undefined;
    if (meta?.deviceId) {
      try {
        const device = await this.devices.getForUser(meta.deviceId, userId);
        linkedDeviceId = device.id;
        await this.devices.touch(device.id);
      } catch {
        linkedDeviceId = undefined;
      }
    }

    await this.db.insert(schema.sessions).values({
      id: sessionId,
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ip,
      deviceId: linkedDeviceId,
    });

    return { token, expiresAt, sessionId };
  }

  async logout(token: string) {
    const tokenHash = hashSessionToken(token, this.sessionSecret);
    await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.tokenHash, tokenHash));
  }

  async resolveSession(token: string | undefined) {
    if (!token) return null;
    const tokenHash = hashSessionToken(token, this.sessionSecret);
    const session = await this.db.query.sessions.findFirst({
      where: eq(schema.sessions.tokenHash, tokenHash),
    });
    if (!session || session.expiresAt < new Date()) return null;

    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, session.userId),
    });
    if (!user) return null;

    if (user.disabledAt) return null;

    const permissions = await this.authz.loadUserPermissions(user.id);
    const roleNames = await this.authz.loadUserRoleNames(user.id);

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      locale: user.locale,
      theme: user.theme,
      permissions,
      roleNames,
      sessionId: session.id,
    };
  }

  get cookieName() {
    return SESSION_COOKIE;
  }

  async changePassword(
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
  ) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (!user) throw new UnauthorizedError("User not found");

    if (user.passwordHash) {
      if (!currentPassword) {
        throw new ValidationError("Current password is required");
      }
      const valid = await verify(user.passwordHash, currentPassword);
      if (!valid) throw new UnauthorizedError("Current password is incorrect");
    }

    const passwordHash = await hash(newPassword);
    await this.db
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  async userHasPassword(userId: string): Promise<boolean> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { passwordHash: true },
    });
    return !!user?.passwordHash;
  }

  async listSessions(userId: string, currentSessionId: string) {
    const now = new Date();
    const rows = await this.db
      .select({
        id: schema.sessions.id,
        userAgent: schema.sessions.userAgent,
        ipAddress: schema.sessions.ipAddress,
        deviceId: schema.sessions.deviceId,
        deviceName: schema.devices.name,
        createdAt: schema.sessions.createdAt,
        expiresAt: schema.sessions.expiresAt,
      })
      .from(schema.sessions)
      .leftJoin(
        schema.devices,
        eq(schema.sessions.deviceId, schema.devices.id),
      )
      .where(
        and(
          eq(schema.sessions.userId, userId),
          gt(schema.sessions.expiresAt, now),
        ),
      )
      .orderBy(desc(schema.sessions.createdAt));

    return rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      deviceId: row.deviceId,
      deviceName: row.deviceName ?? null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      isCurrent: row.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.db.query.sessions.findFirst({
      where: and(
        eq(schema.sessions.id, sessionId),
        eq(schema.sessions.userId, userId),
      ),
    });
    if (!session) throw new NotFoundError("Session not found");
    await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
  }

  async revokeOtherSessions(userId: string, currentSessionId: string) {
    await this.db
      .delete(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, userId),
          ne(schema.sessions.id, currentSessionId),
        ),
      );
  }

  async revokeAllSessionsForUser(userId: string) {
    await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
  }
}
