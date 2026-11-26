import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { ValidationError } from "../../../shared/errors.js";
import {
  RATING_SYSTEM_SETTINGS_KEY,
  ratingSystemSettingsSchema,
  type BookRatingScope,
  type GenreRatingDefinition,
  type RatingDimension,
  type RatingSystemSettings,
} from "../../../shared/ratings.js";

export type CoreDimensionInput = {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  displayOrder: number;
  required: boolean;
  contributesToRating: boolean;
  weight: number;
};

export type GenreDimensionInput = CoreDimensionInput & {
  genreTermId: string;
};

export type GenreDefinitionToggleInput = {
  genreTermId: string;
  enabled: boolean;
  displayOrder?: number;
  mediaType?: string;
  inheritanceMode?: "inherit" | "custom";
};

function toDimension(row: typeof schema.bookRatingDimensions.$inferSelect): RatingDimension {
  return {
    id: row.id,
    key: row.key,
    scope: row.scope as BookRatingScope,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    displayOrder: row.displayOrder,
    required: row.required,
    contributesToRating: row.contributesToRating,
    weight: row.weight,
  };
}

export class RatingConfigService {
  constructor(private readonly db: Database) {}

  async getSettings(): Promise<RatingSystemSettings> {
    const row = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, RATING_SYSTEM_SETTINGS_KEY),
    });
    if (!row?.value) return ratingSystemSettingsSchema.parse({});
    return ratingSystemSettingsSchema.parse(row.value);
  }

  async patchSettings(input: unknown): Promise<RatingSystemSettings> {
    const current = await this.getSettings();
    const patch = ratingSystemSettingsSchema.partial().parse(input);
    const merged = {
      ...current,
      ...patch,
      calculation: { ...current.calculation, ...patch.calculation },
      externalPosting: {
        ...current.externalPosting,
        ...patch.externalPosting,
      },
    };
    const next = ratingSystemSettingsSchema.parse(merged);
    await this.persistSettings(next);
    return next;
  }

  private async persistSettings(settings: RatingSystemSettings): Promise<void> {
    const existing = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, RATING_SYSTEM_SETTINGS_KEY),
    });
    if (existing) {
      await this.db
        .update(schema.systemSettings)
        .set({ value: settings, updatedAt: new Date() })
        .where(eq(schema.systemSettings.key, RATING_SYSTEM_SETTINGS_KEY));
    } else {
      await this.db.insert(schema.systemSettings).values({
        key: RATING_SYSTEM_SETTINGS_KEY,
        value: settings,
      });
    }
  }

  // --- Core dimensions ---

  async listCoreDimensions(): Promise<RatingDimension[]> {
    const rows = await this.db
      .select()
      .from(schema.bookRatingDimensions)
      .where(eq(schema.bookRatingDimensions.scope, "core"))
      .orderBy(
        asc(schema.bookRatingDimensions.displayOrder),
        asc(schema.bookRatingDimensions.key),
      );
    return rows.map(toDimension);
  }

  async upsertCoreDimension(input: CoreDimensionInput): Promise<RatingDimension> {
    await this.assertDimensionKeyAvailable("core", input.key, input.id);
    const values = {
      key: input.key,
      scope: "core" as const,
      name: input.name,
      description: input.description ?? null,
      enabled: input.enabled,
      displayOrder: input.displayOrder,
      required: input.required,
      contributesToRating: input.contributesToRating,
      weight: input.weight,
    };
    if (input.id) {
      const existing = await this.db.query.bookRatingDimensions.findFirst({
        where: and(
          eq(schema.bookRatingDimensions.id, input.id),
          eq(schema.bookRatingDimensions.scope, "core"),
        ),
      });
      if (!existing) {
        throw new ValidationError("Core dimension not found");
      }
      const [row] = await this.db
        .update(schema.bookRatingDimensions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(schema.bookRatingDimensions.id, input.id))
        .returning();
      return toDimension(row!);
    }
    const [row] = await this.db
      .insert(schema.bookRatingDimensions)
      .values({ id: randomUUID(), ...values })
      .returning();
    return toDimension(row!);
  }

  // --- Genre definitions ---

  private async listGenreTerms(): Promise<
    Map<string, { id: string; name: string; parentId: string | null }>
  > {
    const rows = await this.db
      .select({
        id: schema.metadataVocabularyTerms.id,
        name: schema.metadataVocabularyTerms.name,
        parentId: schema.metadataVocabularyTerms.parentId,
      })
      .from(schema.metadataVocabularyTerms)
      .where(eq(schema.metadataVocabularyTerms.kind, "genre"));
    return new Map(rows.map((r) => [r.id, r]));
  }

  private async listDefinitionRows() {
    return this.db.select().from(schema.bookRatingGenreDefinitions);
  }

  async listAllGenreDefinitions(): Promise<GenreRatingDefinition[]> {
    const [terms, definitions, dimensionRows] = await Promise.all([
      this.listGenreTerms(),
      this.listDefinitionRows(),
      this.db.select().from(schema.bookRatingDimensions),
    ]);

    const dimsByDefinition = new Map<string, RatingDimension[]>();
    for (const row of dimensionRows) {
      if (row.scope !== "genre" || !row.genreDefinitionId) continue;
      const list = dimsByDefinition.get(row.genreDefinitionId) ?? [];
      list.push(toDimension(row));
      dimsByDefinition.set(row.genreDefinitionId, list);
    }
    for (const list of dimsByDefinition.values()) {
      list.sort(
        (a, b) => a.displayOrder - b.displayOrder || a.key.localeCompare(b.key),
      );
    }

    const result: GenreRatingDefinition[] = [];
    for (const definition of definitions) {
      const term = terms.get(definition.genreTermId);
      if (!term) continue;
      const parent = term.parentId ? terms.get(term.parentId) : undefined;
      result.push({
        genreTermId: definition.genreTermId,
        genreName: term.name,
        parentGenreName: parent?.name ?? null,
        mediaType: definition.mediaType,
        inheritanceMode: definition.inheritanceMode as "inherit" | "custom",
        enabled: definition.enabled,
        displayOrder: definition.displayOrder,
        dimensions: dimsByDefinition.get(definition.id) ?? [],
      });
    }
    result.sort(
      (a, b) =>
        a.displayOrder - b.displayOrder || a.genreName.localeCompare(b.genreName),
    );
    return result;
  }

  async listEnabledGenreDefinitions(): Promise<GenreRatingDefinition[]> {
    const all = await this.listAllGenreDefinitions();
    return all.filter((d) => d.enabled && d.mediaType === "books");
  }

  async setGenreDefinition(input: GenreDefinitionToggleInput): Promise<void> {
    const terms = await this.listGenreTerms();
    if (!terms.has(input.genreTermId)) {
      throw new ValidationError("Genre term not found");
    }
    const mediaType = input.mediaType ?? "books";
    const definitionWhere = and(
      eq(schema.bookRatingGenreDefinitions.genreTermId, input.genreTermId),
      eq(schema.bookRatingGenreDefinitions.mediaType, mediaType),
    );
    if (input.displayOrder !== undefined) {
      const existing = await this.db.query.bookRatingGenreDefinitions.findFirst({
        where: definitionWhere,
      });
      if (existing) {
        await this.db
          .update(schema.bookRatingGenreDefinitions)
          .set({
            enabled: input.enabled,
            displayOrder: input.displayOrder,
            inheritanceMode: input.inheritanceMode ?? existing.inheritanceMode,
            updatedAt: new Date(),
          })
          .where(eq(schema.bookRatingGenreDefinitions.id, existing.id));
        return;
      }
      await this.db.insert(schema.bookRatingGenreDefinitions).values({
        id: randomUUID(),
        genreTermId: input.genreTermId,
        mediaType,
        inheritanceMode: input.inheritanceMode ?? "custom",
        enabled: input.enabled,
        displayOrder: input.displayOrder,
      });
      return;
    }
    const existing = await this.db.query.bookRatingGenreDefinitions.findFirst({
      where: definitionWhere,
    });
    if (existing) {
      await this.db
        .update(schema.bookRatingGenreDefinitions)
        .set({
          enabled: input.enabled,
          inheritanceMode: input.inheritanceMode ?? existing.inheritanceMode,
          updatedAt: new Date(),
        })
        .where(eq(schema.bookRatingGenreDefinitions.id, existing.id));
      return;
    }
    if (input.enabled) {
      await this.db.insert(schema.bookRatingGenreDefinitions).values({
        id: randomUUID(),
        genreTermId: input.genreTermId,
        mediaType,
        inheritanceMode: input.inheritanceMode ?? "custom",
        enabled: true,
        displayOrder: 0,
      });
    }
  }

  async upsertGenreDimension(
    input: GenreDimensionInput,
  ): Promise<RatingDimension> {
    const definition = await this.db.query.bookRatingGenreDefinitions.findFirst({
      where: and(
        eq(schema.bookRatingGenreDefinitions.genreTermId, input.genreTermId),
        eq(schema.bookRatingGenreDefinitions.mediaType, "books"),
      ),
    });
    if (!definition) {
      throw new ValidationError("Genre rating definition not found");
    }
    await this.assertDimensionKeyAvailable(
      "genre",
      input.key,
      input.id,
      definition.id,
    );
    const values = {
      key: input.key,
      scope: "genre" as const,
      genreDefinitionId: definition.id,
      name: input.name,
      description: input.description ?? null,
      enabled: input.enabled,
      displayOrder: input.displayOrder,
      required: input.required,
      contributesToRating: input.contributesToRating,
      weight: input.weight,
    };
    if (input.id) {
      const existing = await this.db.query.bookRatingDimensions.findFirst({
        where: and(
          eq(schema.bookRatingDimensions.id, input.id),
          eq(schema.bookRatingDimensions.scope, "genre"),
        ),
      });
      if (!existing) {
        throw new ValidationError("Genre dimension not found");
      }
      const [row] = await this.db
        .update(schema.bookRatingDimensions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(schema.bookRatingDimensions.id, input.id))
        .returning();
      return toDimension(row!);
    }
    const [row] = await this.db
      .insert(schema.bookRatingDimensions)
      .values({ id: randomUUID(), ...values })
      .returning();
    return toDimension(row!);
  }

  async deleteDimension(id: string): Promise<void> {
    await this.db
      .delete(schema.bookRatingDimensions)
      .where(eq(schema.bookRatingDimensions.id, id));
  }

  private async assertDimensionKeyAvailable(
    scope: BookRatingScope,
    key: string,
    excludeId?: string,
    genreDefinitionId?: string,
  ): Promise<void> {
    const existing = await this.db.query.bookRatingDimensions.findFirst({
      where: and(
        eq(schema.bookRatingDimensions.scope, scope),
        eq(schema.bookRatingDimensions.key, key),
        ...(scope === "genre" && genreDefinitionId
          ? [eq(schema.bookRatingDimensions.genreDefinitionId, genreDefinitionId)]
          : []),
      ),
    });
    if (existing && existing.id !== excludeId) {
      throw new ValidationError(
        `A ${scope} dimension with key "${key}" already exists in this rubric`,
      );
    }
  }
}
