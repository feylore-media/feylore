import { z } from "zod";

export const themePreferenceSchema = z.enum(["light", "dark", "system"]);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const activityVisibilitySchema = z.enum([
  "private",
  "friends",
  "public",
]);
export type ActivityVisibilitySetting = z.infer<
  typeof activityVisibilitySchema
>;

export const appearanceSettingsSchema = z.object({
  theme: themePreferenceSchema,
});

export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>;

export const appearanceSettingsUpdateSchema = z.object({
  theme: themePreferenceSchema.optional(),
});

export type AppearanceSettingsUpdate = z.infer<
  typeof appearanceSettingsUpdateSchema
>;

export const privacySettingsSchema = z.object({
  activityVisibility: activityVisibilitySchema,
  profileVisibility: z.enum(["public", "members", "private"]),
});

export type PrivacySettings = z.infer<typeof privacySettingsSchema>;

export const privacySettingsUpdateSchema = z.object({
  activityVisibility: activityVisibilitySchema.optional(),
  profileVisibility: z.enum(["public", "members", "private"]).optional(),
});

export type PrivacySettingsUpdate = z.infer<
  typeof privacySettingsUpdateSchema
>;

export const readerSettingsSchema = z.object({
  progressSyncEnabled: z.boolean(),
});

export type ReaderSettings = z.infer<typeof readerSettingsSchema>;

export const readerSettingsUpdateSchema = z.object({
  progressSyncEnabled: z.boolean().optional(),
});

export type ReaderSettingsUpdate = z.infer<typeof readerSettingsUpdateSchema>;

export const playbackSettingsSchema = z.object({
  progressSyncEnabled: z.boolean(),
});

export type PlaybackSettings = z.infer<typeof playbackSettingsSchema>;

export const playbackSettingsUpdateSchema = z.object({
  progressSyncEnabled: z.boolean().optional(),
});

export type PlaybackSettingsUpdate = z.infer<
  typeof playbackSettingsUpdateSchema
>;
