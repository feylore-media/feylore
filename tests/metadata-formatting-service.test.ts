import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPool, createDb } from "../src/server/db/client.js";
import * as schema from "../src/server/db/schema.js";
import { MetadataFormattingService } from "../src/server/modules/metadata/formatting.js";
import {
  normalizeVocabularyKey,
  parseLanguageInput,
  resolveLanguage,
  scoreTermSimilarity,
} from "../src/shared/metadata-formatting.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://feylore:feylore@localhost:5432/feylore_test";

const dbAvailable = await (async () => {
  try {
    const pool = createPool(DATABASE_URL);
    const db = createDb(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await pool.end();
    return true;
  } catch {
    return false;
  }
})();

describe("metadata formatting helpers", () => {
  it("normalizes vocabulary keys case-insensitively", () => {
    expect(normalizeVocabularyKey("  Romantasy  ")).toBe("romantasy");
    expect(normalizeVocabularyKey("Fantasy   Romance")).toBe("fantasy romance");
  });

  it("parses language inputs to canonical language data", () => {
    expect(parseLanguageInput("en-US")).toEqual({ language: "en", region: "US" });
    expect(parseLanguageInput("english")).toEqual({ language: "en" });
    expect(parseLanguageInput("ja")).toEqual({ language: "ja" });
  });

  it("formats language by representation mode", () => {
    const canonical = parseLanguageInput("en-GB")!;
    expect(resolveLanguage("en-GB", "locale")).toBe("en-GB");
    expect(resolveLanguage("en-GB", "simple")).toBe("English");
    expect(resolveLanguage(canonical.language, "simple")).toBe("English");
  });

  it("scores term similarity deterministically", () => {
    expect(scoreTermSimilarity("Romantasy", "Romance Fantasy")).toBeGreaterThan(0);
    expect(scoreTermSimilarity("Horror", "Science Fiction")).toBeLessThan(20);
  });
});

describe.skipIf(!dbAvailable)("MetadataFormattingService", () => {
  const pool = createPool(DATABASE_URL);
  const db = createDb(pool);
  const formatting = new MetadataFormattingService(db);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  beforeEach(async () => {
    await db.delete(schema.metadataFormattingSuggestions);
    await db.delete(schema.metadataVocabularyAliases);
    await db.delete(schema.bookRatingGenreDefinitions);
    await db.delete(schema.metadataVocabularyTerms);
    await db.delete(schema.systemSettings);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates hierarchy up to three levels and rejects deeper trees", async () => {
    const root = await formatting.createTerm({ kind: "genre", name: "Fantasy" });
    const child = await formatting.createTerm({
      kind: "genre",
      name: "Epic Fantasy",
      parentId: root,
    });
    const grandchild = await formatting.createTerm({
      kind: "genre",
      name: "Portal Fantasy",
      parentId: child,
    });
    await expect(
      formatting.createTerm({
        kind: "genre",
        name: "Too Deep",
        parentId: grandchild,
      }),
    ).rejects.toThrow(/3 levels/i);
  });

  it("resolves aliases to canonical genre names", async () => {
    const fantasy = await formatting.createTerm({ kind: "genre", name: "Fantasy" });
    const romanceFantasy = await formatting.createTerm({
      kind: "genre",
      name: "Romance Fantasy",
      parentId: fantasy,
    });
    await formatting.setAliases(romanceFantasy, ["Romantasy", "Fantasy Romance"]);

    const resolved = await formatting.resolveGenres(["Romantasy", "Unknown Genre"]);
    expect(resolved).toContain("Romance Fantasy");
    expect(resolved).toContain("Unknown Genre");

    const suggestions = await formatting.listSuggestions("genre", "open");
    expect(suggestions.some((s) => s.rawValue === "Unknown Genre")).toBe(true);
  });

  it("resolveSuggestion assign_existing_term creates alias only", async () => {
    const sciFi = await formatting.createTerm({ kind: "genre", name: "Science Fiction" });
    const military = await formatting.createTerm({
      kind: "genre",
      name: "Military",
      parentId: sciFi,
    });
    await formatting.resolveGenres(["Mil SF"]);
    const [suggestion] = await formatting.listSuggestions("genre", "open");
    expect(suggestion).toBeDefined();

    await formatting.resolveSuggestion(
      suggestion!.id,
      "assign_existing_term",
      military,
    );

    const resolved = await formatting.resolveGenres(["Mil SF"]);
    expect(resolved).toEqual(["Military"]);
  });

  it("search returns ancestor path for nested terms", async () => {
    const root = await formatting.createTerm({ kind: "tag", name: "Award Winner" });
    await formatting.createTerm({ kind: "tag", name: "Hugo", parentId: root });
    const matches = await formatting.searchTerms("tag", "hugo");
    expect(matches[0]?.ancestorIds).toContain(root);
  });

  it("stores genre applicability, status, order, and generated slug", async () => {
    await formatting.createTerm({
      kind: "genre",
      name: "Books Only",
      mediaTypes: ["books"],
      enabled: false,
      sortOrder: 7,
    });
    expect(await formatting.listTerms("genre", "movies")).toEqual([]);
    const [term] = await formatting.listTerms("genre", "books");
    expect(term).toMatchObject({
      slug: "books-only",
      mediaTypes: ["books"],
      enabled: false,
      sortOrder: 7,
    });
  });

  it("prevents aliases from colliding with canonical genre names", async () => {
    const fantasy = await formatting.createTerm({ kind: "genre", name: "Fantasy" });
    await formatting.createTerm({ kind: "genre", name: "Science Fiction" });
    await expect(formatting.setAliases(fantasy, ["Science Fiction"]))
      .rejects.toThrow(/canonical term/i);
  });
});
