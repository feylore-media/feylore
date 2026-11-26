import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildMinimalEpub } from "./fixtures/epub/build-minimal-epub.js";
import {
  createIngestTestContext,
  destroyIngestTestContext,
  ingestDbAvailable,
  type IngestTestContext,
} from "./helpers/ingest-setup.js";

describe.skipIf(!ingestDbAvailable)("Ingest upload", () => {
  let testCtx: IngestTestContext;

  beforeAll(async () => {
    testCtx = await createIngestTestContext("ingest-upload@test.local");
  });

  afterAll(async () => {
    await destroyIngestTestContext(testCtx);
  });

  it("uploads EPUB to staging and completes ingest", async () => {
    const epubBuffer = await buildMinimalEpub({ title: "Upload Test Book" });
    const uploadId = crypto.randomUUID();

    const stored = await testCtx.ctx.ingest.storeUploadFile({
      uploadId,
      filename: "upload-test.epub",
      data: epubBuffer,
      storageLocationId: testCtx.ingestStorageId,
    });

    const result = await testCtx.ctx.ingest.reconcileUpload({
      uploadId,
      storageLocationId: testCtx.ingestStorageId,
      relativePath: stored.relativePath,
      originalFilename: stored.safeName,
      size: stored.size,
      checksum: stored.checksum,
      userId: testCtx.userId,
    });

    expect(result.created).toBe(true);

    await testCtx.ctx.ingest.getPipeline().process(result.item.id);

    const item = await testCtx.ctx.ingest.items.getById(result.item.id);
    expect(item?.status).toBe("completed");
    expect(item?.sourceKind).toBe("upload");
    expect(item?.sourcePath).toContain(".ingest-uploads");
  });

  it("accepts multipart upload via API", async () => {
    const epubBuffer = await buildMinimalEpub({ title: "API Upload Book" });
    const boundary = "----feylore-test-boundary";
    const prefix = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="api-upload.epub"\r\nContent-Type: application/epub+zip\r\n\r\n`,
      "utf8",
    );
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const body = Buffer.concat([prefix, epubBuffer, suffix]);

    const res = await testCtx.app.inject({
      method: "POST",
      url: "/api/v1/ingest/upload",
      headers: {
        cookie: testCtx.cookie,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(202);
    const payload = res.json() as { data: { ingestItemIds: string[] } };
    expect(payload.data.ingestItemIds.length).toBeGreaterThan(0);

    const itemId = payload.data.ingestItemIds[0]!;
    await testCtx.ctx.ingest.getPipeline().process(itemId);

    const item = await testCtx.ctx.ingest.items.getById(itemId);
    expect(item?.status).toBe("completed");
    expect(item?.terminalState).toBeNull();
  });
});
