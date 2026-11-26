import { and, asc, count, eq, inArray, or } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import {
  inverseRelationshipType,
  relationshipEntityTypeSchema,
  relationshipTypeSchema,
  type RelatedGroup,
  type RelationshipEntityType,
} from "../../../shared/relationships.js";

type EntityRef = { type: RelationshipEntityType; id: string };

export class RelationshipService {
  constructor(private readonly db: Database) {}

  async listForSource(sourceType: string, sourceId: string) {
    return this.db.select().from(schema.creativeWorkRelationships).where(and(eq(schema.creativeWorkRelationships.sourceType, sourceType), eq(schema.creativeWorkRelationships.sourceId, sourceId)));
  }

  async create(input: { sourceType: string; sourceId: string; targetType: string; targetId: string; relationshipType: string }) {
    const sourceType = relationshipEntityTypeSchema.parse(input.sourceType);
    const targetType = relationshipEntityTypeSchema.parse(input.targetType);
    const relationshipType = relationshipTypeSchema.parse(input.relationshipType);
    if (sourceType === targetType && input.sourceId === input.targetId) throw new ForbiddenError("A work cannot be related to itself");
    await this.assertEntityExists({ type: sourceType, id: input.sourceId });
    await this.assertEntityExists({ type: targetType, id: input.targetId });
    const id = generateId();
    await this.db.insert(schema.creativeWorkRelationships).values({ id, sourceType, sourceId: input.sourceId, targetType, targetId: input.targetId, relationshipType }).onConflictDoNothing();
    return id;
  }

  async remove(id: string, source?: EntityRef) {
    const predicate = source
      ? and(
          eq(schema.creativeWorkRelationships.id, id),
          eq(schema.creativeWorkRelationships.sourceType, source.type),
          eq(schema.creativeWorkRelationships.sourceId, source.id),
        )
      : eq(schema.creativeWorkRelationships.id, id);
    const result = await this.db.delete(schema.creativeWorkRelationships).where(predicate).returning({ id: schema.creativeWorkRelationships.id });
    if (!result.length) throw new NotFoundError("Relationship not found");
  }

  async getRelated(userId: string, entity: EntityRef, groups: RelatedGroup[], pagination: { limit: number; cursor: number }) {
    const type = relationshipEntityTypeSchema.parse(entity.type);
    const subject = { ...entity, type };
    await this.assertAccessible(userId, subject);
    const selected = new Set(groups);
    const result: Record<string, unknown> = {};
    if (selected.has("semantic")) result.semantic = await this.semanticGroup(userId, subject, pagination);
    if (selected.has("people")) result.people = await this.peopleGroup(subject);
    if (selected.has("series")) result.series = await this.seriesGroup(subject);
    if (selected.has("representations")) result.representations = await this.representationsGroup(subject);
    return result;
  }

  private async semanticGroup(userId: string, entity: EntityRef, pagination: { limit: number; cursor: number }) {
    const subjectPredicate = or(
      and(eq(schema.creativeWorkRelationships.sourceType, entity.type), eq(schema.creativeWorkRelationships.sourceId, entity.id)),
      and(eq(schema.creativeWorkRelationships.targetType, entity.type), eq(schema.creativeWorkRelationships.targetId, entity.id)),
    );
    const visibleTargetPredicate = and(
      eq(schema.libraryMemberships.userId, userId),
      or(
        and(
          eq(schema.creativeWorkRelationships.sourceType, entity.type),
          eq(schema.creativeWorkRelationships.sourceId, entity.id),
          eq(schema.libraryMemberships.targetType, schema.creativeWorkRelationships.targetType),
          eq(schema.libraryMemberships.targetId, schema.creativeWorkRelationships.targetId),
        ),
        and(
          eq(schema.creativeWorkRelationships.targetType, entity.type),
          eq(schema.creativeWorkRelationships.targetId, entity.id),
          eq(schema.libraryMemberships.targetType, schema.creativeWorkRelationships.sourceType),
          eq(schema.libraryMemberships.targetId, schema.creativeWorkRelationships.sourceId),
        ),
      ),
    );
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(schema.creativeWorkRelationships)
      .innerJoin(schema.libraryMemberships, visibleTargetPredicate)
      .where(subjectPredicate);
    const rows = await this.db
      .select({ relationship: schema.creativeWorkRelationships })
      .from(schema.creativeWorkRelationships)
      .innerJoin(schema.libraryMemberships, visibleTargetPredicate)
      .where(subjectPredicate)
      .orderBy(asc(schema.creativeWorkRelationships.createdAt))
      .limit(pagination.limit)
      .offset(pagination.cursor);
    const directed = rows.map(({ relationship: row }) => {
      const outgoing = row.sourceType === entity.type && row.sourceId === entity.id;
      const target = outgoing ? { type: relationshipEntityTypeSchema.parse(row.targetType), id: row.targetId } : { type: relationshipEntityTypeSchema.parse(row.sourceType), id: row.sourceId };
      const stored = relationshipTypeSchema.parse(row.relationshipType);
      return { id: row.id, target, relationshipType: outgoing ? stored : inverseRelationshipType(stored) };
    });
    const targets = await this.resolveWorks(directed.map((item) => item.target));
    return {
      count: total,
      items: directed.flatMap((item) => {
        const target = targets.get(`${item.target.type}:${item.target.id}`);
        return target ? [{ ...target, relationshipId: item.id, relationshipType: item.relationshipType }] : [];
      }),
      nextCursor: pagination.cursor + pagination.limit < total ? pagination.cursor + pagination.limit : null,
    };
  }

