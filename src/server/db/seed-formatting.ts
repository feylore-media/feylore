import type { Database } from "./client.js";
import * as schema from "./schema.js";
import { eq } from "drizzle-orm";
import { MetadataFormattingService } from "../modules/metadata/formatting.js";
import { normalizeVocabularyKey } from "../../shared/metadata-formatting.js";

const FORMATTING_SETTINGS_KEY = "metadata.formatting";
const DEFAULT_MEDIA = ["books", "audiobooks", "movies", "tv"] as const;
const DEFAULT_GENRES = [
  "Fiction", "Fantasy", "Young Adult", "Adventure", "Science Fiction",
  "Classics", "Comics & Graphic Novels", "History", "Romance", "LGBTQ",
  "War", "Juvenile Fiction", "Biography & Autobiography", "Mystery",
  "Religion", "Dystopian", "Nonfiction", "Philosophy", "Juvenile Nonfiction",
  "Business & Economics", "Science", "Thriller", "Computers & Technology",
  "Psychology", "Humor", "Poetry", "Politics & Social Science", "Travel",
  "Mathematics", "Cooking", "Art", "Education", "Horror", "Historical Fiction",
  "Self-Help", "Manga", "Health & Fitness", "Family & Relationships",
  "Sports & Recreation", "Drama", "True Crime", "Crafts & Hobbies", "Reference",
] as const;
const DEFAULT_TAGS = ["Award Winner", "Book Club"] as const;

export async function seedMetadataFormatting(db: Database) {
  const formatting = new MetadataFormattingService(db);
  if (!(await db.query.systemSettings.findFirst({
    where: eq(schema.systemSettings.key, FORMATTING_SETTINGS_KEY),
  }))) {
    await db.insert(schema.systemSettings).values({
      key: FORMATTING_SETTINGS_KEY,
      value: { languageRepresentation: "simple" },
    });
  }

  const rootIds = new Map<string, string>();
  for (const [sortOrder, name] of DEFAULT_GENRES.entries()) {
    const existing = await findTerm(db, "genre", name, null);
    const id = existing?.id ?? await formatting.createTerm({
      kind: "genre", name, mediaTypes: [...DEFAULT_MEDIA], sortOrder,
    });
    rootIds.set(name, id);
  }

  const ensureChild = async (name: string, parentName: string) => {
    const parentId = rootIds.get(parentName)!;
    const existing = await findTerm(db, "genre", name, parentId);
    return existing?.id ?? formatting.createTerm({
      kind: "genre", name, parentId, mediaTypes: [...DEFAULT_MEDIA],
    });
  };

  await ensureChild("Epic Fantasy", "Fantasy");
  const romantasy = await ensureChild("Romantasy", "Fantasy");
  await ensureAliases(db, formatting, romantasy, ["Romantic Fantasy", "Fantasy Romance"]);
  const scienceFiction = rootIds.get("Science Fiction")!;
  await ensureChild("Space Opera", "Science Fiction");
  await ensureChild("Alternate History", "Science Fiction");
  await ensureAliases(db, formatting, scienceFiction, ["Sci-Fi", "Sci Fi", "SF"]);
  await ensureChild("Cozy Mystery", "Mystery");
  await ensureAliases(db, formatting, rootIds.get("Young Adult")!, ["YA"]);

  for (const name of DEFAULT_TAGS) {
    if (!(await findTerm(db, "tag", name, null))) {
      await formatting.createTerm({ kind: "tag", name });
    }
  }
}

async function ensureAliases(
  db: Database,
  formatting: MetadataFormattingService,
  termId: string,
  required: string[],
) {
  const existing = await db
    .select({ alias: schema.metadataVocabularyAliases.alias })
    .from(schema.metadataVocabularyAliases)
    .where(eq(schema.metadataVocabularyAliases.termId, termId));
  const aliases = new Map<string, string>();
  for (const alias of [...existing.map((item) => item.alias), ...required]) {
    aliases.set(normalizeVocabularyKey(alias), alias);
  }
  const existingKeys = new Set(existing.map((item) => normalizeVocabularyKey(item.alias)));
  if (required.every((alias) => existingKeys.has(normalizeVocabularyKey(alias)))) return;
  await formatting.setAliases(termId, [...aliases.values()]);
}

async function findTerm(
  db: Database,
  kind: "genre" | "tag",
  name: string,
  parentId: string | null,
) {
  const rows = await db
    .select()
    .from(schema.metadataVocabularyTerms)
    .where(eq(schema.metadataVocabularyTerms.kind, kind));
  return rows.find(
    (term) => term.normalizedName === normalizeVocabularyKey(name) && term.parentId === parentId,
  );
}
