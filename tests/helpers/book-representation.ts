import type { Database } from "../../src/server/db/client.js";
import * as schema from "../../src/server/db/schema.js";
import { generateId } from "../../src/server/security/crypto.js";

export async function createBookRepresentation(db: Database, bookId: string) {
  const expressionId = generateId();
  const manifestationId = generateId();
  const representationId = generateId();
  await db.insert(schema.creativeWorkExpressions).values({ id: expressionId, workType: "book", workId: bookId, label: "test" });
  await db.insert(schema.creativeWorkManifestations).values({ id: manifestationId, expressionId, label: "test" });
  await db.insert(schema.representations).values({ id: representationId, manifestationId, format: "epub", domainModule: "books" });
  return representationId;
}
