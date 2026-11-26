import { describe, it, expect, vi } from "vitest";
import { MetadataProviderRegistry } from "../src/server/modules/metadata/registry.js";
import { MetadataService } from "../src/server/modules/metadata/service.js";
import { bootstrapMetadataProviders } from "../src/server/modules/metadata/bootstrap.js";
import { encryptConfig, decryptConfig } from "../src/server/security/secrets.js";
import * as outboundFetch from "../src/server/modules/metadata/outbound-fetch.js";

const SECRET = "test-secret-key-16chars";

describe("metadata providers", () => {
  it("encrypts and decrypts config", () => {
    const encrypted = encryptConfig(SECRET, { apiKey: "secret-value" });
    const decrypted = decryptConfig(SECRET, encrypted);
    expect(decrypted.apiKey).toBe("secret-value");
    expect(encrypted).not.toContain("secret-value");
  });

  it("lists descriptor-only sources as not implemented", () => {
    const registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
    const imdb = registry.getDescriptor("imdb");
    expect(imdb?.implemented).toBe(false);
  });

  it("marks functional sources as implemented", () => {
    const registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
    expect(registry.getDescriptor("open-library")?.implemented).not.toBe(false);
    expect(registry.getDescriptor("hardcover")?.implemented).not.toBe(false);
    expect(registry.getDescriptor("audible")?.implemented).toBe(true);
  });

  it("audible provider returns null without ASIN", async () => {
    const registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
    const provider = registry.get("audible");
    expect(provider).toBeTruthy();
    const result = await provider!.fetch({ hints: { title: "Test" } });
    expect(result).toBeNull();
  });

  it("audible provider returns null when AudNexus fetch fails", async () => {
    const registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
    const provider = registry.get("audible");
    const spy = vi
      .spyOn(outboundFetch, "outboundFetchJson")
      .mockRejectedValue(new Error("network"));
    const result = await provider!.fetch({ hints: { asin: "B012345678" } });
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it("audible provider maps AudNexus payload for known ASIN", async () => {
    const registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
    const provider = registry.get("audible");
    const spy = vi.spyOn(outboundFetch, "outboundFetchJson").mockResolvedValue({
      asin: "B012345678",
      title: "Test Audiobook",
      authors: [{ name: "Author One" }],
      narrators: [{ name: "Narrator One" }],
    });
    const result = await provider!.fetch({ hints: { asin: "B012345678" } });
    expect(result?.externalId).toBe("B012345678");
    expect(result?.payload.title).toBe("Test Audiobook");
    spy.mockRestore();
  });

  it("registry fetch skips not-implemented sources", async () => {
    const registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
    const results = await registry.fetchFromEnabled(
      ["imdb", "open-library"],
      { hints: { title: "Test" } },
    );
    expect(results.every((r) => r.providerKey !== "imdb")).toBe(true);
  });

  it("open-library provider maps ISBN lookup chain", async () => {
    const registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
    const provider = registry.get("open-library");
    expect(provider).toBeTruthy();

    const edition = {
      key: "/books/OL26095592M",
      title: "Expatriots",
      subtitle: "A novel",
      isbn_13: ["9780091953638"],
      publishers: ["Penguin"],
      publish_date: "2012",
      languages: [{ key: "/languages/eng" }],
      number_of_pages: 400,
      works: [{ key: "/works/OL17507444W" }],
    };
    const work = {
      key: "/works/OL17507444W",
      title: "Expatriots",
      description: "A sci-fi novel.",
      subjects: ["Science fiction"],
      first_publish_date: "2011",
    };

    const spy = vi
      .spyOn(outboundFetch, "outboundFetchJson")
      .mockImplementation(async (url: string) => {
        if (url.includes("/isbn/9780091953638")) return edition;
        if (url.includes("/works/OL17507444W")) return work;
        throw new Error(`unexpected url: ${url}`);
      });

    const result = await provider!.fetch({
      hints: { isbn13: "9780091953638" },
    });

    expect(result?.externalId).toBe("works/OL17507444W");
    expect(result?.payload.title).toBe("Expatriots");
    expect(result?.payload.subtitle).toBe("A novel");
    expect(result?.payload.isbn13).toBe("9780091953638");
    expect(result?.payload.description).toBe("A sci-fi novel.");
    expect(result?.payload.language).toBe("eng");
    expect(result?.payload.originalLanguage).toBeUndefined();
    expect(result?.payload.pageCount).toBe(400);
    expect(result?.payload.asin).toBeUndefined();

    spy.mockRestore();
  });

  it("hardcover provider maps ISBN edition lookup", async () => {
    const registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
    const provider = registry.get("hardcover");
    expect(provider).toBeTruthy();

    const editionResponse = JSON.stringify({
      data: {
        editions: [
          {
            id: 100,
            isbn_13: "9780091953638",
            isbn_10: "0091953635",
            pages: 400,
            physical_format: "Paperback",
            publisher: { name: "Penguin" },
            language: { language: "eng" },
            book: {
              id: 99,
              title: "Expatriots",
              subtitle: "A novel",
              description: "A sci-fi novel.",
              release_date: "2012-01-01",
              pages: 380,
              rating: 3.8,
              slug: "expatriots",
              cached_image: "https://assets.hardcover.app/expatriots.jpg",
              cached_tags: { Genre: ["Science Fiction"] },
              contributions: [{ author: { name: "Author One" } }],
              book_series: [],
              editions: [
                {
                  id: 100,
                  isbn_13: "9780091953638",
                  isbn_10: "0091953635",
                  pages: 400,
                  publisher: { name: "Penguin" },
                },
              ],
            },
          },
        ],
      },
    });

    const spy = vi
      .spyOn(outboundFetch, "outboundFetch")
      .mockResolvedValue({
        status: 200,
        body: editionResponse,
        headers: new Headers(),
      });

    const result = await provider!.fetch(
      { hints: { isbn13: "9780091953638" } },
      { apiKey: "hc_pat_test" },
    );

    expect(result?.externalId).toBe("99");
    expect(result?.payload.title).toBe("Expatriots");
    expect(result?.payload.subtitle).toBe("A novel");
    expect(result?.payload.isbn13).toBe("9780091953638");
    expect(result?.payload.publisher).toBe("Penguin");
    expect(result?.payload.pageCount).toBe(400);
    expect(result?.payload.language).toBe("eng");
    expect(result?.payload["hardcover.rating"]).toBe(3.8);

    const [, options] = spy.mock.calls[0] ?? [];
    expect(options?.headers?.Authorization).toBe("Bearer hc_pat_test");

    spy.mockRestore();
  });

  it("hardcover testConnection uses normalized auth header", async () => {
    const registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
    const provider = registry.get("hardcover");
    expect(provider).toBeTruthy();

    const spy = vi
      .spyOn(outboundFetch, "outboundFetch")
      .mockResolvedValue({
        status: 200,
        body: JSON.stringify({ data: { me: { id: 1, username: "reader" } } }),
        headers: new Headers(),
      });

    const result = await provider!.testConnection!({
      apiKey: "Bearer hc_pat_test",
    });

    expect(result.ok).toBe(true);
    const [, options] = spy.mock.calls[0] ?? [];
    expect(options?.headers?.Authorization).toBe("Bearer hc_pat_test");
    expect(options?.headers?.Authorization).not.toBe("Bearer Bearer hc_pat_test");

    spy.mockRestore();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("metadata provider enablement", () => {
  it("excludes disabled sources from module fetch list", async () => {
    const { createPool, createDb } = await import("../src/server/db/client.js");
    const pool = createPool(process.env.DATABASE_URL!);
    const db = createDb(pool);
    const registry = new MetadataProviderRegistry();
    bootstrapMetadataProviders(registry);
    const metadata = new MetadataService(db, registry, SECRET);
    await metadata.upsertProvider({
      key: "open-library",
      contractVersion: "feylore.metadata.provider.v1",
      enabled: false,
    });
    const keys = await metadata.getEnabledProviderKeysForModule("books");
    expect(keys).not.toContain("open-library");
    await pool.end();
  });
});
