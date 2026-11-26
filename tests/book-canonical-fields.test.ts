import { describe, it, expect } from "vitest";
import {
  BOOK_METADATA_EDITOR_FIELD_ORDER,
  getBookCanonicalFieldSpecs,
  getBookEditorFieldOrder,
  getBookFieldKind,
  getBookMergePayloadKeys,
  isBookUserFacingField,
} from "../src/shared/book-metadata-field-kinds.js";
import {
  CANONICAL_FIELDS,
  getCanonicalFieldsForModule,
} from "../src/shared/metadata-fields.js";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("book canonical field registry", () => {
  const bookFieldIds = getCanonicalFieldsForModule("books")
    .filter((f) => f.id !== "rating")
    .map((f) => f.id);

  it("orders cover first in editor field order", () => {
    expect(BOOK_METADATA_EDITOR_FIELD_ORDER[0]).toBe("cover");
    expect(BOOK_METADATA_EDITOR_FIELD_ORDER).toContain("publicationCountry");
    expect(getBookEditorFieldOrder()).not.toContain("identifiers");
  });

  it("keeps package identifiers internal-only", () => {
    const spec = getBookCanonicalFieldSpecs().find((s) => s.id === "identifiers");
    expect(spec?.userFacing).toBe(false);
    expect(isBookUserFacingField("identifiers")).toBe(false);
  });

  it("defines a spec and kind for every book metadata field", () => {
    for (const fieldId of bookFieldIds) {
      const spec = getBookCanonicalFieldSpecs().find((s) => s.id === fieldId);
      expect(spec, `missing spec for ${fieldId}`).toBeDefined();
      expect(getBookFieldKind(fieldId)).toBe(spec!.kind);
    }
  });

  it("includes merge payload keys for source-mergeable book fields", () => {
    const mergeKeys = getBookMergePayloadKeys();
    for (const spec of getBookCanonicalFieldSpecs()) {
      if (spec.sourceMergeable) {
        expect(mergeKeys[spec.id], `missing merge key for ${spec.id}`).toBeDefined();
      }
    }
  });

  it("does not auto-merge tags from provider subjects", () => {
    const tagsSpec = getBookCanonicalFieldSpecs().find((s) => s.id === "tags");
    expect(tagsSpec?.sourceMergeable).toBe(false);
    expect(tagsSpec?.mergePayloadKeys).toBeUndefined();
  });

  it("uses registry as sole book field list in detail/editor modules", () => {
    const detailSource = readFileSync(
      path.join("src/server/modules/metadata/book-detail-metadata.ts"),
      "utf8",
    );
    const editorSource = readFileSync(
      path.join("src/server/modules/metadata/book-metadata-editor.ts"),
      "utf8",
    );
    const metadataPageSource = readFileSync(
      path.join("src/web/app/pages/books/detail/BookMetadataPage.tsx"),
      "utf8",
    );
    const editorUiSource = readFileSync(
      path.join(
        "src/web/components/books/metadata-edit/MetadataMatrixEditor.tsx",
      ),
      "utf8",
    );

    expect(detailSource).toContain("buildBookMetadataFields");
    expect(editorSource).toContain("getBookEditorFieldOrder");
    expect(metadataPageSource).toContain("getBookEditorFieldGroups");
    expect(editorUiSource).toContain("MetadataMatrixFieldRow");
    expect(detailSource).not.toMatch(/PRIMARY_BOOK_FIELDS/);
  });

  it("has no orphan book field IDs outside canonical definitions", () => {
    const canonicalIds = new Set(CANONICAL_FIELDS.map((f) => f.id));
    for (const spec of getBookCanonicalFieldSpecs()) {
      expect(canonicalIds.has(spec.id)).toBe(true);
    }
  });
});
