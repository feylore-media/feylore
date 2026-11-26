import { eq, and } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { MetadataProviderRegistry } from "./registry.js";
import type { MediaModuleId } from "../../../shared/media-modules.js";
import type { CanonicalFieldId } from "../../../shared/metadata-fields.js";
import {
  getCanonicalFieldsForModule,
  isCanonicalFieldId,
} from "../../../shared/metadata-fields.js";
import {
  metadataMatchingRulesSchema,
  type MetadataMatchingRules,
} from "../../../shared/metadata-settings.js";
import {
  buildEffectiveSourceOrder,
  getMetadataSourceCategory,
  splitSourceOrderByCategory,
} from "../../../shared/metadata-source-category.js";

export interface FieldSourcePolicy {
  providerSourceOrder: string[];
  importSourceOrder: string[];
}

/** Default field-specific source priority for initial policy seed only. */
const DEFAULT_POLICY_SEED: Record<
  MediaModuleId,
  Partial<Record<CanonicalFieldId, string[]>>
> = {
  books: {
    title: ["hardcover", "open-library", "embedded.epub.opf", "embedded.filename"],
    subtitle: ["hardcover", "open-library", "embedded.epub.opf"],
    authors: ["hardcover", "open-library", "embedded.epub.opf"],
    contributors: ["hardcover", "open-library", "embedded.epub.opf"],
    isbn10: ["open-library", "hardcover", "embedded.epub.opf"],
    isbn13: ["open-library", "hardcover", "embedded.epub.opf"],
    asin: ["open-library", "hardcover", "embedded.epub.opf"],
    identifiers: ["open-library", "hardcover", "embedded.epub.opf"],
    description: ["hardcover", "open-library", "embedded.epub.opf"],
    publisher: ["hardcover", "open-library", "embedded.epub.opf"],
    publicationDate: ["hardcover", "open-library", "embedded.epub.opf"],
    copyrightDate: ["open-library", "hardcover", "embedded.epub.opf"],
    physicalFormat: ["open-library", "hardcover", "embedded.epub.opf"],
    edition: ["hardcover", "open-library", "embedded.epub.opf"],
    language: ["embedded.epub.opf", "hardcover", "open-library"],
    originalLanguage: ["hardcover", "open-library", "embedded.epub.opf"],
    originalPublicationDate: ["hardcover", "open-library", "embedded.epub.opf"],
    publicationCountry: ["hardcover", "open-library", "embedded.epub.opf"],
    genres: ["open-library", "hardcover", "embedded.epub.opf"],
    pageCount: ["hardcover", "open-library", "embedded.epub.opf"],
    ageRange: ["hardcover", "open-library", "embedded.epub.opf"],
    contentRating: ["hardcover", "open-library", "embedded.epub.opf"],
    series: ["hardcover", "open-library", "embedded.epub.opf"],
    seriesPosition: ["hardcover", "open-library", "embedded.epub.opf"],
    cover: ["hardcover", "open-library", "embedded.epub.opf"],
  },
  comics: {
    title: ["hardcover", "open-library", "embedded.epub.opf", "embedded.filename"],
    subtitle: ["hardcover", "open-library", "embedded.epub.opf"],
    authors: ["hardcover", "open-library", "embedded.epub.opf"],
    isbn13: ["open-library", "hardcover", "embedded.epub.opf"],
    description: ["hardcover", "open-library", "embedded.epub.opf"],
    publisher: ["hardcover", "open-library", "embedded.epub.opf"],
    publicationDate: ["hardcover", "open-library", "embedded.epub.opf"],
    copyrightDate: ["open-library", "hardcover", "embedded.epub.opf"],
    physicalFormat: ["open-library", "hardcover", "embedded.epub.opf"],
    language: ["embedded.epub.opf", "hardcover", "open-library"],
    genres: ["open-library", "hardcover", "embedded.epub.opf"],
    cover: ["hardcover", "open-library", "embedded.epub.opf"],
  },
  audiobooks: {
    title: ["audible", "embedded.audio.tags", "embedded.filename"],
    subtitle: ["audible", "embedded.audio.tags"],
    authors: ["audible", "embedded.audio.tags", "embedded.filename"],
    narrator: ["audible", "embedded.audio.tags"],
    description: ["audible", "embedded.audio.tags"],
    genres: ["audible", "embedded.audio.tags"],
    series: ["audible", "embedded.audio.tags"],
    runtime: ["audible", "embedded.audio.tags", "media.process"],
    releaseDate: ["audible"],
    cover: ["audible", "embedded.audio.tags"],
  },
  music: {
    title: ["musicbrainz", "embedded.music.tags", "embedded.filename"],
    authors: ["musicbrainz", "embedded.music.tags"],
    description: ["musicbrainz", "embedded.music.tags"],
    genres: ["musicbrainz", "embedded.music.tags"],
    releaseDate: ["musicbrainz", "embedded.music.tags"],
    cover: ["musicbrainz", "embedded.music.tags"],
    runtime: ["embedded.music.tags", "media.process"],
  },
  video: {},
  people: {
    name: ["wikidata"],
    alternateNames: ["wikidata"],
    bio: ["wikidata"],
    birthDate: ["wikidata"],
    deathDate: ["wikidata"],
    birthPlace: ["wikidata"],
    deathPlace: ["wikidata"],
    photo: ["wikidata"],
  },
};

