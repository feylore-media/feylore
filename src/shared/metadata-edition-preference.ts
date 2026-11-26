import { z } from "zod";
import type { MediaModuleId } from "./media-modules.js";

/** User-configurable edition/format preference for metadata import. */
export const EDITION_FORMAT_PREFERENCES = [
  "print-or-ebook",
  "print",
  "ebook",
  "audiobook",
] as const;

export type EditionFormatPreference =
  (typeof EDITION_FORMAT_PREFERENCES)[number];

export const editionFormatPreferenceSchema = z.enum(EDITION_FORMAT_PREFERENCES);

export const metadataSettingsSchema = z.object({
  editionFormatPreference: editionFormatPreferenceSchema.nullable().optional(),
});

export type MetadataSettings = z.infer<typeof metadataSettingsSchema>;

export const metadataSettingsUpdateSchema = z.object({
  editionFormatPreference: editionFormatPreferenceSchema.nullable().optional(),
});

export type MetadataSettingsUpdate = z.infer<
  typeof metadataSettingsUpdateSchema
>;

export const METADATA_SETTINGS_JSON_KEY = "metadata" as const;

export function resolveEditionFormatPreference(
  mediaModule: MediaModuleId,
  configured?: EditionFormatPreference | null,
): EditionFormatPreference {
  if (configured) return configured;
  if (mediaModule === "audiobooks") return "audiobook";
  return "print-or-ebook";
}
