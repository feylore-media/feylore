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

describe.skipIf(!ingestDbAvailable)("Ingest failure and retry", () => {
  let testCtx: IngestTestContext;

  beforeAll(async () => {
    testCtx = await createIngestTestContext("ingest-failure@test.local");
  });

  afterAll(async () => {
    await destroyIngestTestContext(testCtx);
  });

  it("preserves source on failure and retries the same row", async () => {
    const ingestLoc = await testCtx.ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, testCtx.ingestStorageId),
    });
    const epubPath = path.join(ingestLoc!.rootPath, "retry-me.epub");
    await fs.writeFile(epubPath, "");

    const result = await testCtx.ctx.ingest.reconcileFilesystemFile({
      ingestRootId: testCtx.ingestRootId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: "retry-me.epub",
      originalFilename: "retry-me.epub",
      size: 0,
    });

    const itemId = result.item.id;
    const stageLogBefore = (await testCtx.ctx.ingest.items.getById(itemId))!
      .stageLog!.length;

    await testCtx.ctx.ingest.getPipeline().process(itemId);

    let item = await testCtx.ctx.ingest.items.getById(itemId);
    expect(item?.terminalState).toBe("failed");
    expect(await fs.stat(epubPath)).toBeTruthy();

    await fs.writeFile(
      epubPath,
      await buildMinimalEpub({ title: "Retry Success Book" }),
    );

    const retried = await testCtx.ctx.ingest.items.retry(itemId);
    expect(retried).not.toBeNull();
    expect(retried!.retryCount).toBe(1);

    await testCtx.ctx.ingest.getPipeline().process(itemId);

    item = await testCtx.ctx.ingest.items.getById(itemId);
    expect(item?.status).toBe("completed");
    expect(item?.terminalState).toBeNull();
    expect(item!.stageLog!.length).toBeGreaterThan(stageLogBefore);
    expect(item!.stageLog!.some((e) => e.stage === "retry")).toBe(true);
  });
});
