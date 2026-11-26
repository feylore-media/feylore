import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

loadDotEnv();

function parseBool(val: string | undefined, defaultVal: boolean): boolean {
  if (val === undefined || val === "") return defaultVal;
  return val === "true" || val === "1";
}

export function normalizeIssuerUrl(url: string): {
  issuerUrl: string;
  issuerOrigin: string;
} {
  const parsed = new URL(url);
  let pathname = parsed.pathname;
  if (!pathname.endsWith("/")) pathname += "/";
  const issuerUrl = `${parsed.origin}${pathname}`;
  return { issuerUrl, issuerOrigin: parsed.origin };
}

export interface OidcConfig {
  issuerUrl: string;
  issuerOrigin: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  autoProvision: boolean;
  allowPrivateIssuer: boolean;
  providerKey: string;
  callbackUrl: string;
  label?: string;
}

export interface AuthConfig {
  internalEnabled: boolean;
  oidcEnabled: boolean;
  internalRecoveryEnabled: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z
    .string()
    .min(16)
    .default("dev-session-secret-change-in-production"),
  STORAGE_ROOT: z.string().min(1).default("./data/storage"),
  APP_URL: z.string().url().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().default(500 * 1024 * 1024),
  MAX_UPLOAD_FILES: z.coerce.number().default(20),
  INGEST_CLAIM_STALE_MS: z.coerce.number().default(5 * 60 * 1000),
  INGEST_ROOT: z.string().optional(),
  LIBRARY_BOOKS_ROOT: z.string().default("./library/books"),
  LIBRARY_AUDIOBOOKS_ROOT: z.string().default("./library/audiobooks"),
  LIBRARY_MUSIC_ROOT: z.string().default("./library/music"),
  AUTH_INTERNAL_ENABLED: z.string().optional(),
  AUTH_OIDC_ENABLED: z.string().optional(),
  AUTH_INTERNAL_RECOVERY_ENABLED: z.string().optional(),
  OIDC_ISSUER_URL: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_SCOPES: z.string().optional(),
  OIDC_AUTO_PROVISION: z.string().optional(),
  OIDC_ALLOW_PRIVATE_ISSUER: z.string().optional(),
  OIDC_LABEL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  READING_SESSION_QUALIFICATION_SECONDS: z.coerce.number().default(300),
  READING_SESSION_INACTIVITY_SECONDS: z.coerce.number().default(120),
  READING_SESSION_MAX_ACTIVE_BURST_SECONDS: z.coerce.number().default(60),
});

export type AppConfig = z.infer<typeof envSchema> & {
  auth: AuthConfig;
  oidc?: OidcConfig;
  smtp?: SmtpConfig;
};

function buildAuthConfig(env: z.infer<typeof envSchema>): AuthConfig {
  return {
    internalEnabled: parseBool(env.AUTH_INTERNAL_ENABLED, true),
    oidcEnabled: parseBool(env.AUTH_OIDC_ENABLED, false),
    internalRecoveryEnabled: parseBool(
      env.AUTH_INTERNAL_RECOVERY_ENABLED,
      true,
    ),
  };
}

function buildOidcConfig(
  env: z.infer<typeof envSchema>,
  appUrl: string,
): OidcConfig | undefined {
  if (!parseBool(env.AUTH_OIDC_ENABLED, false)) return undefined;

  if (!env.OIDC_ISSUER_URL) {
    throw new Error("OIDC_ISSUER_URL is required when AUTH_OIDC_ENABLED=true");
  }
  if (!env.OIDC_CLIENT_ID) {
    throw new Error("OIDC_CLIENT_ID is required when AUTH_OIDC_ENABLED=true");
  }

  const { issuerUrl, issuerOrigin } = normalizeIssuerUrl(env.OIDC_ISSUER_URL);
  const scopes = (env.OIDC_SCOPES ?? "openid,profile,email")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    issuerUrl,
    issuerOrigin,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET || undefined,
    scopes,
    autoProvision: parseBool(env.OIDC_AUTO_PROVISION, false),
    allowPrivateIssuer: parseBool(env.OIDC_ALLOW_PRIVATE_ISSUER, false),
    providerKey: "default",
    callbackUrl: `${appUrl.replace(/\/$/, "")}/api/v1/auth/oidc/callback`,
    label: env.OIDC_LABEL,
  };
}

function buildSmtpConfig(
  env: z.infer<typeof envSchema>,
): SmtpConfig | undefined {
  if (!env.SMTP_HOST?.trim()) return undefined;
  const from = env.SMTP_FROM?.trim();
  if (!from) return undefined;
  return {
    host: env.SMTP_HOST.trim(),
    port: env.SMTP_PORT ?? 587,
    user: env.SMTP_USER?.trim() || undefined,
    pass: env.SMTP_PASS || undefined,
    from,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  if (
    parsed.NODE_ENV === "production" &&
    (parsed.SESSION_SECRET === "dev-session-secret-change-in-production" ||
      parsed.SESSION_SECRET.length < 32)
  ) {
    throw new Error(
      "Production SESSION_SECRET must be at least 32 characters and must not use the development default",
    );
  }
  const auth = buildAuthConfig(parsed);

  if (!auth.internalEnabled && !auth.oidcEnabled) {
    throw new Error(
      "At least one authentication method must be enabled (AUTH_INTERNAL_ENABLED or AUTH_OIDC_ENABLED)",
    );
  }

  let oidc: OidcConfig | undefined;
  if (auth.oidcEnabled) {
    if (!parsed.APP_URL) {
      throw new Error("APP_URL is required when AUTH_OIDC_ENABLED=true");
    }
    oidc = buildOidcConfig(parsed, parsed.APP_URL);
  }

  const smtp = buildSmtpConfig(parsed);

  return { ...parsed, auth, oidc, smtp };
}

export function redactConfig(config: AppConfig): Record<string, unknown> {
  return {
    NODE_ENV: config.NODE_ENV,
    PORT: config.PORT,
    HOST: config.HOST,
    STORAGE_ROOT: "[redacted]",
    APP_URL: config.APP_URL,
    auth: config.auth,
    oidc: config.oidc
      ? {
          issuerUrl: config.oidc.issuerUrl,
          clientId: config.oidc.clientId,
          scopes: config.oidc.scopes,
          autoProvision: config.oidc.autoProvision,
          allowPrivateIssuer: config.oidc.allowPrivateIssuer,
        }
      : undefined,
  };
}
