import { randomBytes } from "node:crypto";
import { MEDIA_ID_CHARSET, MEDIA_ID_LENGTH } from "../../../shared/media-identity.js";

export function generateEntityId(): string {
  const bytes = randomBytes(MEDIA_ID_LENGTH);
  let id = "";
  for (let i = 0; i < MEDIA_ID_LENGTH; i++) {
    id += MEDIA_ID_CHARSET[bytes[i]! % MEDIA_ID_CHARSET.length];
  }
  return id;
}

export type IdExistsFn = (id: string) => Promise<boolean>;

/** Generate a unique entity ID, retrying on collision. */
export async function generateUniqueEntityId(
  exists: IdExistsFn,
  maxAttempts = 32,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = generateEntityId();
    if (!(await exists(id))) return id;
  }
  throw new Error("Failed to generate unique media entity ID");
}
