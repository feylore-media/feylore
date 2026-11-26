# Authentication

Feylore supports **local email/password** and **OpenID Connect (OIDC)** authentication. Both paths converge on the same application session model: an opaque `feylore_session` cookie backed by PostgreSQL.

**Architectural boundary:** The IdP proves identity. Feylore owns the user record, session, roles, permissions, and all application authorization. OIDC groups or roles are never mapped into Feylore permissions.

## Session model

- Opaque random session token (hashed server-side only)
- `httpOnly` cookie, `SameSite=Lax`, `Secure` in production
- 30-day session lifetime
- Permission-based authorization (see [AUTHORIZATION.md](./AUTHORIZATION.md))

## Environment configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_INTERNAL_ENABLED` | `true` | Normal email/password login for all users |
| `AUTH_OIDC_ENABLED` | `false` | OIDC login |
| `AUTH_INTERNAL_RECOVERY_ENABLED` | `true` | Break-glass password login for existing password users when internal auth is disabled |
| `OIDC_ISSUER_URL` | — | Required when OIDC enabled; normalized at startup |
| `OIDC_CLIENT_ID` | — | Required when OIDC enabled |
| `OIDC_CLIENT_SECRET` | — | Optional; omit for public clients using PKCE |
| `OIDC_SCOPES` | `openid,profile,email` | Comma-separated scopes |
| `OIDC_AUTO_PROVISION` | `false` | Create a Feylore user on first OIDC login when no identity match exists |
| `OIDC_ALLOW_PRIVATE_ISSUER` | `false` | Allow discovery/token/userinfo to the configured issuer origin on private networks |
| `OIDC_LABEL` | — | Optional label for the login button |
| `SMTP_HOST` | — | SMTP server host (optional; enables password reset when set with `SMTP_FROM`) |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP auth username (optional) |
| `SMTP_PASS` | — | SMTP auth password (optional) |
| `SMTP_FROM` | — | From address for outbound mail (required with `SMTP_HOST` for reset) |

Callback URL (derived): `{APP_URL}/api/v1/auth/oidc/callback`

At least one of `AUTH_INTERNAL_ENABLED` or `AUTH_OIDC_ENABLED` must be `true`.

## Recovery semantics (security policy)

`AUTH_INTERNAL_RECOVERY_ENABLED=true` does **not** make `AUTH_INTERNAL_ENABLED=false` equivalent to “OIDC only” in practice. The effective policy is:

> **OIDC for normal login, with password login still available to anyone who already has a password.**

This is a deliberate break-glass mechanism. The login UI exposes recovery as a **separate** path (`recovery: true` from `/auth/methods`), not the default password form.

Operators who want true OIDC-only login must set `AUTH_INTERNAL_RECOVERY_ENABLED=false` and accept that a misconfigured IdP can lock out password-capable users (except first-run setup when no users exist).

## Password reset (SMTP)

When `SMTP_HOST` and `SMTP_FROM` are configured, Feylore exposes email-based password reset:

1. User requests reset via `POST /api/v1/auth/password-reset/request` with their email.
2. The API always returns success (no email enumeration).
3. Eligible users receive a single-use link valid for 1 hour.
4. User sets a new password via `POST /api/v1/auth/password-reset/confirm`.
5. All existing sessions are revoked on successful reset.

Eligibility is governed by `AuthPolicyService`:

- Users with an existing password may reset it when SMTP is available.
- OIDC-only users may **establish** a local password via reset only when `canSetPassword()` is true (same rule as `POST /auth/password`).

`PasswordResetService` orchestrates tokens and mail only; it does not encode independent policy rules.

## Session and device linkage

Login accepts an optional `deviceId`. The server verifies `devices.id` belongs to the authenticated user before writing `sessions.deviceId`. A client-supplied UUID is never trusted on its own. If verification fails, the session is created without device linkage.

Users can list and revoke active sessions via `/api/v1/auth/sessions`. Revoking a device deletes all sessions linked to that device.

## OIDC flow

1. Browser requests `GET /api/v1/auth/oidc/login`
2. Feylore stores OAuth state (PKCE verifier, nonce) server-side and redirects to the IdP
3. IdP authenticates the user and redirects to `/api/v1/auth/oidc/callback`
4. Feylore validates state/nonce, exchanges the code, validates the ID token
5. Feylore resolves or creates the linked user and issues a normal application session cookie

All outbound OIDC HTTP traffic is restricted to the **configured issuer origin**. Redirects during discovery, token exchange, or userinfo cannot escape that origin.

## Account linking

| Scenario | Behavior |
|----------|----------|
| OIDC login, identity exists | Log into the linked Feylore user |
| OIDC login, no identity, auto-provision on | Create user + identity (`member` role) |
| OIDC login, no identity, auto-provision off | Reject; no account created |
| Authenticated user links OIDC | Attach identity to current user |
| Identity already linked to another user | `409 Conflict`; never transferable |
| Unlink | Allowed only if another login method remains |

Linking is **explicit** — identities are never auto-linked by email alone.

Auto-provisioned usernames are derived from `preferred_username`, then email local-part, then a collision-safe suffix. The authoritative identity key is OIDC `(issuer, sub)`.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/auth/methods` | Public auth method flags |
| GET | `/api/v1/auth/oidc/login` | Start OIDC login (redirect) |
| GET | `/api/v1/auth/oidc/callback` | OIDC callback (redirect) |
| POST | `/api/v1/auth/oidc/link` | Start link flow (returns `{ url }`) |
| DELETE | `/api/v1/auth/oidc/link` | Unlink identity |
| GET | `/api/v1/auth/identities` | List linked identities for current user |
| GET | `/api/v1/auth/sessions` | List active sessions for current user |
| DELETE | `/api/v1/auth/sessions/:id` | Revoke a session |
| DELETE | `/api/v1/auth/sessions?others=true` | Revoke all sessions except current |
| POST | `/api/v1/auth/password-reset/request` | Request password reset email |
| POST | `/api/v1/auth/password-reset/confirm` | Set new password from reset token |

### `/auth/methods` response

```json
{
  "internal": true,
  "oidc": false,
  "recovery": false,
  "passwordReset": false,
  "oidcLabel": "Your identity provider"
}
```

## Future multi-provider support

V1 uses a single env-configured provider (`provider_key = "default"`). The `user_oidc_identities` table is keyed by `(provider_key, issuer, subject)` so additional providers can be added later without a schema break.
