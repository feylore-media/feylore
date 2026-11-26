import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  buildEndSessionUrl,
  calculatePKCECodeChallenge,
  customFetch,
  discovery,
  fetchUserInfo,
  None,
  ClientSecretPost,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  allowInsecureRequests,
  type Configuration,
  type CustomFetch,
  type DiscoveryRequestOptions,
} from "openid-client";
import { and, eq, lt } from "drizzle-orm";
import type { Database } from "../../../db/client.js";
import type { OidcConfig } from "../../../config.js";
import * as schema from "../../../db/schema.js";
import { generateId } from "../../../security/crypto.js";
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../../../../shared/errors.js";
import type { AuthService } from "../service.js";
import type { AuthorizationService } from "../../authorization/service.js";
import { ROLE_NAMES } from "../../../../shared/permissions.js";
import { issuerBoundFetch } from "./issuer-fetch.js";
import { allocateUsername } from "./username.js";

const STATE_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

export interface OidcClaims {
  sub: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
}

export interface OidcLoginResult {
  session: { token: string; expiresAt: Date };
  returnTo: string;
}

export class OidcService {
  private configCache: Configuration | null = null;
  private configCachedAt = 0;

  constructor(
    private readonly db: Database,
    private readonly oidcConfig: OidcConfig,
    private readonly auth: AuthService,
    private readonly authz: AuthorizationService,
  ) {}

  private async getClientConfig(): Promise<Configuration> {
    const now = Date.now();
    if (this.configCache && now - this.configCachedAt < DISCOVERY_TTL_MS) {
      return this.configCache;
    }

    const issuerFetch: CustomFetch = (url, options) =>
      issuerBoundFetch(url, {
        issuerOrigin: this.oidcConfig.issuerOrigin,
        allowPrivateIssuer: this.oidcConfig.allowPrivateIssuer,
        method: options.method,
        headers: options.headers,
        body:
          typeof options.body === "string" ||
          options.body instanceof URLSearchParams
            ? options.body
            : options.body == null
              ? null
              : String(options.body),
      });

    const clientAuth = this.oidcConfig.clientSecret
      ? ClientSecretPost(this.oidcConfig.clientSecret)
      : None();

    const discoveryOptions: DiscoveryRequestOptions = {
      [customFetch]: issuerFetch,
    };
    if (
      this.oidcConfig.allowPrivateIssuer &&
      this.oidcConfig.issuerOrigin.startsWith("http://")
    ) {
      discoveryOptions.execute = [allowInsecureRequests];
    }

    const config = await discovery(
      new URL(this.oidcConfig.issuerUrl),
      this.oidcConfig.clientId,
      undefined,
      clientAuth,
      discoveryOptions,
    );

    config[customFetch] = issuerFetch;
    if (
      this.oidcConfig.allowPrivateIssuer &&
      this.oidcConfig.issuerOrigin.startsWith("http://")
    ) {
      allowInsecureRequests(config);
    }
    this.configCache = config;
    this.configCachedAt = now;
    return config;
  }

  async cleanupExpiredStates(): Promise<void> {
    await this.db
      .delete(schema.oidcAuthStates)
      .where(lt(schema.oidcAuthStates.expiresAt, new Date()));
  }

  async startLogin(options?: {
    mode?: "login" | "link";
    userId?: string;
    returnTo?: string;
  }): Promise<string> {
    const mode = options?.mode ?? "login";
    if (mode === "link" && !options?.userId) {
      throw new ValidationError("userId required for link mode");
    }

    await this.cleanupExpiredStates();
    const clientConfig = await this.getClientConfig();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const state = randomState();
    const nonce = randomNonce();

    const returnTo = options?.returnTo ?? "/";
    const stateId = generateId();
    await this.db.insert(schema.oidcAuthStates).values({
      id: stateId,
      state,
      nonce,
      codeVerifier,
      mode,
      userId: options?.userId ?? null,
      returnTo,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });

    const redirectTo = buildAuthorizationUrl(clientConfig, {
      redirect_uri: this.oidcConfig.callbackUrl,
      scope: this.oidcConfig.scopes.join(" "),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });

    return redirectTo.href;
  }

