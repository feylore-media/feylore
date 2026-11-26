import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import * as schema from "../src/server/db/schema.js";
import { buildMinimalEpub } from "./fixtures/epub/build-minimal-epub.js";
import {
  createIngestTestContext,
  destroyIngestTestContext,
  ingestDbAvailable,
  type IngestTestContext,
} from "./helpers/ingest-setup.js";

describe.skipIf(!ingestDbAvailable)("Ingest pipeline", () => {
  let testCtx: IngestTestContext;

  beforeAll(async () => {
    testCtx = await createIngestTestContext("ingest-pipeline@test.local");
  });

  afterAll(async () => {
    await destroyIngestTestContext(testCtx);
  });

  it("library scan does not create ingest items", async () => {
    const countBefore = (
      await testCtx.ctx.db
        .select({ id: schema.ingestItems.id })
        .from(schema.ingestItems)
        .where(eq(schema.ingestItems.targetLibraryId, testCtx.libraryId))
    ).length;

    const scan = await testCtx.app.inject({
      method: "POST",
      url: "/api/v1/libraries/" + testCtx.libraryId + "/scan",
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

  it("filesystem ingest creates ingest item and processes epub", async () => {
    const ingestLoc = await testCtx.ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, testCtx.ingestStorageId),
    });
    const epubPath = path.join(ingestLoc!.rootPath, "fiction", "test-book.epub");
    await fs.mkdir(path.dirname(epubPath), { recursive: true });
    await fs.writeFile(
      epubPath,
      await buildMinimalEpub({ title: "Ingest Test Book" }),
    );

    const result = await testCtx.ctx.ingest.reconcileFilesystemFile({
      ingestRootId: testCtx.ingestRootId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: "fiction/test-book.epub",
      originalFilename: "test-book.epub",
      size: (await fs.stat(epubPath)).size,
    });

    await testCtx.ctx.ingest.getPipeline().process(result.item.id);

    const item = await testCtx.ctx.ingest.items.getById(result.item.id);
    expect(item?.status).toBe("completed");
    expect(item?.terminalState).toBeNull();
    expect(item?.workType).toBe("book");
  });
});
