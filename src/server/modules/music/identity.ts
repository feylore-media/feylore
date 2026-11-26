import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  allocateCanonicalSlugFromTitle,
  createPendingIdentityFields,
  generateUniqueEntityId,
} from "../../platform/media-identity/index.js";

export async function isAlbumSlugTaken(
  db: Database,
  slug: string,
): Promise<boolean> {
  const row = await db.query.albums.findFirst({
    where: eq(schema.albums.slug, slug),
    columns: { id: true },
  });
  return row != null;
}

export async function isAlbumIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.albums.findFirst({
    where: eq(schema.albums.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniqueAlbumId(db: Database): Promise<string> {
  return generateUniqueEntityId((id) => isAlbumIdTaken(db, id));
}

export async function allocateAlbumCanonicalSlug(
  db: Database,
  title: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(title, (slug) =>
    isAlbumSlugTaken(db, slug),
  );
}

export async function getAlbumBySlug(db: Database, slug: string) {
  const album = await db.query.albums.findFirst({
    where: eq(schema.albums.slug, slug),
  });
  if (!album) throw new NotFoundError("Album not found");
  return album;
}

export async function promoteAlbumSlugIfPending(
  db: Database,
  albumId: string,
  title: string,
): Promise<void> {
  const album = await db.query.albums.findFirst({
    where: eq(schema.albums.id, albumId),
  });
  if (!album || album.slugStatus !== "pending") return;

  const canonicalSlug = await allocateAlbumCanonicalSlug(db, title);
  if (!canonicalSlug) return;

  await db
    .update(schema.albums)
    .set({
      slug: canonicalSlug,
      slugStatus: "canonical",
      updatedAt: new Date(),
    })
    .where(eq(schema.albums.id, albumId));
}

export function pendingAlbumIdentity(id: string) {
  return createPendingIdentityFields(id);
}

export async function isArtistSlugTaken(
  db: Database,
  slug: string,
): Promise<boolean> {
  const row = await db.query.musicArtists.findFirst({
    where: eq(schema.musicArtists.slug, slug),
    columns: { id: true },
  });
  return row != null;
}

export async function isArtistIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.musicArtists.findFirst({
    where: eq(schema.musicArtists.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniqueArtistId(db: Database): Promise<string> {
  return generateUniqueEntityId((id) => isArtistIdTaken(db, id));
}

export async function allocateArtistCanonicalSlug(
  db: Database,
  name: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(name, (slug) =>
    isArtistSlugTaken(db, slug),
  );
}

export async function getArtistBySlug(db: Database, slug: string) {
  const artist = await db.query.musicArtists.findFirst({
    where: eq(schema.musicArtists.slug, slug),
  });
  if (!artist) throw new NotFoundError("Artist not found");
  return artist;
}

export async function promoteArtistSlugIfPending(
  db: Database,
  artistId: string,
  name: string,
): Promise<void> {
  const artist = await db.query.musicArtists.findFirst({
    where: eq(schema.musicArtists.id, artistId),
  });
  if (!artist || artist.slugStatus !== "pending") return;

  const canonicalSlug = await allocateArtistCanonicalSlug(db, name);
  if (!canonicalSlug) return;

  await db
    .update(schema.musicArtists)
    .set({
      slug: canonicalSlug,
      slugStatus: "canonical",
      updatedAt: new Date(),
    })
    .where(eq(schema.musicArtists.id, artistId));
}

export function pendingArtistIdentity(id: string) {
  return createPendingIdentityFields(id);
}

export async function isTrackSlugTakenInAlbum(
  db: Database,
  albumId: string,
  slug: string,
): Promise<boolean> {
  const rows = await db
    .select({ slug: schema.musicTracks.slug })
    .from(schema.musicTracks)
    .where(eq(schema.musicTracks.albumId, albumId));
  return rows.some((r) => r.slug === slug);
}

export async function allocateTrackSlug(
  db: Database,
  albumId: string,
  title: string,
): Promise<string> {
  const base =
    (await allocateCanonicalSlugFromTitle(title, (slug) =>
      isTrackSlugTakenInAlbum(db, albumId, slug),
    )) ?? `track-${Date.now()}`;
  return base;
}
