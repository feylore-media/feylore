import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { NotFoundError, ValidationError } from "../../../shared/errors.js";

export interface PhysicalHoldingPublic {
  id: string;
  workType: "book";
  workId: string;
  manifestationId: string | null;
  createdAt: string;
  updatedAt: string;
}

const ISBN_EXTERNAL_ID_TYPES = ["isbn13", "isbn", "isbn10"] as const;

export function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, "").toUpperCase();
}

/**
 * User-scoped physical book ownership.
 *
 * A holding records that a user owns a physical copy of a book Work. A null
 * manifestationId means "physical copy owned, edition unknown". Holdings never
 * create Representation/file rows and are separate from global library
 * membership. Single-copy: one holding per (user, work); repeated ownership
 * requests and ISBN scans are idempotent.
 */
export class PhysicalHoldingService {
  constructor(private readonly db: Database) {}

  toPublic(
    row: typeof schema.physicalHoldings.$inferSelect,
  ): PhysicalHoldingPublic {
    return {
      id: row.id,
      workType: "book",
      workId: row.workId,
      manifestationId: row.manifestationId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async requireBook(workId: string) {
    const book = await this.db.query.books.findFirst({
      where: eq(schema.books.id, workId),
    });
    if (!book) throw new NotFoundError("Book not found");
    return book;
  }

  /** Manifestations of a book Work, ordered deterministically. */
  async manifestationsForBook(workId: string) {
    const expressions = await this.db
      .select({ id: schema.creativeWorkExpressions.id })
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          eq(schema.creativeWorkExpressions.workType, "book"),
          eq(schema.creativeWorkExpressions.workId, workId),
        ),
      );
    if (expressions.length === 0) return [];
    return this.db
      .select()
      .from(schema.creativeWorkManifestations)
      .where(
        inArray(
          schema.creativeWorkManifestations.expressionId,
          expressions.map((e) => e.id),
        ),
      );
  }

  private async requireManifestationForBook(
    workId: string,
    manifestationId: string,
  ) {
    const manifestations = await this.manifestationsForBook(workId);
    const match = manifestations.find((m) => m.id === manifestationId);
    if (!match) {
      throw new ValidationError("Manifestation does not belong to this book");
    }
    return match;
  }

  async getForUser(
    userId: string,
    workId: string,
  ): Promise<PhysicalHoldingPublic | null> {
    const row = await this.db.query.physicalHoldings.findFirst({
      where: and(
        eq(schema.physicalHoldings.userId, userId),
        eq(schema.physicalHoldings.workType, "book"),
        eq(schema.physicalHoldings.workId, workId),
      ),
    });
    return row ? this.toPublic(row) : null;
  }

  async listForUser(
    userId: string,
    opts: { withoutDigital?: boolean } = {},
  ): Promise<PhysicalHoldingPublic[]> {
    const rows = await this.db
      .select()
      .from(schema.physicalHoldings)
      .where(
        and(
          eq(schema.physicalHoldings.userId, userId),
          eq(schema.physicalHoldings.workType, "book"),
        ),
      );
    if (!opts.withoutDigital) return rows.map((r) => this.toPublic(r));
    const withDigital = await this.workIdsWithDigitalRepresentation(
      rows.map((r) => r.workId),
    );
    return rows
      .filter((r) => !withDigital.has(r.workId))
      .map((r) => this.toPublic(r));
  }

