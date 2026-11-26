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

describe.skipIf(!ingestDbAvailable)("Ingest watcher idempotency", () => {
  let testCtx: IngestTestContext;

  beforeAll(async () => {
    testCtx = await createIngestTestContext("ingest-watcher@test.local");
  });

  afterAll(async () => {
    await destroyIngestTestContext(testCtx);
  });

  it("deduplicates rapid reconcile calls for the same file", async () => {
    const ingestLoc = await testCtx.ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, testCtx.ingestStorageId),
    });
    const epubPath = path.join(ingestLoc!.rootPath, "watcher-race.epub");
    await fs.writeFile(
      epubPath,
      await buildMinimalEpub({ title: "Watcher Race Book" }),
    );

    const params = {
      ingestRootId: testCtx.ingestRootId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: "watcher-race.epub",
      originalFilename: "watcher-race.epub",
      size: (await fs.stat(epubPath)).size,
    };

    const results = await Promise.all([
      testCtx.ctx.ingest.reconcileFilesystemFile(params),
      testCtx.ctx.ingest.reconcileFilesystemFile(params),
      testCtx.ctx.ingest.reconcileFilesystemFile(params),
    ]);

    const ids = new Set(results.map((r) => r.item.id));
    expect(ids.size).toBe(1);

    const rows = await testCtx.ctx.db
      .select()
      .from(schema.ingestItems)
      .where(
        eq(
          schema.ingestItems.sourceIdentity,
          testCtx.ctx.ingest.items.buildSourceIdentity({
            sourceKind: "filesystem",
            ingestRootId: testCtx.ingestRootId,
            relativePath: "watcher-race.epub",
          }),
        ),
      );
    expect(rows.length).toBe(1);
  });

  it("does not create a second item while first is still processing", async () => {
    const ingestLoc = await testCtx.ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, testCtx.ingestStorageId),
    });
    const epubPath = path.join(ingestLoc!.rootPath, "processing-lock.epub");
    await fs.writeFile(
      epubPath,
      await buildMinimalEpub({ title: "Processing Lock Book" }),
    );

    const params = {
      ingestRootId: testCtx.ingestRootId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: "processing-lock.epub",
      originalFilename: "processing-lock.epub",
      size: (await fs.stat(epubPath)).size,
    };

    const first = await testCtx.ctx.ingest.reconcileFilesystemFile(params);
    await testCtx.ctx.db
      .update(schema.ingestItems)
      .set({ status: "analyzing" })
      .where(eq(schema.ingestItems.id, first.item.id));

    const second = await testCtx.ctx.ingest.reconcileFilesystemFile(params);
    expect(second.item.id).toBe(first.item.id);
    expect(second.enqueued).toBe(false);
  });

  it("does not re-queue terminal needs_attention items on reconcile", async () => {
    const ingestLoc = await testCtx.ctx.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.id, testCtx.ingestStorageId),
    });
    const epubPath = path.join(ingestLoc!.rootPath, "terminal-lock.epub");
    await fs.writeFile(
      epubPath,
      await buildMinimalEpub({ title: "Terminal Lock Book" }),
    );

    const params = {
      ingestRootId: testCtx.ingestRootId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: "terminal-lock.epub",
      originalFilename: "terminal-lock.epub",
      size: (await fs.stat(epubPath)).size,
    };

    const first = await testCtx.ctx.ingest.reconcileFilesystemFile(params);
    await testCtx.ctx.db
      .update(schema.ingestItems)
      .set({
        status: "completed",
        terminalState: "needs_attention",
        error: "No destination library configured",
      })
      .where(eq(schema.ingestItems.id, first.item.id));

    const second = await testCtx.ctx.ingest.reconcileFilesystemFile(params);
    expect(second.item.id).toBe(first.item.id);
    expect(second.enqueued).toBe(false);

    const item = await testCtx.ctx.ingest.items.getById(first.item.id);
    expect(item?.terminalState).toBe("needs_attention");
    expect(item?.status).toBe("completed");
  });
});
