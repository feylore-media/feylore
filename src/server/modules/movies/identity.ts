import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  allocateCanonicalSlugFromTitle,
  createPendingIdentityFields,
  generateUniqueEntityId,
} from "../../platform/media-identity/index.js";

export async function isMovieSlugTaken(
  db: Database,
  slug: string,
): Promise<boolean> {
  const row = await db.query.movies.findFirst({
    where: eq(schema.movies.slug, slug),
    columns: { id: true },
  });
  return row != null;
}

export async function isMovieIdTaken(db: Database, id: string): Promise<boolean> {
  const row = await db.query.movies.findFirst({
    where: eq(schema.movies.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniqueMovieId(db: Database): Promise<string> {
  return generateUniqueEntityId((id) => isMovieIdTaken(db, id));
}

export async function allocateMovieCanonicalSlug(
  db: Database,
  title: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(title, (slug) =>
    isMovieSlugTaken(db, slug),
  );
}

export async function getMovieBySlug(db: Database, slug: string) {
  const movie = await db.query.movies.findFirst({
    where: eq(schema.movies.slug, slug),
  });
  if (!movie) throw new NotFoundError("Movie not found");
  return movie;
}

export async function promoteMovieSlugIfPending(
  db: Database,
  movieId: string,
  title: string,
): Promise<void> {
  const movie = await db.query.movies.findFirst({
    where: eq(schema.movies.id, movieId),
  });
  if (!movie || movie.slugStatus !== "pending") return;

  const canonicalSlug = await allocateMovieCanonicalSlug(db, title);
  if (!canonicalSlug) return;

  await db
    .update(schema.movies)
    .set({
      slug: canonicalSlug,
      slugStatus: "canonical",
      updatedAt: new Date(),
    })
    .where(eq(schema.movies.id, movieId));
}

export function pendingMovieIdentity(id: string) {
  return createPendingIdentityFields(id);
}

export async function isMoviePersonSlugTaken(
  db: Database,
  slug: string,
): Promise<boolean> {
  const row = await db.query.moviePeople.findFirst({
    where: eq(schema.moviePeople.slug, slug),
    columns: { id: true },
  });
  return row != null;
}

export async function isMoviePersonIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.moviePeople.findFirst({
    where: eq(schema.moviePeople.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniqueMoviePersonId(
  db: Database,
): Promise<string> {
  return generateUniqueEntityId((id) => isMoviePersonIdTaken(db, id));
}

export async function allocateMoviePersonCanonicalSlug(
  db: Database,
  name: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(name, (slug) =>
    isMoviePersonSlugTaken(db, slug),
  );
}

export async function getMoviePersonBySlug(db: Database, slug: string) {
  const person = await db.query.moviePeople.findFirst({
    where: eq(schema.moviePeople.slug, slug),
  });
  if (!person) throw new NotFoundError("Person not found");
  return person;
}

export async function promoteMoviePersonSlugIfPending(
  db: Database,
  personId: string,
  name: string,
): Promise<void> {
  const person = await db.query.moviePeople.findFirst({
    where: eq(schema.moviePeople.id, personId),
  });
  if (!person || person.slugStatus !== "pending") return;

  const canonicalSlug = await allocateMoviePersonCanonicalSlug(db, name);
  if (!canonicalSlug) return;

  await db
    .update(schema.moviePeople)
    .set({
      slug: canonicalSlug,
      slugStatus: "canonical",
      updatedAt: new Date(),
    })
    .where(eq(schema.moviePeople.id, personId));
}

export function pendingMoviePersonIdentity(id: string) {
  return createPendingIdentityFields(id);
}

export async function isMovieCollectionSlugTaken(
  db: Database,
  slug: string,
): Promise<boolean> {
  const row = await db.query.movieCollections.findFirst({
    where: eq(schema.movieCollections.slug, slug),
    columns: { id: true },
  });
  return row != null;
}

export async function isMovieCollectionIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.movieCollections.findFirst({
    where: eq(schema.movieCollections.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniqueMovieCollectionId(
  db: Database,
): Promise<string> {
  return generateUniqueEntityId((id) => isMovieCollectionIdTaken(db, id));
}

export async function allocateMovieCollectionCanonicalSlug(
  db: Database,
  title: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(title, (slug) =>
    isMovieCollectionSlugTaken(db, slug),
  );
}

export async function getMovieCollectionBySlug(db: Database, slug: string) {
  const collection = await db.query.movieCollections.findFirst({
    where: eq(schema.movieCollections.slug, slug),
  });
  if (!collection) throw new NotFoundError("Collection not found");
  return collection;
}

export function pendingMovieCollectionIdentity(id: string) {
  return createPendingIdentityFields(id);
}
