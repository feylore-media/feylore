import type { Database } from "../../db/client.js";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema.js";
import { ForbiddenError } from "../../../shared/errors.js";

export async function ensureProgressSyncEnabled(
  db: Database,
  userId: string,
): Promise<void> {
  const prefs = await db.query.userPreferences.findFirst({
    where: eq(schema.userPreferences.userId, userId),
  });
  if (prefs && !prefs.progressSyncEnabled) {
    throw new ForbiddenError("Progress sync is disabled");
  }
}