const DEFAULT_MATCHING: MetadataMatchingRules = {
  preferIsbnMatching: true,
  fillMissingFromLowerPriority: true,
  preferExactEditionMatch: true,
};

export class MetadataPolicyService {
  constructor(
    private readonly db: Database,
    private readonly registry: MetadataProviderRegistry,
  ) {}

  private resolveCategory(sourceId: string): "provider" | "imported" | undefined {
    const descriptor = this.registry.getDescriptor(sourceId);
    if (!descriptor) return undefined;
    return getMetadataSourceCategory(descriptor);
  }

  private splitSeed(seed: string[]): FieldSourcePolicy {
    return splitSourceOrderByCategory(seed, (key) => this.resolveCategory(key));
  }

  async getFieldPolicyTiers(
    mediaModule: MediaModuleId,
  ): Promise<Map<CanonicalFieldId, FieldSourcePolicy>> {
    const rows = await this.db
      .select()
      .from(schema.metadataPolicies)
      .where(eq(schema.metadataPolicies.mediaModule, mediaModule));

    const result = new Map<CanonicalFieldId, FieldSourcePolicy>();
    for (const field of getCanonicalFieldsForModule(mediaModule)) {
      const row = rows.find((r) => r.fieldId === field.id);
      if (row) {
        result.set(field.id, {
          providerSourceOrder: row.providerSourceOrder,
          importSourceOrder: row.importSourceOrder,
        });
      } else {
        const seeded = await this.ensureFieldPolicy(mediaModule, field.id);
        result.set(field.id, seeded);
      }
    }
    return result;
  }

  /** Effective per-field merge order (providers before ingest extraction by default). */
  async getFieldPriorities(
    mediaModule: MediaModuleId,
  ): Promise<Map<CanonicalFieldId, string[]>> {
    return this.getIngestFieldPriorities(mediaModule);
  }

  /** Merge order for ingest / re-extract: providers + fixed ingest-extraction order. */
  async getIngestFieldPriorities(
    mediaModule: MediaModuleId,
  ): Promise<Map<CanonicalFieldId, string[]>> {
    const tiers = await this.getFieldPolicyTiers(mediaModule);
    const result = new Map<CanonicalFieldId, string[]>();
    for (const [fieldId, policy] of tiers) {
      result.set(
        fieldId,
        buildEffectiveSourceOrder(
          policy.providerSourceOrder,
          policy.importSourceOrder,
        ),
      );
    }
    return result;
  }

  /** Merge order for provider refresh: external providers only. */
  async getProviderFieldPriorities(
    mediaModule: MediaModuleId,
  ): Promise<Map<CanonicalFieldId, string[]>> {
    const tiers = await this.getFieldPolicyTiers(mediaModule);
    const result = new Map<CanonicalFieldId, string[]>();
    for (const [fieldId, policy] of tiers) {
      result.set(fieldId, [...policy.providerSourceOrder]);
    }
    return result;
  }

  private async ensureFieldPolicy(
    mediaModule: MediaModuleId,
    fieldId: CanonicalFieldId,
  ): Promise<FieldSourcePolicy> {
    const existing = await this.db.query.metadataPolicies.findFirst({
      where: and(
        eq(schema.metadataPolicies.mediaModule, mediaModule),
        eq(schema.metadataPolicies.fieldId, fieldId),
      ),
    });
    if (existing) {
      return {
        providerSourceOrder: existing.providerSourceOrder,
        importSourceOrder: existing.importSourceOrder,
      };
    }

    const seed = DEFAULT_POLICY_SEED[mediaModule]?.[fieldId] ?? [];
    const split = this.splitSeed(seed);
    const providerSourceOrder = this.filterEligibleSources(
      mediaModule,
      fieldId,
      split.providerSourceOrder,
      "provider",
    );
    const importSourceOrder = this.filterEligibleSources(
      mediaModule,
      fieldId,
      split.importSourceOrder,
      "imported",
    );

    await this.db.insert(schema.metadataPolicies).values({
      mediaModule,
      fieldId,
      providerSourceOrder,
      importSourceOrder,
    });
    return { providerSourceOrder, importSourceOrder };
  }

