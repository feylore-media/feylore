import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  allocateCanonicalSlugFromTitle,
  createPendingIdentityFields,
  generateUniqueEntityId,
} from "../../platform/media-identity/index.js";

export async function isTvShowSlugTaken(
  db: Database,
  slug: string,
): Promise<boolean> {
  const row = await db.query.tvShows.findFirst({
    where: eq(schema.tvShows.slug, slug),
    columns: { id: true },
  });
  return row != null;
}

export async function isTvShowIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.tvShows.findFirst({
    where: eq(schema.tvShows.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniqueTvShowId(db: Database): Promise<string> {
  return generateUniqueEntityId((id) => isTvShowIdTaken(db, id));
}

export async function allocateTvShowCanonicalSlug(
  db: Database,
  title: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(title, (slug) =>
    isTvShowSlugTaken(db, slug),
  );
}

export async function getTvShowBySlug(db: Database, slug: string) {
  const show = await db.query.tvShows.findFirst({
    where: eq(schema.tvShows.slug, slug),
  });
  if (!show) throw new NotFoundError("TV show not found");
  return show;
}

export async function promoteTvShowSlugIfPending(
  db: Database,
  showId: string,
  title: string,
): Promise<void> {
  const show = await db.query.tvShows.findFirst({
    where: eq(schema.tvShows.id, showId),
  });
  if (!show || show.slugStatus !== "pending") return;

  const canonicalSlug = await allocateTvShowCanonicalSlug(db, title);
  if (!canonicalSlug) return;

  await db
    .update(schema.tvShows)
    .set({
      slug: canonicalSlug,
      slugStatus: "canonical",
      updatedAt: new Date(),
    })
    .where(eq(schema.tvShows.id, showId));
}

export function pendingTvShowIdentity(id: string) {
  return createPendingIdentityFields(id);
}

export async function isTvEpisodeIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.tvEpisodes.findFirst({
    where: eq(schema.tvEpisodes.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniqueTvEpisodeId(
  db: Database,
): Promise<string> {
  return generateUniqueEntityId((id) => isTvEpisodeIdTaken(db, id));
}

export async function isTvPersonIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.tvPeople.findFirst({
    where: eq(schema.tvPeople.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniqueTvPersonId(
  db: Database,
): Promise<string> {
  return generateUniqueEntityId((id) => isTvPersonIdTaken(db, id));
}

export async function allocateTvPersonCanonicalSlug(
  db: Database,
  name: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(name, async (slug) => {
    const row = await db.query.tvPeople.findFirst({
      where: eq(schema.tvPeople.slug, slug),
      columns: { id: true },
    });
    return row != null;
  });
}
