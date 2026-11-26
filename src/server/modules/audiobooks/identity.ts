import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  allocateCanonicalSlugFromTitle,
  createPendingIdentityFields,
  generateUniqueEntityId,
} from "../../platform/media-identity/index.js";

export async function isAudiobookSlugTaken(
  db: Database,
  slug: string,
): Promise<boolean> {
  const row = await db.query.audiobooks.findFirst({
    where: eq(schema.audiobooks.slug, slug),
    columns: { id: true },
  });
  return row != null;
}

export async function isAudiobookIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.audiobooks.findFirst({
    where: eq(schema.audiobooks.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniqueAudiobookId(db: Database): Promise<string> {
  return generateUniqueEntityId((id) => isAudiobookIdTaken(db, id));
}

export async function allocateAudiobookCanonicalSlug(
  db: Database,
  title: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(title, (slug) =>
    isAudiobookSlugTaken(db, slug),
  );
}

export async function getAudiobookBySlug(db: Database, slug: string) {
  const audiobook = await db.query.audiobooks.findFirst({
    where: eq(schema.audiobooks.slug, slug),
  });
  if (!audiobook) throw new NotFoundError("Audiobook not found");
  return audiobook;
}

export async function promoteAudiobookSlugIfPending(
  db: Database,
  audiobookId: string,
  title: string,
): Promise<void> {
  const audiobook = await db.query.audiobooks.findFirst({
    where: eq(schema.audiobooks.id, audiobookId),
  });
  if (!audiobook || audiobook.slugStatus !== "pending") return;

  const canonicalSlug = await allocateAudiobookCanonicalSlug(db, title);
  if (!canonicalSlug) return;

  await db
    .update(schema.audiobooks)
    .set({
      slug: canonicalSlug,
      slugStatus: "canonical",
      updatedAt: new Date(),
    })
    .where(eq(schema.audiobooks.id, audiobookId));
}

export function pendingAudiobookIdentity(id: string) {
  return createPendingIdentityFields(id);
}
