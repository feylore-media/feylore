import {
  looksLikeMediaId,
  slugCollisionCandidates,
  slugifyTitle,
} from "../../../shared/media-identity.js";

export type SlugTakenFn = (slug: string) => Promise<boolean>;

/**
 * Slugify a title and allocate a unique canonical slug within a media domain.
 */
export async function allocateCanonicalSlugFromTitle(
  title: string,
  isSlugTaken: SlugTakenFn,
): Promise<string | null> {
  const baseSlug = slugifyTitle(title);
  if (!baseSlug) return null;

  for (const candidate of slugCollisionCandidates(baseSlug)) {
    if (await isSlugTaken(candidate)) continue;
    if (looksLikeMediaId(candidate) && !candidate.includes("-")) {
      const next = `${candidate}-2`;
      if (!(await isSlugTaken(next))) return next;
      continue;
    }
    return candidate;
  }
  return null;
}
