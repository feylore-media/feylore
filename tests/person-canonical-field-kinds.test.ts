import { describe, it, expect } from "vitest";
import {
  PERSON_METADATA_EDITOR_FIELD_ORDER,
  getPersonCanonicalFieldSpecs,
  getPersonFieldKind,
  getPersonMergePayloadKeys,
  isPersonUserFacingField,
} from "../src/shared/person-metadata-field-kinds.js";
import {
  CANONICAL_FIELDS,
  getCanonicalFieldsForModule,
} from "../src/shared/metadata-fields.js";

describe("person canonical field registry", () => {
  const personFieldIds = getCanonicalFieldsForModule("people").map((f) => f.id);

  it("orders portrait first in editor field order", () => {
    expect(PERSON_METADATA_EDITOR_FIELD_ORDER[0]).toBe("photo");
    expect(PERSON_METADATA_EDITOR_FIELD_ORDER).toContain("deathPlace");
  });

  it("defines a spec and kind for every person metadata field", () => {
    for (const fieldId of personFieldIds) {
      const spec = getPersonCanonicalFieldSpecs().find((s) => s.id === fieldId);
      expect(spec, `missing spec for ${fieldId}`).toBeDefined();
      expect(getPersonFieldKind(fieldId)).toBe(spec!.kind);
    }
  });

  it("uses commaList for alternate names and cover for portrait", () => {
    expect(getPersonFieldKind("alternateNames")).toBe("commaList");
    expect(getPersonFieldKind("photo")).toBe("cover");
  });

  it("defines merge payload keys for source-mergeable person fields", () => {
    const mergeKeys = getPersonMergePayloadKeys();
    for (const spec of getPersonCanonicalFieldSpecs()) {
      if (spec.sourceMergeable) {
        expect(mergeKeys[spec.id], `missing merge key for ${spec.id}`).toBeDefined();
      }
    }
  });

  it("has no orphan person field IDs outside canonical definitions", () => {
    const canonicalIds = new Set(CANONICAL_FIELDS.map((f) => f.id));
    for (const spec of getPersonCanonicalFieldSpecs()) {
      expect(canonicalIds.has(spec.id)).toBe(true);
    }
  });

  it("marks name as primary and the only person field usable as a person record title", () => {
    const primary = getPersonCanonicalFieldSpecs()
      .filter((s) => s.primary)
      .map((s) => s.id);
    expect(primary).toEqual(["name"]);
    expect(isPersonUserFacingField("name")).toBe(true);
  });
});