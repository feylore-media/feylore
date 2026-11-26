import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { NotFoundError } from "../../../shared/errors.js";

export type ResolvedWork = {
  workType: string;
  workId: string;
};

export async function resolveWorkFromRepresentation(
  db: Database,
  representationId: string,
): Promise<ResolvedWork> {
  const rep = await db.query.representations.findFirst({
    where: eq(schema.representations.id, representationId),
  });
  if (!rep) throw new NotFoundError("Representation not found");
  if (!rep.manifestationId) {
    throw new NotFoundError("Representation has no manifestation");
  }

  const manifestation = await db.query.creativeWorkManifestations.findFirst({
    where: eq(schema.creativeWorkManifestations.id, rep.manifestationId),
  });
  if (!manifestation) throw new NotFoundError("Manifestation not found");

  const expression = await db.query.creativeWorkExpressions.findFirst({
    where: eq(schema.creativeWorkExpressions.id, manifestation.expressionId),
  });
  if (!expression) throw new NotFoundError("Expression not found");

  return { workType: expression.workType, workId: expression.workId };
}
