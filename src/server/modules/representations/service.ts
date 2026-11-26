import { eq, and, asc, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { NotFoundError } from "../../../shared/errors.js";
import type { RepresentationFormat } from "../../../shared/subject.js";
import type { FileReferenceRegistry } from "../files/service.js";

export class RepresentationService {
  constructor(private readonly db: Database) {}

  registerDetachHandler(registry: FileReferenceRegistry) {
    registry.register(async (fileId) => {
      await this.detachFile(fileId);
    });
  }

  async create(input: {
    format: RepresentationFormat | string;
    domainModule: string;
    manifestationId?: string | null;
  }) {
    const id = generateId();
    await this.db.insert(schema.representations).values({
      id,
      format: input.format,
      domainModule: input.domainModule,
      manifestationId: input.manifestationId ?? null,
    });
    return id;
  }

  async get(id: string) {
    const row = await this.db.query.representations.findFirst({
      where: eq(schema.representations.id, id),
    });
    if (!row) throw new NotFoundError("Representation not found");
    return row;
  }

  async linkFile(
    representationId: string,
    fileId: string,
    role?: string,
    sortOrder = 0,
  ) {
    await this.get(representationId);
    await this.db
      .insert(schema.representationFiles)
      .values({ representationId, fileId, role, sortOrder })
      .onConflictDoNothing();
    await this.db
      .update(schema.representations)
      .set({ unavailableAt: null, updatedAt: new Date() })
      .where(eq(schema.representations.id, representationId));
  }

  async relinkContentFile(
    representationId: string,
    oldFileId: string,
    newFileId: string,
  ) {
    await this.unlinkFile(representationId, oldFileId);
    await this.linkFile(representationId, newFileId, "content");
  }

  async unlinkFile(representationId: string, fileId: string) {
    await this.db
      .delete(schema.representationFiles)
      .where(
        and(
          eq(schema.representationFiles.representationId, representationId),
          eq(schema.representationFiles.fileId, fileId),
        ),
      );
    await this.refreshAvailability(representationId);
  }

  async detachFile(fileId: string) {
    const links = await this.db
      .select()
      .from(schema.representationFiles)
      .where(eq(schema.representationFiles.fileId, fileId));

    await this.db
      .delete(schema.representationFiles)
      .where(eq(schema.representationFiles.fileId, fileId));

    for (const link of links) {
      await this.refreshAvailability(link.representationId);
    }
  }

  async refreshAvailability(representationId: string) {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.representationFiles)
      .where(
        eq(schema.representationFiles.representationId, representationId),
      );

    if (count === 0) {
      await this.db
        .update(schema.representations)
        .set({ unavailableAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.representations.id, representationId));
    }
  }

  async listFilesForRepresentation(representationId: string) {
    return this.db
      .select({
        fileId: schema.representationFiles.fileId,
        role: schema.representationFiles.role,
        sortOrder: schema.representationFiles.sortOrder,
        linkedAt: schema.representationFiles.linkedAt,
      })
      .from(schema.representationFiles)
      .where(
        eq(schema.representationFiles.representationId, representationId),
      )
      .orderBy(asc(schema.representationFiles.sortOrder));
  }

  async findByFileId(fileId: string) {
    const links = await this.db
      .select({
        representation: schema.representations,
      })
      .from(schema.representationFiles)
      .innerJoin(
        schema.representations,
        eq(
          schema.representationFiles.representationId,
          schema.representations.id,
        ),
      )
      .where(eq(schema.representationFiles.fileId, fileId));
    return links.map((l) => l.representation);
  }

  toPublic(row: typeof schema.representations.$inferSelect) {
    return {
      id: row.id,
      manifestationId: row.manifestationId,
      format: row.format,
      domainModule: row.domainModule,
      unavailableAt: row.unavailableAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
