import { describe, it, expect, beforeAll } from "vitest";
import { MetadataProviderRegistry } from "../src/server/modules/metadata/registry.js";
import { bootstrapMetadataProviders } from "../src/server/modules/metadata/bootstrap.js";
import { openLibraryDescriptor } from "../src/providers/open-library/descriptor.js";

describe("metadata source registry", () => {
  let registry: MetadataProviderRegistry;

  beforeAll(() => {
    registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
  });

  it("lists all registered descriptors", () => {
    const descriptors = registry.listDescriptors();
    expect(descriptors.length).toBeGreaterThanOrEqual(8);
    expect(descriptors.map((d) => d.id)).toContain("open-library");
    expect(descriptors.map((d) => d.id)).toContain("hardcover");
  });

  it("filters descriptors by media module", () => {
    const books = registry.listDescriptors("books");
    expect(books.every((d) => d.mediaModules.includes("books"))).toBe(true);
    const video = registry.listDescriptors("video");
    expect(video.some((d) => d.id === "imdb")).toBe(true);
  });

  it("discovers independently registered source without UI changes", () => {
    registry.register({
      key: "test-extra",
      contractVersion: "feylore.metadata.provider.v1",
      provider: {
        key: "test-extra",
        contractVersion: "feylore.metadata.provider.v1",
        descriptor: {
          id: "test-extra",
          name: "Test Extra",
          mediaModules: ["books"],
          sourceType: "local",
          fields: ["title"],
          implemented: true,
        },
        async fetch() {
          return { payload: { title: "Extra" } };
        },
      },
    });
    expect(registry.getDescriptor("test-extra")?.name).toBe("Test Extra");
  });

  it("declares canonical fields only in descriptors", () => {
    const ol = registry.getDescriptor("open-library");
    expect(ol?.fields).toEqual(openLibraryDescriptor.fields);
    expect(ol?.fields.every((f) => !f.startsWith("custom."))).toBe(true);
  });
});
