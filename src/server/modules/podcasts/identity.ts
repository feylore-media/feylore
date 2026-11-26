import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  allocateCanonicalSlugFromTitle,
  createPendingIdentityFields,
  generateUniqueEntityId,
} from "../../platform/media-identity/index.js";

export async function isPodcastShowSlugTaken(
  db: Database,
  slug: string,
): Promise<boolean> {
  const row = await db.query.podcastShows.findFirst({
    where: eq(schema.podcastShows.slug, slug),
    columns: { id: true },
  });
  return row != null;
}

export async function isPodcastShowIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.podcastShows.findFirst({
    where: eq(schema.podcastShows.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniquePodcastShowId(db: Database): Promise<string> {
  return generateUniqueEntityId((id) => isPodcastShowIdTaken(db, id));
}

export async function allocatePodcastShowCanonicalSlug(
  db: Database,
  title: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(title, (slug) =>
    isPodcastShowSlugTaken(db, slug),
  );
}

export async function getPodcastShowBySlug(db: Database, slug: string) {
  const show = await db.query.podcastShows.findFirst({
    where: eq(schema.podcastShows.slug, slug),
  });
  if (!show) throw new NotFoundError("Podcast show not found");
  return show;
}

export async function isEpisodeSlugTakenInShow(
  db: Database,
  showId: string,
  slug: string,
): Promise<boolean> {
  const rows = await db
    .select({ slug: schema.podcastEpisodes.slug })
    .from(schema.podcastEpisodes)
    .where(eq(schema.podcastEpisodes.showId, showId));
  return rows.some((r) => r.slug === slug);
}

export async function allocateEpisodeSlug(
  db: Database,
  showId: string,
  title: string,
): Promise<string> {
  const base =
    (await allocateCanonicalSlugFromTitle(title, (slug) =>
      isEpisodeSlugTakenInShow(db, showId, slug),
    )) ?? `episode-${Date.now()}`;
  return base;
}

export function pendingPodcastShowIdentity(id: string) {
  return createPendingIdentityFields(id);
}

export async function promotePodcastShowSlugIfPending(
  db: Database,
  showId: string,
  title: string,
): Promise<void> {
  const show = await db.query.podcastShows.findFirst({
    where: eq(schema.podcastShows.id, showId),
  });
  if (!show || show.slugStatus !== "pending") return;

  const canonicalSlug = await allocatePodcastShowCanonicalSlug(db, title);
  if (!canonicalSlug) return;

  await db
    .update(schema.podcastShows)
    .set({
      slug: canonicalSlug,
      slugStatus: "canonical",
      updatedAt: new Date(),
    })
    .where(eq(schema.podcastShows.id, showId));
}
