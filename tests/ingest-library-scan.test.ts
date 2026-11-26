import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import * as schema from "../src/server/db/schema.js";
import {
  createIngestTestContext,
  destroyIngestTestContext,
  ingestDbAvailable,
  type IngestTestContext,
} from "./helpers/ingest-setup.js";

describe.skipIf(!ingestDbAvailable)("Ingest library scan", () => {
  let testCtx: IngestTestContext;

  beforeAll(async () => {
    testCtx = await createIngestTestContext("ingest-scan@test.local");

    const libraryLoc = await testCtx.ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, testCtx.libraryStorageId),
    });
    await fs.writeFile(
      path.join(libraryLoc!.rootPath, "existing.epub"),
      "placeholder epub bytes",
    );
  });

  afterAll(async () => {
    await destroyIngestTestContext(testCtx);
  });

  it("indexes library files in place without creating ingest items", async () => {
    const countBefore = (
      await testCtx.ctx.db
        .select({ id: schema.ingestItems.id })
        .from(schema.ingestItems)
        .where(eq(schema.ingestItems.targetLibraryId, testCtx.libraryId))
    ).length;

    const scan = await testCtx.app.inject({
      method: "POST",
      url: `/api/v1/libraries/${testCtx.libraryId}/scan`,
      headers: { cookie: testCtx.cookie },
    });
    expect(scan.statusCode).toBe(202);

    const countAfter = (
      await testCtx.ctx.db
        .select({ id: schema.ingestItems.id })
        .from(schema.ingestItems)
        .where(eq(schema.ingestItems.targetLibraryId, testCtx.libraryId))
    ).length;

    expect(countAfter).toBe(countBefore);
  });
});