  private async peopleGroup(entity: EntityRef) {
    const rows = await this.db.select({ id: schema.people.id, name: schema.people.name, slug: schema.people.slug, role: schema.personCredits.role, character: schema.personCredits.character, sortOrder: schema.personCredits.sortOrder }).from(schema.personCredits).innerJoin(schema.people, eq(schema.personCredits.peopleId, schema.people.id)).where(and(eq(schema.personCredits.targetType, entity.type), eq(schema.personCredits.targetId, entity.id))).orderBy(asc(schema.personCredits.sortOrder));
    return { count: rows.length, items: rows.map((row) => ({ ...row, href: `/people/${row.slug}` })) };
  }

  private async seriesGroup(entity: EntityRef) {
    if (entity.type === "book") {
      const items = await this.db.select({ id: schema.bookSeries.id, name: schema.bookSeries.name, position: schema.bookSeriesMembers.position }).from(schema.bookSeriesMembers).innerJoin(schema.bookSeries, eq(schema.bookSeriesMembers.seriesId, schema.bookSeries.id)).where(eq(schema.bookSeriesMembers.bookId, entity.id));
      return { count: items.length, items };
    }
    const items = await this.db.select({ id: schema.audiobookSeries.id, name: schema.audiobookSeries.name, position: schema.audiobookSeriesMembers.position }).from(schema.audiobookSeriesMembers).innerJoin(schema.audiobookSeries, eq(schema.audiobookSeriesMembers.seriesId, schema.audiobookSeries.id)).where(eq(schema.audiobookSeriesMembers.audiobookId, entity.id));
    return { count: items.length, items };
  }

  private async representationsGroup(entity: EntityRef) {
    const expressions = await this.db.select({ id: schema.creativeWorkExpressions.id }).from(schema.creativeWorkExpressions).where(and(eq(schema.creativeWorkExpressions.workType, entity.type), eq(schema.creativeWorkExpressions.workId, entity.id)));
    if (!expressions.length) return { count: 0, items: [] };
    const manifestations = await this.db.select({ id: schema.creativeWorkManifestations.id }).from(schema.creativeWorkManifestations).where(inArray(schema.creativeWorkManifestations.expressionId, expressions.map((row) => row.id)));
    if (!manifestations.length) return { count: 0, items: [] };
    const rows = await this.db.select({ id: schema.representations.id, format: schema.representations.format, domainModule: schema.representations.domainModule, unavailableAt: schema.representations.unavailableAt }).from(schema.representations).where(inArray(schema.representations.manifestationId, manifestations.map((row) => row.id)));
    return { count: rows.length, items: rows.map((row) => ({ ...row, unavailableAt: row.unavailableAt?.toISOString() ?? null })) };
  }

  private async accessibleEntities(userId: string, entities: EntityRef[]) {
    const result = new Set<string>();
    for (const type of ["book", "audiobook"] as const) {
      const ids = [...new Set(entities.filter((entity) => entity.type === type).map((entity) => entity.id))];
      if (!ids.length) continue;
      const rows = await this.db.select({ targetId: schema.libraryMemberships.targetId }).from(schema.libraryMemberships).where(and(eq(schema.libraryMemberships.userId, userId), eq(schema.libraryMemberships.targetType, type), inArray(schema.libraryMemberships.targetId, ids)));
      for (const row of rows) result.add(`${type}:${row.targetId}`);
    }
    return result;
  }

  private async assertAccessible(userId: string, entity: EntityRef) {
    const accessible = await this.accessibleEntities(userId, [entity]);
    if (!accessible.has(`${entity.type}:${entity.id}`)) throw new ForbiddenError("Work not in your library");
  }

  private async assertEntityExists(entity: EntityRef) {
    const row = entity.type === "book" ? await this.db.query.books.findFirst({ where: eq(schema.books.id, entity.id) }) : await this.db.query.audiobooks.findFirst({ where: eq(schema.audiobooks.id, entity.id) });
    if (!row) throw new NotFoundError("Relationship target not found");
  }

  private async resolveWorks(entities: EntityRef[]) {
    const result = new Map<string, { id: string; type: RelationshipEntityType; title: string; slug: string; href: string }>();
    const bookIds = [...new Set(entities.filter((item) => item.type === "book").map((item) => item.id))];
    const audiobookIds = [...new Set(entities.filter((item) => item.type === "audiobook").map((item) => item.id))];
    if (bookIds.length) for (const row of await this.db.select({ id: schema.books.id, title: schema.books.title, slug: schema.books.slug }).from(schema.books).where(inArray(schema.books.id, bookIds))) result.set(`book:${row.id}`, { ...row, type: "book", href: `/books/${row.slug}` });
    if (audiobookIds.length) for (const row of await this.db.select({ id: schema.audiobooks.id, title: schema.audiobooks.title, slug: schema.audiobooks.slug }).from(schema.audiobooks).where(inArray(schema.audiobooks.id, audiobookIds))) result.set(`audiobook:${row.id}`, { ...row, type: "audiobook", href: `/audiobooks/${row.slug}` });
    return result;
  }

  toPublic(row: typeof schema.creativeWorkRelationships.$inferSelect) {
    return { id: row.id, sourceType: row.sourceType, sourceId: row.sourceId, targetType: row.targetType, targetId: row.targetId, relationshipType: row.relationshipType, createdAt: row.createdAt.toISOString() };
  }
}