  filterEligibleSources(
    mediaModule: MediaModuleId,
    fieldId: CanonicalFieldId,
    sourceOrder: string[],
    category?: "provider" | "imported",
  ): string[] {
    return sourceOrder.filter((sourceId) => {
      const descriptor = this.registry.getDescriptor(sourceId);
      if (!descriptor) return false;
      if (!descriptor.mediaModules.includes(mediaModule)) return false;
      if (!descriptor.fields.includes(fieldId)) return false;
      if (category && getMetadataSourceCategory(descriptor) !== category) {
        return false;
      }
      return true;
    });
  }

  async setFieldPriorities(
    mediaModule: MediaModuleId,
    priorities: Array<{
      fieldId: CanonicalFieldId;
      providerSourceOrder: string[];
    }>,
  ): Promise<void> {
    for (const { fieldId, providerSourceOrder } of priorities) {
      if (!isCanonicalFieldId(fieldId)) continue;
      const filteredProviders = this.filterEligibleSources(
        mediaModule,
        fieldId,
        providerSourceOrder,
        "provider",
      );
      const existing = await this.db.query.metadataPolicies.findFirst({
        where: and(
          eq(schema.metadataPolicies.mediaModule, mediaModule),
          eq(schema.metadataPolicies.fieldId, fieldId),
        ),
      });
      const importSourceOrder = existing
        ? existing.importSourceOrder
        : (
            await this.ensureFieldPolicy(mediaModule, fieldId)
          ).importSourceOrder;
      if (existing) {
        await this.db
          .update(schema.metadataPolicies)
          .set({
            providerSourceOrder: filteredProviders,
            importSourceOrder,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.metadataPolicies.mediaModule, mediaModule),
              eq(schema.metadataPolicies.fieldId, fieldId),
            ),
          );
      } else {
        await this.db.insert(schema.metadataPolicies).values({
          mediaModule,
          fieldId,
          providerSourceOrder: filteredProviders,
          importSourceOrder,
        });
      }
    }
  }

  async getMatchingRules(
    mediaModule: MediaModuleId,
  ): Promise<MetadataMatchingRules> {
    const row = await this.db.query.metadataMatchingRules.findFirst({
      where: eq(schema.metadataMatchingRules.mediaModule, mediaModule),
    });
    if (!row) return { ...DEFAULT_MATCHING };
    return metadataMatchingRulesSchema.parse(row.rules);
  }

  async setMatchingRules(
    mediaModule: MediaModuleId,
    rules: Partial<MetadataMatchingRules>,
  ): Promise<MetadataMatchingRules> {
    const current = await this.getMatchingRules(mediaModule);
    const merged = { ...current, ...rules };
    const parsed = metadataMatchingRulesSchema.parse(merged);
    const existing = await this.db.query.metadataMatchingRules.findFirst({
      where: eq(schema.metadataMatchingRules.mediaModule, mediaModule),
    });
    if (existing) {
      await this.db
        .update(schema.metadataMatchingRules)
        .set({ rules: parsed, updatedAt: new Date() })
        .where(eq(schema.metadataMatchingRules.mediaModule, mediaModule));
    } else {
      await this.db.insert(schema.metadataMatchingRules).values({
        mediaModule,
        rules: parsed,
      });
    }
    return parsed;
  }

  getUnorderedEligibleSources(
    mediaModule: MediaModuleId,
    fieldId: CanonicalFieldId,
    persistedOrder: string[],
    category: "provider" | "imported",
  ): string[] {
    const descriptors = this.registry.listDescriptors(mediaModule);
    const persisted = new Set(persistedOrder);
    return descriptors
      .filter((d) => {
        if (getMetadataSourceCategory(d) !== category) return false;
        return (
          d.fields.includes(fieldId) &&
          !persisted.has(d.id) &&
          d.implemented !== false
        );
      })
      .map((d) => d.id);
  }
}
