import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPool, createDb } from "../src/server/db/client.js";
import { MetadataProviderRegistry } from "../src/server/modules/metadata/registry.js";
import { MetadataPolicyService } from "../src/server/modules/metadata/policy.js";
import { bootstrapMetadataProviders } from "../src/server/modules/metadata/bootstrap.js";
import * as schema from "../src/server/db/schema.js";

const dbAvailable = !!process.env.DATABASE_URL;

describe.skipIf(!dbAvailable)("metadata policies", () => {
  const pool = createPool(process.env.DATABASE_URL!);
  const db = createDb(pool);
  const registry = new MetadataProviderRegistry();
  bootstrapMetadataProviders(registry);
  const policy = new MetadataPolicyService(db, registry);

  beforeAll(async () => {
    await db.delete(schema.metadataPolicies);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("seeds field-specific source priority on first access", async () => {
    const priorities = await policy.getFieldPriorities("books");
    const titleOrder = priorities.get("title");
    expect(titleOrder).toBeDefined();
    expect(titleOrder!.length).toBeGreaterThan(0);
    const isbnOrder = priorities.get("isbn13");
    expect(isbnOrder).toBeDefined();
    expect(isbnOrder![0]).not.toBe(titleOrder![0]);
  });

  it("persists provider priority reorder", async () => {
    await policy.setFieldPriorities("books", [
      {
        fieldId: "title",
        providerSourceOrder: ["open-library", "hardcover"],
      },
    ]);
    const providerPriorities = await policy.getProviderFieldPriorities("books");
    expect(providerPriorities.get("title")).toEqual([
      "open-library",
      "hardcover",
    ]);
    const ingestPriorities = await policy.getIngestFieldPriorities("books");
    expect(ingestPriorities.get("title")).toContain("embedded.epub.opf");
  });

  it("does not reorder existing policy when new source is registered", async () => {
    registry.register({
      key: "new-source",
      contractVersion: "feylore.metadata.provider.v1",
      provider: {
        key: "new-source",
        contractVersion: "feylore.metadata.provider.v1",
        descriptor: {
          id: "new-source",
          name: "New Source",
          mediaModules: ["books"],
          sourceType: "api",
          fields: ["title", "description"],
          implemented: true,
        },
        async fetch() {
          return null;
        },
      },
    });
    const priorities = await policy.getFieldPriorities("books");
    expect(priorities.get("title")).not.toContain("new-source");
    expect(priorities.get("title")![0]).toBe("open-library");
  });

  it("filters ineligible sources from priority lists", () => {
    const filtered = policy.filterEligibleSources("books", "narrator", [
      "open-library",
      "hardcover",
    ]);
    expect(filtered).toEqual([]);
  });

  it("lists unordered eligible sources for new registrations", () => {
    const existing = ["open-library", "hardcover"];
    const unordered = policy.getUnorderedEligibleSources(
      "books",
      "title",
      existing,
      "provider",
    );
    expect(unordered).toContain("new-source");
    expect(unordered).not.toContain("open-library");
  });
});
