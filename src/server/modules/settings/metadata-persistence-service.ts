import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  DEFAULT_METADATA_PERSISTENCE,
  type MetadataPersistence,
  isMetadataPersistence,
} from "../../../shared/metadata-settings.js";
import type { MediaModuleId } from "../../../shared/media-modules.js";
import { isMediaModuleId } from "../../../shared/media-modules.js";

const METADATA_PERSISTENCE_KEY = "metadata.persistence";

export class MetadataPersistenceService {
  constructor(private readonly db: Database) {}

  async getAll(): Promise<Record<MediaModuleId, MetadataPersistence>> {
    const row = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, METADATA_PERSISTENCE_KEY),
    });
    const stored = (row?.value ?? {}) as Record<string, unknown>;
    const result = { ...DEFAULT_METADATA_PERSISTENCE };
    for (const [key, value] of Object.entries(stored)) {
      if (isMediaModuleId(key) && isMetadataPersistence(value)) {
        result[key] = value;
      }
    }
    return result;
  }

  async getForModule(moduleId: MediaModuleId): Promise<MetadataPersistence> {
    const all = await this.getAll();
    return all[moduleId] ?? "neither";
  }

  async setForModule(
    moduleId: MediaModuleId,
    persistence: MetadataPersistence,
  ): Promise<MetadataPersistence> {
    const all = await this.getAll();
    all[moduleId] = persistence;

    const value: Record<string, MetadataPersistence> = {};
    for (const [key, val] of Object.entries(all)) {
      if (isMediaModuleId(key)) value[key] = val;
    }

    const existing = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, METADATA_PERSISTENCE_KEY),
    });
    if (existing) {
      await this.db
        .update(schema.systemSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.systemSettings.key, METADATA_PERSISTENCE_KEY));
    } else {
      await this.db.insert(schema.systemSettings).values({
        key: METADATA_PERSISTENCE_KEY,
        value,
      });
    }
    return persistence;
  }
}
