import { z } from "zod";
import { themePreferenceSchema } from "./settings.js";

export const applicationLocaleSchema = z.enum(["en", "en-GB", "fr", "de"]);
export type ApplicationLocale = z.infer<typeof applicationLocaleSchema>;

export const applicationGeneralSchema = z.object({
  displayName: z.string().min(1).max(100),
  defaultLocale: applicationLocaleSchema,
  defaultTheme: themePreferenceSchema,
});

export type ApplicationGeneral = z.infer<typeof applicationGeneralSchema>;

export const applicationAppearanceSchema = z.object({
  logoFileId: z.string().uuid().nullable(),
  faviconFileId: z.string().uuid().nullable(),
});

export type ApplicationAppearance = z.infer<typeof applicationAppearanceSchema>;

/**
 * Profile presentation policy. `customCssEnabled` gates the experimental
 * custom-CSS editor; stored CSS keeps applying so disabling never destroys a
 * user's existing customization.
 */
export const applicationProfilesSchema = z.object({
  customCssEnabled: z.boolean(),
});

export type ApplicationProfiles = z.infer<typeof applicationProfilesSchema>;

export const applicationConfigSchema = z.object({
  general: applicationGeneralSchema,
  appearance: applicationAppearanceSchema,
  profiles: applicationProfilesSchema,
});

export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;

export const DEFAULT_APPLICATION_GENERAL: ApplicationGeneral = {
  displayName: "Feylore",
  defaultLocale: "en",
  defaultTheme: "dark",
};

export const DEFAULT_APPLICATION_APPEARANCE: ApplicationAppearance = {
  logoFileId: null,
  faviconFileId: null,
};

export const DEFAULT_APPLICATION_PROFILES: ApplicationProfiles = {
  customCssEnabled: false,
};

export const DEFAULT_APPLICATION_CONFIG: ApplicationConfig = {
  general: DEFAULT_APPLICATION_GENERAL,
  appearance: DEFAULT_APPLICATION_APPEARANCE,
  profiles: DEFAULT_APPLICATION_PROFILES,
};

export const applicationGeneralUpdateSchema = applicationGeneralSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export type ApplicationGeneralUpdate = z.infer<
  typeof applicationGeneralUpdateSchema
>;

export const applicationAppearanceUpdateSchema = applicationAppearanceSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export type ApplicationAppearanceUpdate = z.infer<
  typeof applicationAppearanceUpdateSchema
>;

export const applicationProfilesUpdateSchema = applicationProfilesSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export type ApplicationProfilesUpdate = z.infer<
  typeof applicationProfilesUpdateSchema
>;

export const publicInstanceSchema = z.object({
  displayName: z.string(),
  defaultLocale: applicationLocaleSchema,
  defaultTheme: themePreferenceSchema,
  logoUrl: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  profiles: z.object({
    customCssEnabled: z.boolean(),
  }),
});

export type PublicInstance = z.infer<typeof publicInstanceSchema>;

export const DEFAULT_PUBLIC_INSTANCE: PublicInstance = {
  displayName: DEFAULT_APPLICATION_GENERAL.displayName,
  defaultLocale: DEFAULT_APPLICATION_GENERAL.defaultLocale,
  defaultTheme: DEFAULT_APPLICATION_GENERAL.defaultTheme,
  logoUrl: null,
  faviconUrl: null,
  profiles: { customCssEnabled: DEFAULT_APPLICATION_PROFILES.customCssEnabled },
};

export function normalizeApplicationConfig(
  raw: unknown,
): ApplicationConfig {
  const parsed = applicationConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const record = raw as Record<string, unknown> | null | undefined;
  const general = applicationGeneralSchema.safeParse(record?.general);
  const appearance = applicationAppearanceSchema.safeParse(record?.appearance);
  const profiles = applicationProfilesSchema.safeParse(record?.profiles);

  return {
    general: general.success ? general.data : DEFAULT_APPLICATION_GENERAL,
    appearance: appearance.success
      ? appearance.data
      : DEFAULT_APPLICATION_APPEARANCE,
    profiles: profiles.success ? profiles.data : DEFAULT_APPLICATION_PROFILES,
  };
}
