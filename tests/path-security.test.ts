import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { PathTraversalError } from "../src/shared/errors.js";
import {
  normalizeRelativePath,
  normalizeZipEntryPath,
  isPathContainedInRoot,
  resolveSafePath,
} from "../src/server/security/paths.js";
import { StorageAdapter } from "../src/server/modules/storage/adapter.js";
import { readEpubContainer } from "../src/server/modules/metadata/extractors/epub-opf.js";

describe("normalizeRelativePath (lexical)", () => {
  it("accepts valid relative paths", () => {
    expect(normalizeRelativePath("subdir/file.txt")).toBe("subdir/file.txt");
    expect(normalizeRelativePath("./subdir/file.txt")).toBe("subdir/file.txt");
    expect(normalizeRelativePath(".")).toBe(".");
    expect(normalizeRelativePath("")).toBe(".");
  });

  it("rejects traversal segments", () => {
    expect(() => normalizeRelativePath("../etc/passwd")).toThrow(
      PathTraversalError,
    );
    expect(() => normalizeRelativePath("foo/../../bar")).toThrow(
      PathTraversalError,
    );
  });

  it("rejects absolute paths", () => {
    expect(() => normalizeRelativePath("/etc/passwd")).toThrow(
      PathTraversalError,
    );
    expect(() => normalizeRelativePath("C:/Windows/System32")).toThrow(
      PathTraversalError,
    );
  });

  it("rejects null bytes", () => {
    expect(() => normalizeRelativePath("foo\0bar")).toThrow(PathTraversalError);
  });
});

describe("normalizeZipEntryPath (lexical)", () => {
  it("rejects root-only zip entry paths", () => {
    expect(() => normalizeZipEntryPath(".")).toThrow(PathTraversalError);
    expect(() => normalizeZipEntryPath("")).toThrow(PathTraversalError);
  });

  it("accepts valid zip entry paths", () => {
    expect(normalizeZipEntryPath("OEBPS/content.opf")).toBe("OEBPS/content.opf");
  });
});

describe("isPathContainedInRoot (lexical)", () => {
  it("detects containment without prefix false positives", () => {
    const root = path.resolve("/tmp/feylore-root");
    expect(
      isPathContainedInRoot(root, path.join(root, "books", "file.epub")),
    ).toBe(true);
    expect(
      isPathContainedInRoot(root, path.resolve("/tmp/feylore-root-evil")),
    ).toBe(false);
  });
});

describe("resolveSafePath (filesystem)", () => {
  let root: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-path-"));
    await fs.mkdir(path.join(root, "subdir"), { recursive: true });
    await fs.writeFile(path.join(root, "subdir", "file.txt"), "ok");
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("resolves paths within root", async () => {
    const resolved = await resolveSafePath(root, "subdir/file.txt");
    expect(resolved).toBe(path.join(root, "subdir", "file.txt"));
  });

  it("rejects escape attempts", async () => {
    await expect(resolveSafePath(root, "../outside.txt")).rejects.toThrow(
      PathTraversalError,
    );
  });

  it("allows non-existent paths under root for write operations", async () => {
    const resolved = await resolveSafePath(root, "subdir/new-file.txt");
    expect(resolved).toBe(path.join(root, "subdir", "new-file.txt"));
  });
});

describe("resolveSafePath symlink escape", () => {
  let root: string;
  let outsideFile: string;
  let canSymlink = true;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-symlink-"));
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "feylore-out-"));
    outsideFile = path.join(outsideDir, "secret.txt");
    await fs.writeFile(outsideFile, "secret");

    try {
      await fs.symlink(outsideFile, path.join(root, "escape-link"));
    } catch {
      canSymlink = false;
    }
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rejects symlinks that escape the storage root", async () => {
    if (!canSymlink) return;

    const adapter = new StorageAdapter({
      id: "symlink-test",
      name: "Symlink Test",
      kind: "managed",
      rootPath: root,
    });

    await expect(adapter.resolve("escape-link")).rejects.toThrow(
      PathTraversalError,
    );
    await expect(adapter.createReadStream("escape-link")).rejects.toThrow(
      PathTraversalError,
    );
  });
});

describe("readEpubContainer zip entry validation", () => {
  it("rejects malicious full-path in container.xml", async () => {
    const zip = new JSZip();
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="../secret.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    );

    await expect(readEpubContainer(zip)).rejects.toThrow(PathTraversalError);
  });

  it("reads valid container.xml", async () => {
    const zip = new JSZip();
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    );
    zip.file(
      "OEBPS/content.opf",
      `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test</dc:title>
    <dc:identifier id="id">test-id</dc:identifier>
  </metadata>
  <manifest/>
  <spine/>
</package>`,
    );

    const { opfPath } = await readEpubContainer(zip);
    expect(opfPath).toBe("OEBPS/content.opf");
  });
});
