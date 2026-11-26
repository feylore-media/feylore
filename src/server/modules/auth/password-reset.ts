import { eq, and, isNull, gt } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  generateId,
  generateSessionToken,
  hashResetToken,
} from "../../security/crypto.js";
import { ForbiddenError, ValidationError } from "../../../shared/errors.js";
import type { AuthService } from "./service.js";
import type { AuthPolicyService } from "./auth-policy.js";
import type { MailService } from "../mail/service.js";

const RESET_TTL_MS = 60 * 60 * 1000;

export class PasswordResetService {
  constructor(
    private readonly db: Database,
    private readonly sessionSecret: string,
    private readonly appUrl: string | undefined,
    private readonly auth: AuthService,
    private readonly authPolicy: AuthPolicyService,
    private readonly mail: MailService,
  ) {}

  async requestReset(email: string): Promise<void> {
    if (!this.mail.isConfigured()) return;

    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (!user) return;

    const policyUser = { passwordHash: user.passwordHash };
    if (!this.authPolicy.canReceivePasswordReset(policyUser, true)) {
      return;
    }

    const token = generateSessionToken();
    const tokenHash = hashResetToken(token, this.sessionSecret);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    await this.db.insert(schema.passwordResetTokens).values({
      id: generateId(),
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const base = this.appUrl?.replace(/\/$/, "") ?? "http://localhost:5173";
    const resetUrl = `${base}/auth/reset-password?token=${encodeURIComponent(token)}`;

    await this.mail.sendPasswordResetEmail({
      to: user.email,
      resetUrl,
    });
  }

  async confirmReset(token: string, newPassword: string): Promise<void> {
    if (!this.mail.isConfigured()) {
      throw new ForbiddenError("Password reset is not available");
    }

    const tokenHash = hashResetToken(token, this.sessionSecret);
    const now = new Date();

    const row = await this.db.query.passwordResetTokens.findFirst({
      where: and(
        eq(schema.passwordResetTokens.tokenHash, tokenHash),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, now),
      ),
    });
    if (!row) {
      throw new ValidationError("Invalid or expired reset token");
    }

    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, row.userId),
    });
    if (!user) {
      throw new ValidationError("Invalid or expired reset token");
    }

    const policyUser = { passwordHash: user.passwordHash };
    const mayReset = user.passwordHash
      ? this.authPolicy.canRequestPasswordReset(policyUser)
      : this.authPolicy.canPasswordResetEstablishPassword(policyUser);
    if (!mayReset) {
      throw new ForbiddenError("Password reset is not available for this account");
    }

    const passwordHash = await hash(newPassword);
    await this.db
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));

    await this.db
      .update(schema.passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(schema.passwordResetTokens.id, row.id));

    await this.auth.revokeAllSessionsForUser(user.id);
  }
}
