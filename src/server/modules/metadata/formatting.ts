import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import {
  collapseWhitespace,
  MAX_VOCABULARY_DEPTH,
  metadataFormattingSettingsSchema,
  normalizeVocabularyKey,
  vocabularySlug,
  resolveLanguage,
  scoreTermSimilarity,
  type FormattingSuggestionDto,
  type LanguageRepresentation,
  type MetadataFormattingSettings,
  type SimilarTermDto,
  type VocabularyKind,
  type VocabularySearchMatchDto,
  type VocabularyTermDto,
  type GenreMediaType,
} from "../../../shared/metadata-formatting.js";
import { ValidationError, NotFoundError } from "../../../shared/errors.js";

const FORMATTING_SETTINGS_KEY = "metadata.formatting";

type TermRow = typeof schema.metadataVocabularyTerms.$inferSelect;
type AliasRow = typeof schema.metadataVocabularyAliases.$inferSelect;

export class MetadataFormattingService {
  constructor(private readonly db: Database) {}

  async getSettings(): Promise<MetadataFormattingSettings> {
    const row = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, FORMATTING_SETTINGS_KEY),
    });
    if (!row) return metadataFormattingSettingsSchema.parse({});
    return metadataFormattingSettingsSchema.parse(row.value);
  }

  async updateSettings(
    input: Partial<MetadataFormattingSettings>,
  ): Promise<MetadataFormattingSettings> {
    const current = await this.getSettings();
    const next = metadataFormattingSettingsSchema.parse({ ...current, ...input });
    const existing = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, FORMATTING_SETTINGS_KEY),
    });
    if (existing) {
      await this.db
        .update(schema.systemSettings)
        .set({ value: next, updatedAt: new Date() })
        .where(eq(schema.systemSettings.key, FORMATTING_SETTINGS_KEY));
    } else {
      await this.db.insert(schema.systemSettings).values({
        key: FORMATTING_SETTINGS_KEY,
        value: next,
      });
    }
    return next;
  }

  async listTerms(
    kind: VocabularyKind,
    mediaType?: GenreMediaType,
  ): Promise<VocabularyTermDto[]> {
    const [terms, aliases, usageCounts] = await Promise.all([
      this.db
        .select()
        .from(schema.metadataVocabularyTerms)
        .where(eq(schema.metadataVocabularyTerms.kind, kind)),
      this.db
        .select()
        .from(schema.metadataVocabularyAliases)
        .where(eq(schema.metadataVocabularyAliases.kind, kind)),
      this.loadUsageCounts(kind),
    ]);

    const aliasesByTerm = new Map<string, string[]>();
    for (const alias of aliases) {
      const list = aliasesByTerm.get(alias.termId) ?? [];
      list.push(alias.alias);
      aliasesByTerm.set(alias.termId, list);
    }

    const nodes = new Map<string, VocabularyTermDto>();
    for (const term of terms) {
      nodes.set(term.id, {
        id: term.id,
        kind: term.kind as VocabularyKind,
        name: term.name,
        parentId: term.parentId,
        slug: term.slug,
        aliases: aliasesByTerm.get(term.id) ?? [],
        mediaTypes: (term.mediaTypes ?? []) as GenreMediaType[],
        enabled: term.enabled,
        sortOrder: term.sortOrder,
        usageCount: usageCounts.get(normalizeVocabularyKey(term.name)) ?? 0,
        children: [],
      });
    }

    const roots: VocabularyTermDto[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortTree = (items: VocabularyTermDto[]) => {
      items.sort(
        (a, b) =>
          (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
            (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
      );
      for (const item of items) sortTree(item.children);
    };
    sortTree(roots);
    if (!mediaType || kind !== "genre") return roots;
    const filterTree = (items: VocabularyTermDto[]): VocabularyTermDto[] =>
      items.flatMap((item) => {
        const children = filterTree(item.children);
        const applies = item.mediaTypes.length === 0 || item.mediaTypes.includes(mediaType);
        return applies || children.length > 0 ? [{ ...item, children }] : [];
      });
    return filterTree(roots);
  }

  async searchTerms(
    kind: VocabularyKind,
    query: string,
  ): Promise<VocabularySearchMatchDto[]> {
    const q = normalizeVocabularyKey(query);
    if (!q) return [];

    const [terms, aliases] = await Promise.all([
      this.db
        .select()
        .from(schema.metadataVocabularyTerms)
        .where(eq(schema.metadataVocabularyTerms.kind, kind)),
      this.db
        .select()
        .from(schema.metadataVocabularyAliases)
        .where(eq(schema.metadataVocabularyAliases.kind, kind)),
    ]);

    const termById = new Map(terms.map((t) => [t.id, t]));
    const aliasesByTerm = new Map<string, AliasRow[]>();
    for (const alias of aliases) {
      const list = aliasesByTerm.get(alias.termId) ?? [];
      list.push(alias);
      aliasesByTerm.set(alias.termId, list);
    }

    const matches: VocabularySearchMatchDto[] = [];
    const seen = new Set<string>();

    const addMatch = (
      term: TermRow,
      matchedVia: "name" | "alias",
      matchedValue: string,
    ) => {
      if (seen.has(term.id)) return;
      seen.add(term.id);
      matches.push({
        term: {
          id: term.id,
          kind: term.kind as VocabularyKind,
          name: term.name,
          parentId: term.parentId,
          slug: term.slug,
          aliases: (aliasesByTerm.get(term.id) ?? []).map((a) => a.alias),
          mediaTypes: (term.mediaTypes ?? []) as GenreMediaType[],
          enabled: term.enabled,
          sortOrder: term.sortOrder,
          usageCount: 0,
        },
        ancestorIds: this.collectAncestorIds(term.id, termById),
        matchedVia,
        matchedValue,
      });
    };

    for (const term of terms) {
      if (term.normalizedName.includes(q)) {
        addMatch(term, "name", term.name);
      }
    }
    for (const alias of aliases) {
      if (alias.normalizedAlias.includes(q)) {
        const term = termById.get(alias.termId);
        if (term) addMatch(term, "alias", alias.alias);
      }
    }

    return matches.sort((a, b) => a.term.name.localeCompare(b.term.name));
  }

  async createTerm(input: {
    kind: VocabularyKind;
    name: string;
    parentId?: string | null;
    mediaTypes?: GenreMediaType[];
    enabled?: boolean;
    sortOrder?: number | null;
  }): Promise<string> {
    const name = collapseWhitespace(input.name);
    await this.assertCanonicalNameAvailable(input.kind, name);
    const parentId = input.parentId ?? null;
    if (parentId) {
      await this.assertValidParent(input.kind, parentId, null);
      await this.assertDepthAllowed(parentId, 1);
    }

    const id = generateId();
    try {
      await this.db.insert(schema.metadataVocabularyTerms).values({
        id,
        kind: input.kind,
        name,
        normalizedName: normalizeVocabularyKey(name),
        slug: vocabularySlug(name),
        parentId,
        mediaTypes: input.kind === "genre" ? (input.mediaTypes ?? []) : [],
        enabled: input.enabled ?? true,
        sortOrder: input.sortOrder ?? null,
      });
    } catch {
      throw new ValidationError("A term with this name or slug already exists");
    }
    return id;
  }

  async updateTerm(
    id: string,
    input: {
      name?: string;
      parentId?: string | null;
      mediaTypes?: GenreMediaType[];
      enabled?: boolean;
      sortOrder?: number | null;
    },
  ): Promise<void> {
    const existing = await this.getTermOrThrow(id);
    const name = input.name !== undefined ? collapseWhitespace(input.name) : existing.name;
    if (input.name !== undefined) {
      await this.assertCanonicalNameAvailable(existing.kind as VocabularyKind, name, id);
    }
    const parentId =
      input.parentId !== undefined ? input.parentId : existing.parentId;

    if (parentId === id) {
      throw new ValidationError("A term cannot be its own parent");
    }
    if (parentId) {
      await this.assertValidParent(existing.kind as VocabularyKind, parentId, id);
      await this.assertNoCycle(id, parentId);
      await this.assertDepthAllowed(parentId, 1, id);
    }

    try {
      await this.db
        .update(schema.metadataVocabularyTerms)
        .set({
          name,
          normalizedName: normalizeVocabularyKey(name),
          slug: vocabularySlug(name),
          parentId,
          mediaTypes:
            existing.kind === "genre"
              ? (input.mediaTypes ?? existing.mediaTypes)
              : [],
          enabled: input.enabled ?? existing.enabled,
          sortOrder:
            input.sortOrder !== undefined ? input.sortOrder : existing.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(schema.metadataVocabularyTerms.id, id));
    } catch {
      throw new ValidationError("A term with this name already exists at this level");
    }
  }

  async deleteTerm(id: string): Promise<void> {
    await this.getTermOrThrow(id);
    const children = await this.db
      .select({ id: schema.metadataVocabularyTerms.id })
      .from(schema.metadataVocabularyTerms)
      .where(eq(schema.metadataVocabularyTerms.parentId, id))
      .limit(1);
    if (children.length > 0) {
      throw new ValidationError("Remove or reparent child terms before deleting");
    }
    const ratingReference = await this.db.query.bookRatingGenreDefinitions.findFirst({
      where: eq(schema.bookRatingGenreDefinitions.genreTermId, id),
    });
    if (ratingReference) {
      throw new ValidationError("Remove rating configurations before deleting this genre");
    }
    await this.db
      .delete(schema.metadataVocabularyTerms)
      .where(eq(schema.metadataVocabularyTerms.id, id));
  }

  async setAliases(termId: string, aliases: string[]): Promise<void> {
    const term = await this.getTermOrThrow(termId);
    const cleaned = [
      ...new Set(aliases.map((a) => collapseWhitespace(a)).filter(Boolean)),
    ];

    const canonicalKey = normalizeVocabularyKey(term.name);
    const canonicalTerms = await this.db
      .select({ id: schema.metadataVocabularyTerms.id, normalizedName: schema.metadataVocabularyTerms.normalizedName })
      .from(schema.metadataVocabularyTerms)
      .where(eq(schema.metadataVocabularyTerms.kind, term.kind));
    for (const alias of cleaned) {
      if (normalizeVocabularyKey(alias) === canonicalKey) {
        throw new ValidationError("Alias cannot match the canonical term name");
      }
      const key = normalizeVocabularyKey(alias);
      if (canonicalTerms.some((candidate) => candidate.id !== termId && candidate.normalizedName === key)) {
        throw new ValidationError("Alias conflicts with an existing canonical term name");
      }
    }

    await this.db
      .delete(schema.metadataVocabularyAliases)
      .where(eq(schema.metadataVocabularyAliases.termId, termId));

    if (cleaned.length === 0) return;

    try {
      await this.db.insert(schema.metadataVocabularyAliases).values(
        cleaned.map((alias) => ({
          id: generateId(),
          termId,
          kind: term.kind,
          alias,
          normalizedAlias: normalizeVocabularyKey(alias),
        })),
      );
    } catch {
      throw new ValidationError("One or more aliases conflict with an existing alias");
    }
  }

  private async assertCanonicalNameAvailable(
    kind: VocabularyKind,
    name: string,
    termId?: string,
  ): Promise<void> {
    const key = normalizeVocabularyKey(name);
    const alias = await this.db.query.metadataVocabularyAliases.findFirst({
      where: and(
        eq(schema.metadataVocabularyAliases.kind, kind),
        eq(schema.metadataVocabularyAliases.normalizedAlias, key),
      ),
    });
    if (alias && alias.termId !== termId) {
      throw new ValidationError("Canonical name conflicts with an existing alias");
    }
  }

  async listSuggestions(
    kind: VocabularyKind,
    status: "open" | "resolved" | "ignored" = "open",
  ): Promise<FormattingSuggestionDto[]> {
    const rows = await this.db
      .select({
        suggestion: schema.metadataFormattingSuggestions,
        termName: schema.metadataVocabularyTerms.name,
      })
      .from(schema.metadataFormattingSuggestions)
      .leftJoin(
        schema.metadataVocabularyTerms,
        eq(
          schema.metadataFormattingSuggestions.suggestedTermId,
          schema.metadataVocabularyTerms.id,
        ),
      )
      .where(
        and(
          eq(schema.metadataFormattingSuggestions.kind, kind),
          eq(schema.metadataFormattingSuggestions.status, status),
        ),
      )
      .orderBy(schema.metadataFormattingSuggestions.createdAt);

    return rows.map((row) => ({
      id: row.suggestion.id,
      kind: row.suggestion.kind as VocabularyKind,
      rawValue: row.suggestion.rawValue,
      normalizedValue: row.suggestion.normalizedValue,
      status: row.suggestion.status as FormattingSuggestionDto["status"],
      suggestedTermId: row.suggestion.suggestedTermId,
      suggestedTermName: row.termName,
      suggestionType: row.suggestion.suggestionType as FormattingSuggestionDto["suggestionType"],
      context: row.suggestion.context ?? null,
      createdAt: row.suggestion.createdAt.toISOString(),
    }));
  }

  async findSimilarTerms(
    kind: VocabularyKind,
    value: string,
    limit = 5,
  ): Promise<SimilarTermDto[]> {
    const terms = await this.db
      .select()
      .from(schema.metadataVocabularyTerms)
      .where(eq(schema.metadataVocabularyTerms.kind, kind));

    return terms
      .map((term) => ({
        termId: term.id,
        name: term.name,
        score: scoreTermSimilarity(value, term.name),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  async resolveSuggestion(
    id: string,
    action: "accept_alias" | "assign_existing_term" | "ignore",
    termId?: string,
  ): Promise<void> {
    const suggestion = await this.db.query.metadataFormattingSuggestions.findFirst({
      where: eq(schema.metadataFormattingSuggestions.id, id),
    });
    if (!suggestion) throw new NotFoundError("Suggestion not found");
    if (suggestion.status !== "open") {
      throw new ValidationError("Suggestion is not open");
    }

    if (action === "ignore") {
      await this.db
        .update(schema.metadataFormattingSuggestions)
        .set({ status: "ignored" })
        .where(eq(schema.metadataFormattingSuggestions.id, id));
      return;
    }

    const targetTermId =
      action === "accept_alias" ? suggestion.suggestedTermId : termId;
    if (!targetTermId) {
      throw new ValidationError("A target term is required");
    }

    await this.getTermOrThrow(targetTermId);
    const existingAliases = await this.db
      .select({ alias: schema.metadataVocabularyAliases.alias })
      .from(schema.metadataVocabularyAliases)
      .where(eq(schema.metadataVocabularyAliases.termId, targetTermId));
    const aliasSet = new Set(existingAliases.map((a) => a.alias));
    aliasSet.add(suggestion.rawValue);
    await this.setAliases(targetTermId, [...aliasSet]);

    await this.db
      .update(schema.metadataFormattingSuggestions)
      .set({ status: "resolved" })
      .where(eq(schema.metadataFormattingSuggestions.id, id));
  }

  async resolveGenres(
    values: string[],
    context?: Record<string, unknown>,
  ): Promise<string[]> {
    return this.resolveVocabulary("genre", values, context);
  }

  async resolveTags(
    values: string[],
    context?: Record<string, unknown>,
  ): Promise<string[]> {
    return this.resolveVocabulary("tag", values, context);
  }

  resolveLanguageValue(
    raw: string | undefined,
    representation: LanguageRepresentation,
  ): string | undefined {
    return resolveLanguage(raw, representation);
  }

  private async resolveVocabulary(
    kind: VocabularyKind,
    values: string[],
    context?: Record<string, unknown>,
  ): Promise<string[]> {
    const maps = await this.loadResolutionMaps(kind);
    const resolved: string[] = [];

    for (const value of values) {
      const trimmed = collapseWhitespace(value);
      if (!trimmed) continue;
      const key = normalizeVocabularyKey(trimmed);
      const canonical = maps.canonical.get(key) ?? maps.aliases.get(key);
      if (canonical) {
        if (!resolved.includes(canonical)) resolved.push(canonical);
        continue;
      }
      if (!resolved.includes(trimmed)) resolved.push(trimmed);
      await this.enqueueSuggestion(kind, trimmed, key, context);
    }

    return resolved;
  }

  private async enqueueSuggestion(
    kind: VocabularyKind,
    rawValue: string,
    normalizedValue: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.db.query.metadataFormattingSuggestions.findFirst({
      where: and(
        eq(schema.metadataFormattingSuggestions.kind, kind),
        eq(schema.metadataFormattingSuggestions.normalizedValue, normalizedValue),
        eq(schema.metadataFormattingSuggestions.status, "open"),
      ),
    });
    if (existing) return;

    const similar = await this.findSimilarTerms(kind, rawValue, 1);
    const suggestedTermId = similar[0]?.termId ?? null;

    try {
      await this.db.insert(schema.metadataFormattingSuggestions).values({
        id: generateId(),
        kind,
        rawValue,
        normalizedValue,
        status: "open",
        suggestedTermId,
        suggestionType: suggestedTermId ? "suggest_alias" : "similar_name",
        context: context ?? null,
      });
    } catch {
      // Duplicate open suggestion — ignore
    }
  }

  private async loadResolutionMaps(kind: VocabularyKind) {
    const [terms, aliases] = await Promise.all([
      this.db
        .select()
        .from(schema.metadataVocabularyTerms)
        .where(eq(schema.metadataVocabularyTerms.kind, kind)),
      this.db
        .select()
        .from(schema.metadataVocabularyAliases)
        .where(eq(schema.metadataVocabularyAliases.kind, kind)),
    ]);

    const canonical = new Map<string, string>();
    for (const term of terms) {
      canonical.set(term.normalizedName, term.name);
    }

    const aliasMap = new Map<string, string>();
    const termNameById = new Map(terms.map((t) => [t.id, t.name]));
    for (const alias of aliases) {
      const termName = termNameById.get(alias.termId);
      if (termName) aliasMap.set(alias.normalizedAlias, termName);
    }

    return { canonical, aliases: aliasMap };
  }

  private async loadUsageCounts(kind: VocabularyKind): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (kind !== "genre") return counts;

    const tables = [
      schema.bookGenres,
      schema.audiobookGenres,
      schema.albumGenres,
      schema.movieGenres,
      schema.tvGenres,
    ] as const;

    for (const table of tables) {
      const rows = await this.db
        .select({ name: table.name, count: sql<number>`count(*)::int` })
        .from(table)
        .groupBy(table.name);
      for (const row of rows) {
        const key = normalizeVocabularyKey(row.name);
        counts.set(key, (counts.get(key) ?? 0) + row.count);
      }
    }

    return counts;
  }

  private collectAncestorIds(
    termId: string,
    termById: Map<string, TermRow>,
  ): string[] {
    const ancestors: string[] = [];
    let current = termById.get(termId);
    while (current?.parentId) {
      ancestors.unshift(current.parentId);
      current = termById.get(current.parentId);
    }
    return ancestors;
  }

  private async getTermOrThrow(id: string): Promise<TermRow> {
    const term = await this.db.query.metadataVocabularyTerms.findFirst({
      where: eq(schema.metadataVocabularyTerms.id, id),
    });
    if (!term) throw new NotFoundError("Vocabulary term not found");
    return term;
  }

  private async assertValidParent(
    kind: VocabularyKind,
    parentId: string,
    selfId: string | null,
  ): Promise<void> {
    const parent = await this.getTermOrThrow(parentId);
    if (parent.kind !== kind) {
      throw new ValidationError("Parent term must be the same kind");
    }
    if (selfId && parentId === selfId) {
      throw new ValidationError("A term cannot be its own parent");
    }
  }

  private async assertNoCycle(termId: string, parentId: string): Promise<void> {
    let currentId: string | null = parentId;
    while (currentId) {
      if (currentId === termId) {
        throw new ValidationError("Parent assignment would create a cycle");
      }
      const row: TermRow | undefined = await this.db.query.metadataVocabularyTerms.findFirst({
        where: eq(schema.metadataVocabularyTerms.id, currentId),
      });
      currentId = row?.parentId ?? null;
    }
  }

  private async assertDepthAllowed(
    parentId: string,
    additionalDepth: number,
    excludeSubtreeRoot?: string,
  ): Promise<void> {
    const parentDepth = await this.getTermDepth(parentId);
    const subtreeDepth =
      excludeSubtreeRoot !== undefined
        ? await this.getSubtreeDepth(excludeSubtreeRoot)
        : 1;
    if (parentDepth + additionalDepth + subtreeDepth - 1 > MAX_VOCABULARY_DEPTH) {
      throw new ValidationError(`Hierarchy cannot exceed ${MAX_VOCABULARY_DEPTH} levels`);
    }
  }

  private async getTermDepth(termId: string): Promise<number> {
    let depth = 1;
    let currentId: string | null = termId;
    while (currentId) {
      const row: TermRow | undefined = await this.db.query.metadataVocabularyTerms.findFirst({
        where: eq(schema.metadataVocabularyTerms.id, currentId),
      });
      if (!row?.parentId) return depth;
      depth += 1;
      currentId = row.parentId;
    }
    return depth;
  }

  private async getSubtreeDepth(rootId: string): Promise<number> {
    const root = await this.getTermOrThrow(rootId);
    const rows = await this.db
      .select()
      .from(schema.metadataVocabularyTerms)
      .where(eq(schema.metadataVocabularyTerms.kind, root.kind));

    const childrenByParent = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.parentId) continue;
      const list = childrenByParent.get(row.parentId) ?? [];
      list.push(row.id);
      childrenByParent.set(row.parentId, list);
    }

    const walk = (id: string): number => {
      const children = childrenByParent.get(id) ?? [];
      if (children.length === 0) return 1;
      return 1 + Math.max(...children.map((childId) => walk(childId)));
    };

    return walk(rootId);
  }
}
