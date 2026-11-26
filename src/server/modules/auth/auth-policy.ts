import type { AuthConfig, OidcConfig } from "../../config.js";

export interface AuthPolicyUser {
  passwordHash: string | null;
}

export class AuthPolicyService {
  constructor(
    private readonly auth: AuthConfig,
    private readonly oidc?: OidcConfig,
  ) {}

  isInternalLoginEnabled(): boolean {
    return this.auth.internalEnabled;
  }

  isOidcLoginEnabled(): boolean {
    return this.auth.oidcEnabled && !!this.oidc;
  }

  /** Break-glass password login when internal auth is disabled globally. */
  isRecoveryLoginEnabled(): boolean {
    return (
      this.auth.internalRecoveryEnabled &&
      !this.auth.internalEnabled &&
      this.isOidcLoginEnabled()
    );
  }

  canPasswordLoginGlobally(): boolean {
    return this.isInternalLoginEnabled() || this.isRecoveryLoginEnabled();
  }

  canUserPasswordLogin(user: AuthPolicyUser): boolean {
    if (!user.passwordHash) return false;
    return this.canPasswordLoginGlobally();
  }

  canSetPassword(): boolean {
    return this.isInternalLoginEnabled();
  }

  isPasswordResetAvailable(smtpConfigured: boolean): boolean {
    return smtpConfigured;
  }

  canRequestPasswordReset(user: AuthPolicyUser): boolean {
    return !!user.passwordHash;
  }

  canPasswordResetEstablishPassword(user: AuthPolicyUser): boolean {
    if (user.passwordHash) return false;
    return this.canSetPassword();
  }

  canReceivePasswordReset(
    user: AuthPolicyUser,
    smtpConfigured: boolean,
  ): boolean {
    if (!this.isPasswordResetAvailable(smtpConfigured)) return false;
    return (
      this.canRequestPasswordReset(user) ||
      this.canPasswordResetEstablishPassword(user)
    );
  }

  userHasAtLeastOneAuthMethod(
    user: AuthPolicyUser,
    oidcIdentityCount: number,
  ): boolean {
    return !!user.passwordHash || oidcIdentityCount > 0;
  }

  getMethodsResponse(): {
    internal: boolean;
    oidc: boolean;
    recovery: boolean;
    oidcLabel?: string;
  } {
    return {
      internal: this.isInternalLoginEnabled(),
      oidc: this.isOidcLoginEnabled(),
      recovery: this.isRecoveryLoginEnabled(),
      oidcLabel: this.oidc?.label,
    };
  }
}
