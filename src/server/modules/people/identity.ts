import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  allocateCanonicalSlugFromTitle,
  generateUniqueEntityId,
} from "../../platform/media-identity/index.js";

export async function isPeopleSlugTaken(
  db: Database,
  slug: string,
): Promise<boolean> {
  const row = await db.query.people.findFirst({
    where: eq(schema.people.slug, slug),
    columns: { id: true },
  });
  return row != null;
}

export async function isPeopleIdTaken(
  db: Database,
  id: string,
): Promise<boolean> {
  const row = await db.query.people.findFirst({
    where: eq(schema.people.id, id),
    columns: { id: true },
  });
  return row != null;
}

export async function generateUniquePeopleId(db: Database): Promise<string> {
  return generateUniqueEntityId((id) => isPeopleIdTaken(db, id));
}

export async function allocatePeopleCanonicalSlug(
  db: Database,
  name: string,
): Promise<string | null> {
  return allocateCanonicalSlugFromTitle(name, (slug) =>
    isPeopleSlugTaken(db, slug),
  );
}

export async function getPeopleBySlug(db: Database, slug: string) {
  const person = await db.query.people.findFirst({
    where: eq(schema.people.slug, slug),
  });
  if (!person) throw new NotFoundError("People entity not found");
  return person;
}
