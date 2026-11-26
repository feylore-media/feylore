import { constants } from "node:fs";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { FileService } from "../files/service.js";
import { NotFoundError } from "../../../shared/errors.js";

export type StorageLocationHealth = {
  exists: boolean;
  readable: boolean;
  writable: boolean;
  error?: string;
};

export type StorageLocationAdminView = {
  id: string;
  name: string;
  kind: (typeof schema.storageKindEnum.enumValues)[number];
  rootPath: string;
  watchEnabled: boolean;
  createdAt: Date;
  health: StorageLocationHealth;
};

async function probeHealth(
  files: FileService,
  location: typeof schema.storageLocations.$inferSelect,
): Promise<StorageLocationHealth> {
  await files.loadStorageLocations();

  try {
    const adapter = files.getStorageService().getAdapter(location.id);
    await adapter.stat(".");
    const rootPath = await adapter.resolve(".");

    let readable = false;
    let writable = false;
    try {
      await fs.access(rootPath, constants.R_OK);
      readable = true;
    } catch {
      readable = false;
    }

    if (location.kind === "read_only") {
      writable = false;
    } else {
      try {
        await fs.access(rootPath, constants.W_OK);
        writable = true;
      } catch {
        writable = false;
      }
    }

    return { exists: true, readable, writable };
  } catch (err) {
    return {
      exists: false,
      readable: false,
      writable: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function listStorageLocationsForAdmin(
  db: Database,
  files: FileService,
): Promise<StorageLocationAdminView[]> {
  const rows = await db.select().from(schema.storageLocations);
  const results: StorageLocationAdminView[] = [];

  for (const row of rows) {
    results.push({
      id: row.id,
      name: row.name,
      kind: row.kind,
      rootPath: row.rootPath,
      watchEnabled: row.watchEnabled,
      createdAt: row.createdAt,
      health: await probeHealth(files, row),
    });
  }

  return results;
}

export async function patchStorageLocation(
  db: Database,
  id: string,
  patch: { name?: string; watchEnabled?: boolean },
) {
  const existing = await db.query.storageLocations.findFirst({
    where: eq(schema.storageLocations.id, id),
  });
  if (!existing) throw new NotFoundError("Storage location not found");

  await db
    .update(schema.storageLocations)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.storageLocations.id, id));
}
