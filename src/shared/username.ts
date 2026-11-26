import { z } from "zod";

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 32;

/** Lowercase alphanumeric plus `.`, `_`, `-` */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]{1,2}$/;

export const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "auth",
  "clubs",
  "dev",
  "downloads",
  "login",
  "search",
  "settings",
  "setup",
  "u",
  "users",
  "profiles",
  "activity",
  "add",
  "home",
  "music",
  "movies",
  "books",
  "audiobooks",
  "photos",
  "ttrpg",
  "tv",
  "stats",
  "shelves",
  "collections",
  "read",
  "null",
  "undefined",
  "me",
  "system",
  "root",
]);

export function normalizeUsername(value: string): string {
  // `@` is presentation syntax only (see `shared/user-identity.ts`).
  // Strip it here so the convention can never leak into stored identity,
  // validation, URLs, mentions, or imports.
  return value.trim().replace(/^@+/, "").trim().toLowerCase();
}

export function sanitizeUsernameCandidate(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, USERNAME_MAX);
  if (cleaned.length >= USERNAME_MIN) return cleaned;
  return `user-${cleaned || "oidc"}`.slice(0, USERNAME_MAX);
}

export function validateUsername(value: string): string | null {
  const normalized = normalizeUsername(value);
  if (normalized.length < USERNAME_MIN || normalized.length > USERNAME_MAX) {
    return "Username must be 2–32 characters";
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return "Username may only contain lowercase letters, numbers, and . _ -";
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return "Username is reserved";
  }
  return null;
}

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN)
  .max(USERNAME_MAX)
  .transform(normalizeUsername)
  .superRefine((value, ctx) => {
    const error = validateUsername(value);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
    }
  });

/** Matches @username tokens in club posts and similar surfaces. */
export const USERNAME_MENTION_PATTERN = /@([a-z0-9][a-z0-9._-]{0,30}[a-z0-9]|[a-z0-9]{1,2})/gi;

/** Split helper that preserves `@username` tokens for rendering. */
export const USERNAME_MENTION_SPLIT_PATTERN =
  /(@(?:[a-z0-9][a-z0-9._-]{0,30}[a-z0-9]|[a-z0-9]{1,2}))/gi;

export function extractMentionUsernames(body: string): string[] {
  const usernames = new Set<string>();
  for (const match of body.matchAll(USERNAME_MENTION_PATTERN)) {
    const username = match[1];
    if (username) usernames.add(username.toLowerCase());
  }
  return [...usernames];
}
