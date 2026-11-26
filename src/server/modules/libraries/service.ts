import { eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import { NotFoundError } from "../../../shared/errors.js";
import type { FileService } from "../files/service.js";

export class LibraryService {
  constructor(
    private readonly db: Database,
    private readonly files: FileService,
  ) {}

  async list() {
    return this.db.select().from(schema.libraries);
  }

  async getById(id: string) {
    return this.db.query.libraries.findFirst({
      where: eq(schema.libraries.id, id),
    });
  }

  async create(input: {
    name: string;
    description?: string;
    contentType?: "book" | "audiobook" | "music";
    enabled?: boolean;
    storageLocationId?: string;
    organizationPolicy?: schema.OrganizationPolicy;
    normalizationPolicy?: schema.NormalizationPolicy;
    supportedFormats?: string[];
  }) {
    const id = generateId();
    await this.db.insert(schema.libraries).values({
      id,
      name: input.name,
      description: input.description,
      intendedDomain: input.contentType ?? "book",
      contentType: input.contentType ?? "book",
      enabled: input.enabled ?? true,
      storageLocationId: input.storageLocationId,
      organizationPolicy: input.organizationPolicy,
      normalizationPolicy: input.normalizationPolicy,
      supportedFormats: input.supportedFormats,
    });
    return id;
  }

  async update(
    id: string,
    patch: Partial<{
      name: string;
      description: string | null;
      enabled: boolean;
      storageLocationId: string | null;
      organizationPolicy: schema.OrganizationPolicy;
      normalizationPolicy: schema.NormalizationPolicy;
      supportedFormats: string[];
    }>,
  ) {
    const existing = await this.getById(id);
    if (!existing) throw new NotFoundError("Library not found");
    await this.db
      .update(schema.libraries)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.libraries.id, id));
  }

  async getDefaultBookLibrary() {
    const rows = await this.db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.contentType, "book"));
    const enabled = rows.filter((r) => r.enabled !== false);
    if (enabled.length === 1) return enabled[0]!;
    return enabled[0] ?? rows[0] ?? null;
  }

  async ensureBooksStorageLocation(booksRootPath: string): Promise<string> {
    const resolved = path.resolve(booksRootPath);
    await fs.mkdir(resolved, { recursive: true });
    await this.files.loadStorageLocations();

    const rows = await this.db.select().from(schema.storageLocations);
    const match = rows.find((l) => path.resolve(l.rootPath) === resolved);
    if (match) return match.id;

    const id = generateId();
    await this.db.insert(schema.storageLocations).values({
      id,
      name: "Books Library",
      kind: "managed",
      rootPath: resolved,
    });
    await this.files.loadStorageLocations();
    return id;
  }

  async ensureDefaultBookLibrary(booksRootPath: string) {
    const existing = await this.getDefaultBookLibrary();
    if (existing) return existing;

    const storageLocationId = await this.ensureBooksStorageLocation(booksRootPath);

    const raced = await this.getDefaultBookLibrary();
    if (raced) return raced;

    const id = await this.create({
      name: "Books",
      contentType: "book",
      storageLocationId,
      organizationPolicy: {
        mode: "managed",
        template: "{author}/{series}/{title}",
      },
    });
    const created = await this.getById(id);
    if (!created) throw new NotFoundError("Failed to create default Books library");
    return created;
  }

  async getDefaultAudiobookLibrary() {
    const rows = await this.db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.contentType, "audiobook"));
    const enabled = rows.filter((r) => r.enabled !== false);
    if (enabled.length === 1) return enabled[0]!;
    return enabled[0] ?? rows[0] ?? null;
  }

  async ensureAudiobooksStorageLocation(
    audiobooksRootPath: string,
  ): Promise<string> {
    const resolved = path.resolve(audiobooksRootPath);
    await fs.mkdir(resolved, { recursive: true });
    await this.files.loadStorageLocations();

    const rows = await this.db.select().from(schema.storageLocations);
    const match = rows.find((l) => path.resolve(l.rootPath) === resolved);
    if (match) return match.id;

    const id = generateId();
    await this.db.insert(schema.storageLocations).values({
      id,
      name: "Audiobooks Library",
      kind: "managed",
      rootPath: resolved,
    });
    await this.files.loadStorageLocations();
    return id;
  }

  async ensureDefaultAudiobookLibrary(audiobooksRootPath: string) {
    const existing = await this.getDefaultAudiobookLibrary();
    if (existing) return existing;

    const storageLocationId =
      await this.ensureAudiobooksStorageLocation(audiobooksRootPath);

    const raced = await this.getDefaultAudiobookLibrary();
    if (raced) return raced;

    const id = await this.create({
      name: "Audiobooks",
      contentType: "audiobook",
      storageLocationId,
      organizationPolicy: {
        mode: "managed",
        template: "{author}/{series}/{title}",
      },
      supportedFormats: ["m4b", "mp3", "m4a", "flac", "ogg", "opus", "aac"],
    });
    const created = await this.getById(id);
    if (!created) {
      throw new NotFoundError("Failed to create default Audiobooks library");
    }
    return created;
  }

  async getDefaultMusicLibrary() {
    const rows = await this.db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.contentType, "music"));
    const enabled = rows.filter((r) => r.enabled !== false);
    if (enabled.length === 1) return enabled[0]!;
    return enabled[0] ?? rows[0] ?? null;
  }

  async ensureMusicStorageLocation(musicRootPath: string): Promise<string> {
    const resolved = path.resolve(musicRootPath);
    await fs.mkdir(resolved, { recursive: true });
    await this.files.loadStorageLocations();

    const rows = await this.db.select().from(schema.storageLocations);
    const match = rows.find((l) => path.resolve(l.rootPath) === resolved);
    if (match) return match.id;

    const id = generateId();
    await this.db.insert(schema.storageLocations).values({
      id,
      name: "Music Library",
      kind: "managed",
      rootPath: resolved,
    });
    await this.files.loadStorageLocations();
    return id;
  }

  async ensureDefaultMusicLibrary(musicRootPath: string) {
    const existing = await this.getDefaultMusicLibrary();
    if (existing) return existing;

    const storageLocationId =
      await this.ensureMusicStorageLocation(musicRootPath);

    const raced = await this.getDefaultMusicLibrary();
    if (raced) return raced;

    const id = await this.create({
      name: "Music",
      contentType: "music",
      storageLocationId,
      organizationPolicy: {
        mode: "managed",
        template: "{artist}/{album}/{title}",
      },
      supportedFormats: ["mp3", "m4a", "flac", "ogg", "opus", "aac", "wav"],
    });
    const created = await this.getById(id);
    if (!created) {
      throw new NotFoundError("Failed to create default Music library");
    }
    return created;
  }

  async validate(id: string) {
    const library = await this.getById(id);
    if (!library) throw new NotFoundError("Library not found");
    if (!library.storageLocationId) {
      return { accessible: false, error: "No storage location configured" };
    }
    await this.files.loadStorageLocations();
    const adapter = this.files
      .getStorageService()
      .getAdapter(library.storageLocationId);
    try {
      await adapter.stat(".");
      return { accessible: true };
    } catch (err) {
      return {
        accessible: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async scanLibrary(id: string) {
    const library = await this.getById(id);
    if (!library?.storageLocationId) {
      throw new NotFoundError("Library storage not configured");
    }
    return library.storageLocationId;
  }
}
