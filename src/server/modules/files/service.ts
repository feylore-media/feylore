import path from "node:path";
import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { StorageService } from "../storage/adapter.js";
import { NotFoundError } from "../../../shared/errors.js";
import { normalizeRelativePath } from "../../security/paths.js";

type DetachHandler = (fileId: string) => Promise<void>;

export class FileReferenceRegistry {
  private handlers: DetachHandler[] = [];

  register(handler: DetachHandler) {
    this.handlers.push(handler);
  }

  async notifyDetach(fileId: string) {
    for (const handler of this.handlers) {
      await handler(fileId);
    }
  }
}

export class FileService {
  constructor(
    private readonly db: Database,
    private readonly storage: StorageService,
    private readonly registry: FileReferenceRegistry,
  ) {}

  getStorageService() {
    return this.storage;
  }

  async loadStorageLocations() {
    const locations = await this.db.select().from(schema.storageLocations);
    this.storage.clear();
    for (const loc of locations) {
      this.storage.register({
        id: loc.id,
        name: loc.name,
        kind: loc.kind,
        rootPath: path.resolve(loc.rootPath),
      });
    }
    return locations;
  }

  async getFile(id: string) {
    const file = await this.db.query.files.findFirst({
      where: eq(schema.files.id, id),
    });
    if (!file) throw new NotFoundError("File not found");
    return file;
  }

  toPublic(file: typeof schema.files.$inferSelect) {
    return {
      id: file.id,
      storageLocationId: file.storageLocationId,
      relativePath: file.relativePath,
      size: file.size,
      mediaType: file.mediaType,
      checksum: file.checksum,
      mtime: file.mtime?.toISOString() ?? null,
      missingAt: file.missingAt?.toISOString() ?? null,
      createdAt: file.createdAt.toISOString(),
    };
  }

  async removeFileRecord(id: string) {
    await this.registry.notifyDetach(id);
    await this.db.delete(schema.files).where(eq(schema.files.id, id));
  }

  async deleteFile(id: string) {
    const file = await this.getFile(id);
    const adapter = this.storage.getAdapter(file.storageLocationId);
    adapter.assertWritable();
    await adapter.delete(file.relativePath);
    await this.registry.notifyDetach(id);
    await this.db.delete(schema.files).where(eq(schema.files.id, id));
  }

  async upsertDiscovered(
    storageLocationId: string,
    discovered: {
      relativePath: string;
      size: number;
      mtime: Date;
      mediaType?: string;
      checksum?: string;
    },
  ) {
    const existing = await this.db.query.files.findFirst({
      where: (f, { and, eq: eqFn }) =>
        and(
          eqFn(f.storageLocationId, storageLocationId),
          eqFn(f.relativePath, discovered.relativePath),
        ),
    });

    if (existing) {
      await this.db
        .update(schema.files)
        .set({
          size: discovered.size,
          mtime: discovered.mtime,
          mediaType: discovered.mediaType,
          checksum: discovered.checksum,
          missingAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.files.id, existing.id));
      return existing.id;
    }

    const id = generateId();
    await this.db.insert(schema.files).values({
      id,
      storageLocationId,
      relativePath: discovered.relativePath,
      size: discovered.size,
      mtime: discovered.mtime,
      mediaType: discovered.mediaType,
      checksum: discovered.checksum,
    });
    return id;
  }

  async markMissing(storageLocationId: string, seenPaths: Set<string>) {
    const allFiles = await this.db
      .select()
      .from(schema.files)
      .where(eq(schema.files.storageLocationId, storageLocationId));

    for (const file of allFiles) {
      if (!seenPaths.has(file.relativePath) && !file.missingAt) {
        await this.db
          .update(schema.files)
          .set({ missingAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.files.id, file.id));
      }
    }
  }

  async getStream(fileId: string, range?: { start: number; end: number }) {
    const file = await this.getFile(fileId);
    const adapter = this.storage.getAdapter(file.storageLocationId);
    const stream = await adapter.createReadStream(file.relativePath, range);
    return { file, stream };
  }

  async findByRelativePath(
    storageLocationId: string,
    relativePath: string,
  ) {
    return this.db.query.files.findFirst({
      where: and(
        eq(schema.files.storageLocationId, storageLocationId),
        eq(schema.files.relativePath, normalizeRelativePath(relativePath)),
      ),
    });
  }

  async findSiblingImage(sourceRelativePath: string, storageLocationId: string) {
    const dir = path.posix.dirname(sourceRelativePath.replace(/\\/g, "/"));
    const base = path.posix
      .basename(sourceRelativePath)
      .replace(/\.[^.]+$/, "");

    for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
      const candidate = normalizeRelativePath(
        dir === "." ? `${base}${ext}` : `${dir}/${base}${ext}`,
      );
      const file = await this.findByRelativePath(storageLocationId, candidate);
      if (file && !file.missingAt) return file;
    }
    return null;
  }

  async getManagedStorageLocationId(): Promise<string | null> {
    const row = await this.db.query.storageLocations.findFirst({
      where: eq(schema.storageLocations.kind, "managed"),
    });
    return row?.id ?? null;
  }

  async storeDerivedFile(input: {
    storageLocationId: string;
    relativePath: string;
    data: Buffer;
    mediaType: string;
  }): Promise<string> {
    const adapter = this.storage.getAdapter(input.storageLocationId);
    adapter.assertWritable();
    await adapter.write(input.relativePath, input.data);

    const checksum = createHash("sha256").update(input.data).digest("hex");
    const existing = await this.findByRelativePath(
      input.storageLocationId,
      input.relativePath,
    );

    if (existing) {
      await this.db
        .update(schema.files)
        .set({
          size: input.data.length,
          mediaType: input.mediaType,
          checksum,
          missingAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.files.id, existing.id));
      return existing.id;
    }

    const stat = await adapter.stat(input.relativePath);
    const id = generateId();
    await this.db.insert(schema.files).values({
      id,
      storageLocationId: input.storageLocationId,
      relativePath: normalizeRelativePath(input.relativePath),
      size: input.data.length,
      mtime: stat.mtime,
      mediaType: input.mediaType,
      checksum,
    });
    return id;
  }

  async updateFilePath(
    fileId: string,
    relativePath: string,
    extra?: { checksum?: string; size?: number },
  ) {
    await this.db
      .update(schema.files)
      .set({
        relativePath: normalizeRelativePath(relativePath),
        checksum: extra?.checksum,
        size: extra?.size,
        missingAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.files.id, fileId));
  }

  async registerFileAtLocation(input: {
    id?: string;
    storageLocationId: string;
    relativePath: string;
    size: number;
    checksum?: string;
    mediaType?: string;
    mtime?: Date;
  }): Promise<string> {
    const relativePath = normalizeRelativePath(input.relativePath);
    const existing = await this.findByRelativePath(
      input.storageLocationId,
      relativePath,
    );
    if (existing) {
      await this.db
        .update(schema.files)
        .set({
          size: input.size,
          checksum: input.checksum,
          mediaType: input.mediaType,
          missingAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.files.id, existing.id));
      return existing.id;
    }

    const id = input.id ?? generateId();
    const adapter = this.storage.getAdapter(input.storageLocationId);
    const stat = await adapter.stat(relativePath);
    await this.db.insert(schema.files).values({
      id,
      storageLocationId: input.storageLocationId,
      relativePath,
      size: input.size,
      mtime: input.mtime ?? stat.mtime,
      mediaType: input.mediaType,
      checksum: input.checksum,
    });
    return id;
  }
}
