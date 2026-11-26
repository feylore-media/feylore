import { describe, it, expect } from "vitest";
import {
  mergeMetadataFields,
  opfToPayload,
} from "../src/server/modules/metadata/merge.js";
import type { CanonicalFieldId } from "../src/shared/metadata-fields.js";

describe("metadata merge engine", () => {
  const fieldPolicies = new Map<CanonicalFieldId, string[]>([
    ["title", ["hardcover", "open-library", "embedded.epub.opf"]],
    ["authors", ["open-library", "embedded.epub.opf"]],
  ]);

  it("resolves fields by priority order", () => {
    const sourcePayloads = new Map<string, Record<string, unknown>>([
      ["hardcover", { title: "Hardcover Title" }],
      ["open-library", { title: "OL Title", authors: ["Author A"] }],
      ["embedded.epub.opf", { title: "OPF Title", authors: ["Author B"] }],
    ]);
    const { values, provenance } = mergeMetadataFields({
      fieldPolicies,
      sourcePayloads,
      overriddenFields: new Set(),
      matchingRules: {
        preferIsbnMatching: true,
        fillMissingFromLowerPriority: true,
        preferExactEditionMatch: true,
      },
    });
    expect(values.title).toBe("Hardcover Title");
    expect(provenance.title).toBe("hardcover");
    expect(values.authors).toEqual(["Author A"]);
    expect(provenance.authors).toBe("open-library");
  });

  it("respects user overrides", () => {
    const sourcePayloads = new Map<string, Record<string, unknown>>([
      ["hardcover", { title: "Hardcover Title" }],
    ]);
    const { values } = mergeMetadataFields({
      fieldPolicies,
      sourcePayloads,
      overriddenFields: new Set(["title"]),
      matchingRules: {
        preferIsbnMatching: true,
        fillMissingFromLowerPriority: true,
        preferExactEditionMatch: true,
      },
    });
    expect(values.title).toBeUndefined();
  });

  it("maps OPF data to canonical payload", () => {
    const payload = opfToPayload({
      title: "Book",
      authors: ["Alice"],
      identifiers: [{ value: "9780000000000" }],
    });
    expect(payload.title).toBe("Book");
    expect(payload.isbn13).toBe("9780000000000");
  });
});
