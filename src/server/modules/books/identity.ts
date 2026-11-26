import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  allocateCanonicalSlugFromTitle,
  createPendingIdentityFields,
  generateUniqueEntityId,
} from "../../platform/media-identity/index.js";

export async function isBookSlugTaken(
  db: Database,
  slug: string,
): Promise<boolean> {
  const row = await db.query.books.findFirst({
    where: eq(schema.books.slug, slug),
    columns: { id: true },
  });
  return row != null;
}

export async function isBookIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.books.findFirst({
    where: eq(schema.books.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniqueBookId(db: Database): Promise<string> {
  return generateUniqueEntityId((id) => isBookIdTaken(db, id));
}

export async function allocateBookCanonicalSlug(
  db: Database,
  title: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(title, (slug) =>
    isBookSlugTaken(db, slug),
  );
}

export async function getBookBySlug(db: Database, slug: string) {
  const book = await db.query.books.findFirst({
    where: eq(schema.books.slug, slug),
  });
  if (!book) throw new NotFoundError("Book not found");
  return book;
}

export async function promoteBookSlugIfPending(
  db: Database,
  bookId: string,
  title: string,
): Promise<void> {
  const book = await db.query.books.findFirst({
    where: eq(schema.books.id, bookId),
  });
  if (!book || book.slugStatus !== "pending") return;

  const canonicalSlug = await allocateBookCanonicalSlug(db, title);
  if (!canonicalSlug) return;

  await db
    .update(schema.books)
    .set({
      slug: canonicalSlug,
      slugStatus: "canonical",
      updatedAt: new Date(),
    })
    .where(eq(schema.books.id, bookId));
}

export function pendingBookIdentity(id: string) {
  return createPendingIdentityFields(id);
}
