import { describe, it, expect } from "vitest";
import {
  PathTraversalError,
  StorageReadOnlyError,
} from "../src/shared/errors.js";
import {
  resolveSafePath,
  normalizeRelativePath,
} from "../src/server/security/paths.js";
import { StorageAdapter } from "../src/server/modules/storage/adapter.js";
import { MetadataProviderRegistry } from "../src/server/modules/metadata/registry.js";
import { METADATA_PROVIDER_CONTRACT } from "../src/shared/metadata-contract/index.js";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_NAMES,
} from "../src/shared/permissions.js";
import {
  inferFormatFromPath,
  titleFromPath,
  SUBJECT_TYPES,
} from "../src/shared/subject.js";

describe("Path security", () => {
  it("rejects path traversal in normalizeRelativePath", () => {
    expect(() => normalizeRelativePath("../etc/passwd")).toThrow(
      PathTraversalError,
    );
    expect(() => normalizeRelativePath("foo/../../bar")).toThrow(
      PathTraversalError,
    );
  });

  it("resolves paths within root", async () => {
    const root = process.cwd();
    const resolved = await resolveSafePath(root, "subdir/file.txt");
    expect(resolved.startsWith(root)).toBe(true);
  });
});

describe("Storage read-only", () => {
  it("read-only adapter rejects writes", () => {
    const adapter = new StorageAdapter({
      id: "1",
      name: "RO",
      kind: "read_only",
      rootPath: process.cwd(),
    });
    expect(() => adapter.assertWritable()).toThrow(StorageReadOnlyError);
  });
});

describe("Metadata provider registry", () => {
  it("does not invoke unregistered providers", async () => {
    const registry = new MetadataProviderRegistry();
    const results = await registry.fetchFromEnabled(["missing"], {});
    expect(results).toHaveLength(0);
  });

  it("invokes registered enabled providers only", async () => {
    const registry = new MetadataProviderRegistry();
    registry.register({
      key: "test",
      contractVersion: METADATA_PROVIDER_CONTRACT,
      provider: {
        key: "test",
        contractVersion: METADATA_PROVIDER_CONTRACT,
        descriptor: {
          id: "test",
          name: "Test",
          mediaModules: ["books"],
          sourceType: "local",
          fields: ["title"],
          implemented: true,
        },
        async fetch() {
          return { payload: { ok: true } };
        },
      },
    });
    const results = await registry.fetchFromEnabled(["test"], {});
    expect(results).toHaveLength(1);
  });
});

describe("Permission model", () => {
  it("defines four default roles with permission unions", () => {
    expect(Object.keys(ROLE_PERMISSIONS)).toEqual(
      expect.arrayContaining([
        ROLE_NAMES.ADMIN,
        ROLE_NAMES.CURATOR,
        ROLE_NAMES.MEMBER,
        ROLE_NAMES.KID,
      ]),
    );
    expect(ROLE_PERMISSIONS[ROLE_NAMES.ADMIN]).toContain(
      PERMISSIONS.USERS_READ,
    );
    expect(ROLE_PERMISSIONS[ROLE_NAMES.MEMBER]).not.toContain(
      PERMISSIONS.USERS_READ,
    );
    expect(ROLE_PERMISSIONS[ROLE_NAMES.KID]).not.toContain(
      PERMISSIONS.SHELF_PUBLISH,
    );
    expect(ROLE_PERMISSIONS[ROLE_NAMES.MEMBER]).toContain(
      PERMISSIONS.BOOKS_READ,
    );
  });
});

describe("Subject and representation helpers", () => {
  it("infers format from file path", () => {
    expect(inferFormatFromPath("books/novel.epub")).toBe("epub");
    expect(inferFormatFromPath("docs/guide.PDF")).toBe("pdf");
    expect(inferFormatFromPath("unknown.xyz")).toBe("other");
  });

  it("derives title from path", () => {
    expect(titleFromPath("books/my-great-novel.epub")).toBe("my great novel");
  });

  it("includes WEM and application subject types", () => {
    expect(SUBJECT_TYPES).toContain("book");
    expect(SUBJECT_TYPES).toContain("expression");
    expect(SUBJECT_TYPES).toContain("manifestation");
    expect(SUBJECT_TYPES).toContain("representation");
  });
});
