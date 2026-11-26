import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import * as schema from "../src/server/db/schema.js";
import { buildMinimalEpub } from "./fixtures/epub/build-minimal-epub.js";
import { recoverIncompleteIngestItems } from "../src/server/modules/ingest/recovery.js";
import {
  createIngestTestContext,
  destroyIngestTestContext,
  ingestDbAvailable,
  type IngestTestContext,
} from "./helpers/ingest-setup.js";

describe.skipIf(!ingestDbAvailable)("Ingest worker recovery", () => {
  let testCtx: IngestTestContext;

  beforeAll(async () => {
    testCtx = await createIngestTestContext("ingest-recovery@test.local");
  });

  afterAll(async () => {
    await destroyIngestTestContext(testCtx);
  });

  it("requeues incomplete items on worker recovery", async () => {
    const ingestLoc = await testCtx.ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, testCtx.ingestStorageId),
    });
    const epubPath = path.join(ingestLoc!.rootPath, "recovery.epub");
    await fs.writeFile(
      epubPath,
      await buildMinimalEpub({ title: "Recovery Book" }),
    );

    const result = await testCtx.ctx.ingest.reconcileFilesystemFile({
      ingestRootId: testCtx.ingestRootId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: "recovery.epub",
      originalFilename: "recovery.epub",
      size: (await fs.stat(epubPath)).size,
    });

    await testCtx.ctx.db
      .update(schema.ingestItems)
      .set({ status: "analyzing", claimedAt: new Date(), claimedByWorker: "stale" })
      .where(eq(schema.ingestItems.id, result.item.id));

    const enqueue = vi.fn(async (_id: string) => {});
    await recoverIncompleteIngestItems(testCtx.ctx.ingest.items, enqueue);

    expect(enqueue).toHaveBeenCalledWith(result.item.id);

    const item = await testCtx.ctx.ingest.items.getById(result.item.id);
    expect(item?.status).toBe("queued");
    expect(item?.stageLog?.some((e) => e.stage === "recovery")).toBe(true);
  });
});
