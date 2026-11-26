import { z } from "zod";

export const MEDIA_ID_LENGTH = 6;
export const MEDIA_ID_PATTERN = /^[a-z0-9]{6}$/;
export const MEDIA_ID_CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";

export const SLUG_STATUSES = ["pending", "canonical"] as const;
export type SlugStatus = (typeof SLUG_STATUSES)[number];

export interface MediaIdentityPublic {
  id: string;
  slug: string;
  slugStatus: SlugStatus;
}

export const mediaIdSchema = z
  .string()
  .length(MEDIA_ID_LENGTH)
  .regex(MEDIA_ID_PATTERN, "Invalid media ID");

export const slugStatusSchema = z.enum(SLUG_STATUSES);

/** Public route param — any non-empty slug string. */
export const mediaRefSchema = z.string().min(1);

/**
 * Slugify a canonical display title/name for public routing.
 * Returns null when the title cannot produce a valid ASCII slug.
 */
export function slugifyTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  const slug = normalized
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug || !/[a-z0-9]/.test(slug)) return null;
  return slug;
}

export function looksLikeMediaId(value: string): boolean {
  return MEDIA_ID_PATTERN.test(value);
}

/**
 * Build collision suffix candidates: base, base-2, base-3, …
 */
export function* slugCollisionCandidates(baseSlug: string): Generator<string> {
  yield baseSlug;
  for (let n = 2; n <= 1000; n++) {
    yield `${baseSlug}-${n}`;
  }
}

/**
 * Pick the first collision candidate that is not taken and, when possible,
 * does not look exactly like a media ID (6-char alphanumeric, no hyphens).
 */
export function pickAvailableSlug(
  baseSlug: string,
  isTaken: (slug: string) => boolean,
): string | null {
  for (const candidate of slugCollisionCandidates(baseSlug)) {
    if (isTaken(candidate)) continue;
    if (looksLikeMediaId(candidate) && candidate.includes("-") === false) {
      // Prefer next candidate to reduce routing ambiguity with pending IDs.
      const next = `${candidate}-2`;
      if (!isTaken(next)) return next;
      continue;
    }
    return candidate;
  }
  return null;
}

export function createPendingIdentityFields(id: string): {
  id: string;
  slug: string;
  slugStatus: "pending";
} {
  return { id, slug: id, slugStatus: "pending" };
}
