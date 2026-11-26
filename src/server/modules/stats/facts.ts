import { and, eq, inArray } from "drizzle-orm";
import { normalizeVocabularyKey } from "../../../shared/metadata-formatting.js";
import { type StatsFactKind, type StatsMediaType } from "../../../shared/stats.js";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import {
  mediaTypeForSubjectType,
  SnapshotResolver,
  type SnapshotGenre,
} from "./snapshot.js";

export interface RecordFactInput {
  userId: string;
  kind?: StatsFactKind;
  subjectType: string;
  subjectId: string;
  mediaType?: StatsMediaType;
  occurredAt: Date;
  value?: number;
  unit?: string;
  ratingScale?: number | null;
  visibility?: "private" | "public";
  source: string;
  sourceKey: string;
  snapshot?: Record<string, unknown> | null;
}

/**
 * Append-only, idempotent writer for `user_stat_facts`. The unique
 * `(user_id, kind, source, source_key)` pair makes re-runs of the backfill
 * and re-wired service events safe. See docs/STATS.md §7.
 */
export class StatsFactRecorder {
  private snapshots: SnapshotResolver;

  constructor(private readonly db: Database) {
    this.snapshots = new SnapshotResolver(db);
  }

  async record(input: RecordFactInput): Promise<boolean> {
    const snapshot = input.snapshot ?? (await this.resolveSnapshot(input));
    const mediaType = input.mediaType ?? mediaTypeForSubjectType(input.subjectType);
    const value = input.value ?? 0;
    const unit = input.unit ?? "count";
    const kind = input.kind ?? "completed";

    const result = await this.db
      .insert(schema.userStatFacts)
      .values({
        id: generateId(),
        userId: input.userId,
        kind,
        mediaType,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        occurredAt: input.occurredAt,
        value,
        unit,
        ratingScale: input.ratingScale ?? null,
        snapshot,
        visibility: input.visibility ?? "private",
        source: input.source,
        sourceKey: input.sourceKey,
      })
      .onConflictDoNothing({
        target: [
          schema.userStatFacts.userId,
          schema.userStatFacts.kind,
          schema.userStatFacts.source,
          schema.userStatFacts.sourceKey,
        ],
      });

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Ratings are a current-state fact: re-rating a subject updates value and
   * snapshot but preserves the first rating date (rating tables do not record
   * re-rate dates in V1; see docs/STATS.md §7.2).
   */
  async recordRated(input: RecordFactInput): Promise<boolean> {
    const snapshot = input.snapshot ?? (await this.resolveSnapshot(input));
    const mediaType = input.mediaType ?? mediaTypeForSubjectType(input.subjectType);

    const result = await this.db
      .insert(schema.userStatFacts)
      .values({
        id: generateId(),
        userId: input.userId,
        kind: "rated",
        mediaType,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        occurredAt: input.occurredAt,
        value: input.value ?? 0,
        unit: input.unit ?? "stars",
        ratingScale: input.ratingScale ?? null,
        snapshot,
        visibility: input.visibility ?? "private",
        source: input.source,
        sourceKey: input.sourceKey,
      })
      .onConflictDoUpdate({
        target: [
          schema.userStatFacts.userId,
          schema.userStatFacts.kind,
          schema.userStatFacts.source,
          schema.userStatFacts.sourceKey,
        ],
        set: {
          value: input.value ?? 0,
          unit: input.unit ?? "stars",
          ratingScale: input.ratingScale ?? null,
          snapshot,
          mediaType,
        },
      });

    return (result.rowCount ?? 0) > 0;
  }

  async deleteRated(
    userId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<void> {
    await this.db
      .delete(schema.userStatFacts)
      .where(
        and(
          eq(schema.userStatFacts.userId, userId),
          eq(schema.userStatFacts.kind, "rated"),
          eq(schema.userStatFacts.subjectType, subjectType),
          eq(schema.userStatFacts.subjectId, subjectId),
        ),
      );
  }

  private async resolveSnapshot(
    input: RecordFactInput,
  ): Promise<Record<string, unknown>> {
    const resolved = await this.snapshots.resolve(
      input.subjectType,
      input.subjectId,
    );
    return resolved.snapshot;
  }
}

/**
 * Best-effort enrichment of genre names with vocabulary term ids for
 * `snapshot.genres[].termId`. Unknown names keep `termId: null`.
 */
export async function enrichGenreTerms(
  db: Database,
  genres: SnapshotGenre[],
): Promise<SnapshotGenre[]> {
  if (genres.length === 0) return genres;
  const names = [...new Set(genres.map((g) => g.name).filter(Boolean))];
  if (names.length === 0) return genres;

  const terms = await db
    .select({
      id: schema.metadataVocabularyTerms.id,
      normalizedName: schema.metadataVocabularyTerms.normalizedName,
    })
    .from(schema.metadataVocabularyTerms)
    .where(
      and(
        eq(schema.metadataVocabularyTerms.kind, "genre"),
        inArray(schema.metadataVocabularyTerms.normalizedName, names),
      ),
    );

  const byNormalized = new Map(terms.map((t) => [t.normalizedName, t.id]));

  const missing = names.filter(
    (n) => !byNormalized.has(normalizeVocabularyKey(n)),
  );

  const aliases = await db
    .select({
      termId: schema.metadataVocabularyAliases.termId,
      normalizedAlias: schema.metadataVocabularyAliases.normalizedAlias,
    })
    .from(schema.metadataVocabularyAliases)
    .where(
      and(
        eq(schema.metadataVocabularyAliases.kind, "genre"),
        inArray(schema.metadataVocabularyAliases.normalizedAlias, missing),
      ),
    );
  const aliasMap = new Map(aliases.map((a) => [a.normalizedAlias, a.termId]));

  return genres.map((g) => {
    const key = normalizeVocabularyKey(g.name);
    const termId = byNormalized.get(key) ?? aliasMap.get(key) ?? null;
    return termId ? { ...g, termId } : g;
  });
}