  async handleCallback(
    callbackUrl: URL,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<OidcLoginResult> {
    const stateParam = callbackUrl.searchParams.get("state");
    if (!stateParam) {
      throw new UnauthorizedError("Missing OAuth state");
    }

    const stored = await this.db.query.oidcAuthStates.findFirst({
      where: eq(schema.oidcAuthStates.state, stateParam),
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedError("Invalid or expired OAuth state");
    }

    await this.db
      .delete(schema.oidcAuthStates)
      .where(eq(schema.oidcAuthStates.id, stored.id));

    const clientConfig = await this.getClientConfig();
    const tokens = await authorizationCodeGrant(clientConfig, callbackUrl, {
      pkceCodeVerifier: stored.codeVerifier,
      expectedState: stored.state,
      expectedNonce: stored.nonce,
    });

    const claims = await this.resolveClaims(clientConfig, tokens);
    const issuer = this.oidcConfig.issuerUrl;
    const providerKey = this.oidcConfig.providerKey;

    const existingIdentity = await this.db.query.userOidcIdentities.findFirst({
      where: and(
        eq(schema.userOidcIdentities.providerKey, providerKey),
        eq(schema.userOidcIdentities.issuer, issuer),
        eq(schema.userOidcIdentities.subject, claims.sub),
      ),
    });

    let userId: string;

    if (stored.mode === "link") {
      if (!stored.userId) {
        throw new ValidationError("Invalid link state");
      }
      if (existingIdentity && existingIdentity.userId !== stored.userId) {
        throw new ConflictError(
          "This OIDC identity is already linked to another account",
        );
      }
      userId = stored.userId;
      await this.upsertIdentity(userId, claims, issuer, providerKey);
    } else if (existingIdentity) {
      userId = existingIdentity.userId;
      await this.touchIdentity(existingIdentity.id, claims);
    } else if (this.oidcConfig.autoProvision) {
      userId = await this.provisionUser(claims, issuer, providerKey);
    } else {
      throw new ForbiddenError(
        "No Feylore account is linked to this identity. Contact an administrator.",
      );
    }

    const session = await this.auth.createSession(userId, meta);
    return {
      session,
      returnTo: stored.returnTo ?? "/",
    };
  }

  private async resolveClaims(
    clientConfig: Configuration,
    tokens: Awaited<ReturnType<typeof authorizationCodeGrant>>,
  ): Promise<OidcClaims> {
    const idClaims = tokens.claims();
    const sub = idClaims?.sub;
    if (!sub) throw new UnauthorizedError("OIDC token missing subject");

    let email = typeof idClaims?.email === "string" ? idClaims.email : undefined;
    let name = typeof idClaims?.name === "string" ? idClaims.name : undefined;
    let preferredUsername =
      typeof idClaims?.preferred_username === "string"
        ? idClaims.preferred_username
        : undefined;

    const accessToken = tokens.access_token;
    if (accessToken && (!email || !name)) {
      try {
        const userinfo = await fetchUserInfo(
          clientConfig,
          accessToken,
          sub,
        );
        email = email ?? (typeof userinfo.email === "string" ? userinfo.email : undefined);
        name = name ?? (typeof userinfo.name === "string" ? userinfo.name : undefined);
        preferredUsername =
          preferredUsername ??
          (typeof userinfo.preferred_username === "string"
            ? userinfo.preferred_username
            : undefined);
      } catch {
        // userinfo is optional if ID token has sufficient claims
      }
    }

    return { sub, email, name, preferredUsername };
  }

  private async provisionUser(
    claims: OidcClaims,
    issuer: string,
    providerKey: string,
  ): Promise<string> {
    if (!claims.email) {
      throw new ValidationError(
        "OIDC identity must include an email address for auto-provisioning",
      );
    }

    const emailConflict = await this.db.query.users.findFirst({
      where: eq(schema.users.email, claims.email),
    });
    if (emailConflict) {
      throw new ConflictError(
        "A Feylore account with this email already exists. Link your identity from account settings.",
      );
    }

    const userId = generateId();
    const username = await allocateUsername(this.db, {
      preferredUsername: claims.preferredUsername,
      email: claims.email,
      subject: claims.sub,
    });

    await this.db.insert(schema.users).values({
      id: userId,
      email: claims.email,
      username,
      displayName: claims.name ?? claims.preferredUsername ?? username,
      passwordHash: null,
    });
    await this.db.insert(schema.userPreferences).values({ userId });

    const memberRole = await this.db.query.roles.findFirst({
      where: eq(schema.roles.name, ROLE_NAMES.MEMBER),
    });
    if (memberRole) {
      await this.db
        .insert(schema.userRoles)
        .values({ userId, roleId: memberRole.id });
    }

    await this.upsertIdentity(userId, claims, issuer, providerKey);
    return userId;
  }

  private async upsertIdentity(
    userId: string,
    claims: OidcClaims,
    issuer: string,
    providerKey: string,
  ): Promise<void> {
    const existingForUser = await this.db.query.userOidcIdentities.findFirst({
      where: and(
        eq(schema.userOidcIdentities.userId, userId),
        eq(schema.userOidcIdentities.providerKey, providerKey),
      ),
    });

    if (existingForUser) {
      await this.db
        .update(schema.userOidcIdentities)
        .set({
          issuer,
          subject: claims.sub,
          email: claims.email ?? null,
          displayName: claims.name ?? null,
          lastLoginAt: new Date(),
        })
        .where(eq(schema.userOidcIdentities.id, existingForUser.id));
      return;
    }

    await this.db.insert(schema.userOidcIdentities).values({
      id: generateId(),
      userId,
      providerKey,
      issuer,
      subject: claims.sub,
      email: claims.email ?? null,
      displayName: claims.name ?? null,
      lastLoginAt: new Date(),
    });
  }

  private async touchIdentity(
    identityId: string,
    claims: OidcClaims,
  ): Promise<void> {
    await this.db
      .update(schema.userOidcIdentities)
      .set({
        email: claims.email ?? null,
        displayName: claims.name ?? null,
        lastLoginAt: new Date(),
      })
      .where(eq(schema.userOidcIdentities.id, identityId));
  }

  async listIdentities(userId: string) {
    const rows = await this.db.query.userOidcIdentities.findMany({
      where: eq(schema.userOidcIdentities.userId, userId),
    });
    return rows.map((row) => ({
      id: row.id,
      providerKey: row.providerKey,
      issuer: row.issuer,
      email: row.email,
      displayName: row.displayName,
      linkedAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
    }));
  }

  async countIdentities(userId: string): Promise<number> {
    const rows = await this.db.query.userOidcIdentities.findMany({
      where: eq(schema.userOidcIdentities.userId, userId),
      columns: { id: true },
    });
    return rows.length;
  }

  async unlinkIdentity(userId: string, providerKey: string): Promise<void> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (!user) throw new UnauthorizedError("User not found");

    const identityCount = await this.countIdentities(userId);
    const hasPassword = !!user.passwordHash;
    if (!hasPassword && identityCount <= 1) {
      throw new ValidationError(
        "Cannot unlink your only sign-in method. Set a password or link another identity first.",
      );
    }

    const identity = await this.db.query.userOidcIdentities.findFirst({
      where: and(
        eq(schema.userOidcIdentities.userId, userId),
        eq(schema.userOidcIdentities.providerKey, providerKey),
      ),
    });
    if (!identity) throw new ValidationError("OIDC identity not found");

    await this.db
      .delete(schema.userOidcIdentities)
      .where(eq(schema.userOidcIdentities.id, identity.id));
  }

  async getLogoutRedirectUrl(idTokenHint?: string): Promise<string | null> {
    try {
      const clientConfig = await this.getClientConfig();
      const endSession = clientConfig.serverMetadata().end_session_endpoint;
      if (!endSession) return null;
      const params: Record<string, string> = {};
      if (idTokenHint) params.id_token_hint = idTokenHint;
      const appUrl = new URL(this.oidcConfig.callbackUrl);
      params.post_logout_redirect_uri = `${appUrl.origin}/login`;
      return buildEndSessionUrl(clientConfig, params).href;
    } catch {
      return null;
    }
  }
}
