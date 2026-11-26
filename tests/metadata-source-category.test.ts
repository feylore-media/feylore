import { describe, it, expect } from "vitest";
import { getMetadataSourceCategory } from "../src/shared/metadata-source-category.js";
import { embeddedEpubOpfDescriptor } from "../src/providers/embedded.epub.opf/descriptor.js";
import { hardcoverDescriptor } from "../src/providers/hardcover/descriptor.js";

describe("metadata source category", () => {
  it("classifies embedded sources as imported", () => {
    expect(getMetadataSourceCategory(embeddedEpubOpfDescriptor)).toBe("imported");
  });

  it("classifies API sources as provider", () => {
    expect(getMetadataSourceCategory(hardcoverDescriptor)).toBe("provider");
  });

  it("never returns canonical from descriptor classifier", () => {
    const result = getMetadataSourceCategory(hardcoverDescriptor);
    expect(result).not.toBe("canonical");
  });
});
