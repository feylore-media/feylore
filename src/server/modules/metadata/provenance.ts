import { eq, and } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type {
  FieldProvenance,
  MetadataProvenanceOrigin,
} from "../../../shared/metadata-provenance.js";
import type { MetadataSourceCategory } from "../../../shared/metadata-source-category.js";

export interface ProvenanceWriteInput {
  subjectType: string;
  subjectId: string;
  field: string;
  sourceKey: string;
  sourceCategory: MetadataSourceCategory;
  origin: MetadataProvenanceOrigin;
  userId?: string;
}

export class MetadataProvenanceService {
  constructor(private readonly db: Database) {}

  async getFieldProvenance(
    subjectType: string,
    subjectId: string,
    field: string,
  ): Promise<FieldProvenance | null> {
    const row = await this.db.query.metadataFieldProvenance.findFirst({
      where: and(
        eq(schema.metadataFieldProvenance.subjectType, subjectType),
        eq(schema.metadataFieldProvenance.subjectId, subjectId),
        eq(schema.metadataFieldProvenance.field, field),
      ),
    });
    if (!row) return null;
    return this.toPublic(row);
  }

  async listProvenance(
    subjectType: string,
    subjectId: string,
  ): Promise<Map<string, FieldProvenance>> {
    const rows = await this.db
      .select()
      .from(schema.metadataFieldProvenance)
      .where(
        and(
          eq(schema.metadataFieldProvenance.subjectType, subjectType),
          eq(schema.metadataFieldProvenance.subjectId, subjectId),
        ),
      );
    const result = new Map<string, FieldProvenance>();
    for (const row of rows) {
      result.set(row.field, this.toPublic(row));
    }
    return result;
  }

  async upsertProvenance(input: ProvenanceWriteInput): Promise<void> {
    const existing = await this.db.query.metadataFieldProvenance.findFirst({
      where: and(
        eq(schema.metadataFieldProvenance.subjectType, input.subjectType),
        eq(schema.metadataFieldProvenance.subjectId, input.subjectId),
        eq(schema.metadataFieldProvenance.field, input.field),
      ),
    });

    if (existing) {
      await this.db
        .update(schema.metadataFieldProvenance)
        .set({
          sourceKey: input.sourceKey,
          sourceCategory: input.sourceCategory,
          origin: input.origin,
          updatedByUserId: input.userId ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.metadataFieldProvenance.subjectType, input.subjectType),
            eq(schema.metadataFieldProvenance.subjectId, input.subjectId),
            eq(schema.metadataFieldProvenance.field, input.field),
          ),
        );
      return;
    }

    await this.db.insert(schema.metadataFieldProvenance).values({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      field: input.field,
      sourceKey: input.sourceKey,
      sourceCategory: input.sourceCategory,
      origin: input.origin,
      updatedByUserId: input.userId ?? null,
    });
  }

  async deleteProvenance(
    subjectType: string,
    subjectId: string,
    field: string,
  ): Promise<void> {
    await this.db
      .delete(schema.metadataFieldProvenance)
      .where(
        and(
          eq(schema.metadataFieldProvenance.subjectType, subjectType),
          eq(schema.metadataFieldProvenance.subjectId, subjectId),
          eq(schema.metadataFieldProvenance.field, field),
        ),
      );
  }

  private toPublic(
    row: typeof schema.metadataFieldProvenance.$inferSelect,
  ): FieldProvenance {
    return {
      sourceKey: row.sourceKey,
      sourceCategory: row.sourceCategory as MetadataSourceCategory,
      origin: row.origin as MetadataProvenanceOrigin,
      updatedAt: row.updatedAt.toISOString(),
      updatedByUserId: row.updatedByUserId ?? undefined,
    };
  }
}
