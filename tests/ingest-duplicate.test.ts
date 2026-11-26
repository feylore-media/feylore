import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import * as schema from "../src/server/db/schema.js";
import { buildMinimalEpub } from "./fixtures/epub/build-minimal-epub.js";
import {
  createIngestTestContext,
  destroyIngestTestContext,
  ingestDbAvailable,
  type IngestTestContext,
} from "./helpers/ingest-setup.js";

describe.skipIf(!ingestDbAvailable)("Ingest duplicate handling", () => {
  let testCtx: IngestTestContext;

  beforeAll(async () => {
    testCtx = await createIngestTestContext("ingest-dup@test.local");
  });

  afterAll(async () => {
    await destroyIngestTestContext(testCtx);
  });

  it("marks duplicate terminal state and preserves ingest source file", async () => {
    const epubBuffer = await buildMinimalEpub({ title: "Duplicate Test Book" });
    const checksum = createHash("sha256").update(epubBuffer).digest("hex");

    const ingestLoc = await testCtx.ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, testCtx.ingestStorageId),
    });

    const firstPath = path.join(ingestLoc!.rootPath, "original.epub");
    await fs.writeFile(firstPath, epubBuffer);

    const first = await testCtx.ctx.ingest.reconcileFilesystemFile({
      ingestRootId: testCtx.ingestRootId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: "original.epub",
      originalFilename: "original.epub",
      size: epubBuffer.length,
      checksum,
    });
    await testCtx.ctx.ingest.getPipeline().process(first.item.id);

    const completed = await testCtx.ctx.ingest.items.getById(first.item.id);
    expect(completed?.status).toBe("completed");
    const existingWorkId = completed!.workId!;

    const secondPath = path.join(ingestLoc!.rootPath, "copy.epub");
    await fs.writeFile(secondPath, epubBuffer);

    const second = await testCtx.ctx.ingest.reconcileFilesystemFile({
      ingestRootId: testCtx.ingestRootId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: "copy.epub",
      originalFilename: "copy.epub",
      size: epubBuffer.length,
      checksum,
    });
    await testCtx.ctx.ingest.getPipeline().process(second.item.id);

    const duplicate = await testCtx.ctx.ingest.items.getById(second.item.id);
    expect(duplicate?.terminalState).toBe("duplicate");
    expect(duplicate?.duplicateOfWorkId).toBe(existingWorkId);
    expect(await fs.stat(secondPath)).toBeTruthy();
  });
});
