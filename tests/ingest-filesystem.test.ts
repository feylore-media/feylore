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

describe.skipIf(!ingestDbAvailable)("Ingest filesystem", () => {
  let testCtx: IngestTestContext;

  beforeAll(async () => {
    testCtx = await createIngestTestContext("ingest-fs@test.local");
  });

  afterAll(async () => {
    await destroyIngestTestContext(testCtx);
  });

  it("discovers nested paths and organizes to library (not mirroring ingest tree)", async () => {
    const ingestLoc = await testCtx.ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, testCtx.ingestStorageId),
    });
    const nestedPath = path.join(
      ingestLoc!.rootPath,
      "incoming",
      "2026",
      "nested-book.epub",
    );
    await fs.mkdir(path.dirname(nestedPath), { recursive: true });
    await fs.writeFile(
      nestedPath,
      await buildMinimalEpub({ title: "Nested Ingest Book" }),
    );

    const result = await testCtx.ctx.ingest.reconcileFilesystemFile({
      ingestRootId: testCtx.ingestRootId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: "incoming/2026/nested-book.epub",
      originalFilename: "nested-book.epub",
      size: (await fs.stat(nestedPath)).size,
    });

    await testCtx.ctx.ingest.getPipeline().process(result.item.id);

    const item = await testCtx.ctx.ingest.items.getById(result.item.id);
    expect(item?.status).toBe("completed");
    expect(item?.terminalState).toBeNull();
    expect(item?.destinationRelativePath).not.toContain("incoming/2026");

    const file = await testCtx.ctx.files.getFile(item!.fileId!);
    expect(file.storageLocationId).toBe(testCtx.libraryStorageId);
    const adapter = testCtx.ctx.files
      .getStorageService()
      .getAdapter(file.storageLocationId);
    expect(await adapter.exists(file.relativePath)).toBe(true);
  });

  it("reconciling the same source identity twice creates one item", async () => {
    const ingestLoc = await testCtx.ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, testCtx.ingestStorageId),
    });
    const epubPath = path.join(ingestLoc!.rootPath, "dedupe.epub");
    await fs.writeFile(
      epubPath,
      await buildMinimalEpub({ title: "Dedupe Book" }),
    );

    const params = {
      ingestRootId: testCtx.ingestRootId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: "dedupe.epub",
      originalFilename: "dedupe.epub",
      size: (await fs.stat(epubPath)).size,
    };

    const first = await testCtx.ctx.ingest.reconcileFilesystemFile(params);
    const second = await testCtx.ctx.ingest.reconcileFilesystemFile(params);

    expect(first.item.id).toBe(second.item.id);
    expect(second.created).toBe(false);

    const rows = await testCtx.ctx.db
      .select()
      .from(schema.ingestItems)
      .where(eq(schema.ingestItems.sourceIdentity, first.item.sourceIdentity));
    expect(rows.length).toBe(1);
  });
});
