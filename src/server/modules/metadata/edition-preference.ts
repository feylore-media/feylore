import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  METADATA_SETTINGS_JSON_KEY,
  metadataSettingsSchema,
  type EditionFormatPreference,
  type MetadataSettings,
  type MetadataSettingsUpdate,
} from "../../../shared/metadata-edition-preference.js";

export async function readConfiguredEditionFormatPreference(
  db: Database,
  userId: string,
): Promise<EditionFormatPreference | null | undefined> {
  const row = await db.query.userPreferences.findFirst({
    where: eq(schema.userPreferences.userId, userId),
  });
  const settingsJson = row?.settingsJson ?? {};
  const metadata = settingsJson[METADATA_SETTINGS_JSON_KEY];
  if (!metadata || typeof metadata !== "object") return undefined;
  const parsed = metadataSettingsSchema.safeParse(metadata);
  return parsed.success ? parsed.data.editionFormatPreference : undefined;
}

export async function readMetadataSettings(
  db: Database,
  userId: string,
): Promise<MetadataSettings> {
  const configured = await readConfiguredEditionFormatPreference(db, userId);
  return { editionFormatPreference: configured ?? null };
}

export async function writeMetadataSettings(
  db: Database,
  userId: string,
  update: MetadataSettingsUpdate,
): Promise<MetadataSettings> {
  const existing = await db.query.userPreferences.findFirst({
    where: eq(schema.userPreferences.userId, userId),
  });

  const currentJson = { ...(existing?.settingsJson ?? {}) };
  const currentMetadata = metadataSettingsSchema.safeParse(
    currentJson[METADATA_SETTINGS_JSON_KEY],
  );
  const mergedMetadata: MetadataSettings = {
    editionFormatPreference:
      update.editionFormatPreference !== undefined
        ? update.editionFormatPreference
        : (currentMetadata.success
            ? currentMetadata.data.editionFormatPreference
            : null) ?? null,
  };

  const nextJson = {
    ...currentJson,
    [METADATA_SETTINGS_JSON_KEY]: mergedMetadata,
  };

  if (!existing) {
    await db.insert(schema.userPreferences).values({
      userId,
      settingsJson: nextJson,
    });
  } else {
    await db
      .update(schema.userPreferences)
      .set({ settingsJson: nextJson })
      .where(eq(schema.userPreferences.userId, userId));
  }

  return mergedMetadata;
}