  /** Work ids (from the given set) that have at least one usable digital file. */
  async workIdsWithDigitalRepresentation(
    workIds: string[],
  ): Promise<Set<string>> {
    if (workIds.length === 0) return new Set();
    const expressions = await this.db
      .select({
        id: schema.creativeWorkExpressions.id,
        workId: schema.creativeWorkExpressions.workId,
      })
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          eq(schema.creativeWorkExpressions.workType, "book"),
          inArray(schema.creativeWorkExpressions.workId, workIds),
        ),
      );
    if (expressions.length === 0) return new Set();
    const expressionWork = new Map(expressions.map((e) => [e.id, e.workId]));
    const manifestations = await this.db
      .select({
        id: schema.creativeWorkManifestations.id,
        expressionId: schema.creativeWorkManifestations.expressionId,
      })
      .from(schema.creativeWorkManifestations)
      .where(
        inArray(
          schema.creativeWorkManifestations.expressionId,
          expressions.map((e) => e.id),
        ),
      );
    if (manifestations.length === 0) return new Set();
    const reps = await this.db
      .select({
        id: schema.representations.id,
        manifestationId: schema.representations.manifestationId,
        unavailableAt: schema.representations.unavailableAt,
      })
      .from(schema.representations)
      .where(
        inArray(
          schema.representations.manifestationId,
          manifestations.map((m) => m.id),
        ),
      );
    const usable = reps.filter((r) => !r.unavailableAt);
    if (usable.length === 0) return new Set();
    const links = await this.db
      .select({ representationId: schema.representationFiles.representationId })
      .from(schema.representationFiles)
      .where(
        inArray(
          schema.representationFiles.representationId,
          usable.map((r) => r.id),
        ),
      );
    const repsWithFiles = new Set(links.map((l) => l.representationId));
    const manifestationWork = new Map(
      manifestations.map((m) => [m.id, expressionWork.get(m.expressionId)]),
    );
    const result = new Set<string>();
    for (const rep of usable) {
      if (!rep.manifestationId || !repsWithFiles.has(rep.id)) continue;
      const workId = manifestationWork.get(rep.manifestationId);
      if (workId) result.add(workId);
    }
    return result;
  }

  /**
   * Mark a Work as physically owned. Idempotent: repeated calls return the
   * existing holding. When a manifestation is supplied, an existing
   * edition-unknown holding is reconciled to that edition rather than
   * creating a second holding.
   */
  async markOwned(
    userId: string,
    workId: string,
    manifestationId?: string | null,
  ): Promise<{ holding: PhysicalHoldingPublic; created: boolean }> {
    await this.requireBook(workId);
    if (manifestationId) {
      await this.requireManifestationForBook(workId, manifestationId);
    }
    const existing = await this.db.query.physicalHoldings.findFirst({
      where: and(
        eq(schema.physicalHoldings.userId, userId),
        eq(schema.physicalHoldings.workType, "book"),
        eq(schema.physicalHoldings.workId, workId),
      ),
    });
    if (existing) {
      if (manifestationId && existing.manifestationId !== manifestationId) {
        const [updated] = await this.db
          .update(schema.physicalHoldings)
          .set({ manifestationId, updatedAt: new Date() })
          .where(eq(schema.physicalHoldings.id, existing.id))
          .returning();
        return { holding: this.toPublic(updated!), created: false };
      }
      return { holding: this.toPublic(existing), created: false };
    }
    const [created] = await this.db
      .insert(schema.physicalHoldings)
      .values({
        id: generateId(),
        userId,
        workType: "book",
        workId,
        manifestationId: manifestationId ?? null,
      })
      .returning();
    return { holding: this.toPublic(created!), created: true };
  }

  /**
   * Associate an existing (usually edition-unknown) holding with an existing
   * manifestation. Creates an identified holding when the user holds no
   * holding yet for the Work.
   */
  async identifyEdition(
    userId: string,
    workId: string,
    manifestationId: string,
  ): Promise<PhysicalHoldingPublic> {
    const { holding } = await this.markOwned(userId, workId, manifestationId);
    return holding;
  }

  async removeOwnership(userId: string, workId: string): Promise<boolean> {
    const existing = await this.db.query.physicalHoldings.findFirst({
      where: and(
        eq(schema.physicalHoldings.userId, userId),
        eq(schema.physicalHoldings.workType, "book"),
        eq(schema.physicalHoldings.workId, workId),
      ),
    });
    if (!existing) return false;
    await this.db
      .delete(schema.physicalHoldings)
      .where(eq(schema.physicalHoldings.id, existing.id));
    return true;
  }

  /**
   * Barcode-scan entry point (scanner UI itself is out of scope): resolve an
   * ISBN to a manifestation/Work, then mark it owned for the current user.
   * Repeated scans return the existing holding. When the user already holds
   * an edition-unknown holding for the resolved Work, it is reconciled with
   * the scanned edition instead of creating another holding.
   */
  async markOwnedByIsbn(
    userId: string,
    rawIsbn: string,
  ): Promise<{ holding: PhysicalHoldingPublic; created: boolean }> {
    const isbn = normalizeIsbn(rawIsbn);
    if (!isbn) throw new ValidationError("ISBN is required");
    const matches = await this.db
      .select({
        manifestationId: schema.creativeWorkManifestations.id,
        expressionId: schema.creativeWorkManifestations.expressionId,
        workType: schema.creativeWorkExpressions.workType,
        workId: schema.creativeWorkExpressions.workId,
      })
      .from(schema.creativeWorkManifestations)
      .innerJoin(
        schema.creativeWorkExpressions,
        eq(
          schema.creativeWorkManifestations.expressionId,
          schema.creativeWorkExpressions.id,
        ),
      )
      .where(
        and(
          inArray(schema.creativeWorkManifestations.externalIdType, [
            ...ISBN_EXTERNAL_ID_TYPES,
          ]),
          eq(schema.creativeWorkManifestations.externalId, isbn),
          eq(schema.creativeWorkExpressions.workType, "book"),
        ),
      );
    if (matches.length === 0) throw new NotFoundError("ISBN not in library");
    // Prefer a manifestation belonging to a Work the user already holds
    // edition-unknown, so the scan reconciles instead of scattering holdings.
    let chosen = matches[0]!;
    if (matches.length > 1) {
      const held = await this.db
        .select({ workId: schema.physicalHoldings.workId })
        .from(schema.physicalHoldings)
        .where(
          and(
            eq(schema.physicalHoldings.userId, userId),
            eq(schema.physicalHoldings.workType, "book"),
            inArray(
              schema.physicalHoldings.workId,
              matches.map((m) => m.workId),
            ),
          ),
        );
      const heldWorkIds = new Set(held.map((h) => h.workId));
      chosen = matches.find((m) => heldWorkIds.has(m.workId)) ?? chosen;
    }
    return this.markOwned(userId, chosen.workId, chosen.manifestationId);
  }

  /** Deletion-preview support: holdings affected by deleting a Work. */
  async countForWork(workId: string): Promise<{
    holdings: number;
    users: number;
  }> {
    const rows = await this.db
      .select({ userId: schema.physicalHoldings.userId })
      .from(schema.physicalHoldings)
      .where(
        and(
          eq(schema.physicalHoldings.workType, "book"),
          eq(schema.physicalHoldings.workId, workId),
        ),
      );
    return {
      holdings: rows.length,
      users: new Set(rows.map((r) => r.userId)).size,
    };
  }
}
