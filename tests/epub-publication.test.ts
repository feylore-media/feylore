import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createPool, createDb } from "../src/server/db/client.js";
import * as schema from "../src/server/db/schema.js";
import { generateId } from "../src/server/security/crypto.js";
import { EpubPublicationService } from "../src/server/modules/books/epub-publication.js";
import { FileService, FileReferenceRegistry } from "../src/server/modules/files/service.js";
import { StorageService } from "../src/server/modules/storage/adapter.js";
import { PathTraversalError } from "../src/shared/errors.js";
import { buildMinimalEpub } from "./fixtures/epub/build-minimal-epub.js";

describe("EpubPublicationService", () => {
  let storageRoot: string;
  let storage: StorageService;
  let files: FileService;
  let epub: EpubPublicationService;

  beforeAll(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-epub-"));
    storage = new StorageService();
    files = new FileService(createDb(createPool(
      process.env.DATABASE_URL ??
        "postgresql://feylore:feylore@localhost:5432/feylore_test",
    )), storage, new FileReferenceRegistry());
    epub = new EpubPublicationService(files);
  });

  async function registerFile(relativePath: string, buffer: Buffer) {
    await fs.writeFile(path.join(storageRoot, relativePath), buffer);
    const storageId = generateId();
    storage.register({
      id: storageId,
      name: "EPUB Test",
      kind: "managed",
      rootPath: storageRoot,
    });
    const fileId = generateId();
    const db = createDb(createPool(
      process.env.DATABASE_URL ??
        "postgresql://feylore:feylore@localhost:5432/feylore_test",
    ));
    await db.insert(schema.storageLocations).values({
      id: storageId,
      name: "EPUB Test",
      kind: "managed",
      rootPath: storageRoot,
    });
    await db.insert(schema.files).values({
      id: fileId,
      storageLocationId: storageId,
      relativePath,
      size: buffer.length,
      mediaType: "application/epub+zip",
    });
    return fileId;
  }

  it("normalizes resource paths and rejects traversal", () => {
    expect(epub.normalizeResourcePath("chapter.xhtml")).toBe("chapter.xhtml");
    expect(() => epub.normalizeResourcePath("../secret")).toThrow(
      PathTraversalError,
    );
  });

  it("builds manifest with reading order and optional toc", async () => {
    const buffer = await buildMinimalEpub({ withToc: true, title: "TOC Book" });
    const fileId = await registerFile("toc-test.epub", buffer);

    const { manifest } = await epub.buildManifest(
      fileId,
      "/api/v1/representations/test/publication/resource",
    );

    expect(manifest.readingOrder).toHaveLength(1);
    expect(manifest.metadata.title).toBe("TOC Book");
    expect(manifest.toc).toBeDefined();
    expect((manifest.toc as unknown[]).length).toBeGreaterThan(0);
  });

  it("includes media overlay metadata when present", async () => {
    const buffer = await buildMinimalEpub({ withMediaOverlay: true });
    const fileId = await registerFile("overlay-test.epub", buffer);

    const { manifest } = await epub.buildManifest(
      fileId,
      "/api/v1/representations/test/publication/resource",
    );

    const metadata = manifest.metadata as { mediaOverlay?: { activeClass?: string } };
    expect(metadata.mediaOverlay?.activeClass).toBe("-epub-media-overlay-active");
    const first = manifest.readingOrder[0] as { alternates?: unknown[] };
    expect(first.alternates?.length).toBeGreaterThan(0);
  });
});

describe("Media overlay SMIL parsing", () => {
  it("parses segments from SMIL", async () => {
    const { parseSmilDocument } = await import(
      "../src/web/reader/adapter/mediaOverlay.js"
    );
    const xml = `<?xml version="1.0"?>
<smil xmlns="http://www.w3.org/ns/SMIL"><body><seq>
<par><text src="chapter.xhtml#p1"/><audio src="audio.mp3" clipBegin="0s" clipEnd="1.5s"/></par>
</seq></body></smil>`;
    const segments = parseSmilDocument(xml, "overlay.smil");
    expect(segments).toHaveLength(1);
    expect(segments[0]!.audioSrc).toBe("audio.mp3");
    expect(segments[0]!.clipEnd).toBe(1.5);
  });
});
