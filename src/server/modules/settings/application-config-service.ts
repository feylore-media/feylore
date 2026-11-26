import path from "node:path";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  DEFAULT_APPLICATION_CONFIG,
  normalizeApplicationConfig,
  type ApplicationAppearance,
  type ApplicationAppearanceUpdate,
  type ApplicationConfig,
  type ApplicationGeneral,
  type ApplicationGeneralUpdate,
  type ApplicationLocale,
  type ApplicationProfiles,
  type ApplicationProfilesUpdate,
  type PublicInstance,
} from "../../../shared/application-config.js";
import { ValidationError } from "../../../shared/errors.js";
import type { FileService } from "../files/service.js";
import { generateId } from "../../security/crypto.js";

const APPLICATION_KEY = "application";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const FAVICON_MAX_BYTES = 512 * 1024;

const LOGO_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const FAVICON_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]);

function detectImageMediaType(
  data: Buffer,
  allowed: ReadonlySet<string>,
): string | null {
  if (data.length < 4) return null;

  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return allowed.has("image/jpeg") ? "image/jpeg" : null;
  }
  if (
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return allowed.has("image/png") ? "image/png" : null;
  }
  if (
    data.length >= 12 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  ) {
    return allowed.has("image/webp") ? "image/webp" : null;
  }

  const start = data
    .subarray(0, Math.min(256, data.length))
    .toString("utf8")
    .trimStart();
  if (
    (start.startsWith("<svg") || start.startsWith("<?xml")) &&
    allowed.has("image/svg+xml")
  ) {
    return "image/svg+xml";
  }

  return null;
}

function extensionForMediaType(mediaType: string): string {
  switch (mediaType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    default:
      return ".bin";
  }
}

export class ApplicationConfigService {
  constructor(
    private readonly db: Database,
    private readonly files: FileService,
  ) {}

  async getConfig(): Promise<ApplicationConfig> {
    const row = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, APPLICATION_KEY),
    });
    if (!row?.value) return { ...DEFAULT_APPLICATION_CONFIG };
    return normalizeApplicationConfig(row.value);
  }

  async getDefaultLocale(): Promise<ApplicationLocale> {
    const config = await this.getConfig();
    return config.general.defaultLocale;
  }

  async getPublicConfig(): Promise<PublicInstance> {
    const config = await this.getConfig();
    return {
      displayName: config.general.displayName,
      defaultLocale: config.general.defaultLocale,
      defaultTheme: config.general.defaultTheme,
      logoUrl: config.appearance.logoFileId
        ? "/api/v1/instance/logo"
        : null,
      faviconUrl: config.appearance.faviconFileId
        ? "/api/v1/instance/favicon"
        : null,
      profiles: this.getProfiles(config),
    };
  }

  getGeneral(config: ApplicationConfig): ApplicationGeneral {
    return config.general;
  }

  getAppearance(config: ApplicationConfig): ApplicationAppearance & {
    logoUrl: string | null;
    faviconUrl: string | null;
  } {
    return {
      ...config.appearance,
      logoUrl: config.appearance.logoFileId ? "/api/v1/instance/logo" : null,
      faviconUrl: config.appearance.faviconFileId
        ? "/api/v1/instance/favicon"
        : null,
    };
  }

  getProfiles(config: ApplicationConfig): ApplicationProfiles {
    return config.profiles;
  }

  async updateGeneral(
    patch: ApplicationGeneralUpdate,
  ): Promise<ApplicationGeneral> {
    const current = await this.getConfig();
    const next: ApplicationConfig = {
      ...current,
      general: { ...current.general, ...patch },
    };
    await this.saveConfig(next);
    return next.general;
  }

  async updateAppearance(
    patch: ApplicationAppearanceUpdate,
  ): Promise<ApplicationAppearance & {
    logoUrl: string | null;
    faviconUrl: string | null;
  }> {
    const current = await this.getConfig();
    const next: ApplicationConfig = {
      ...current,
      appearance: { ...current.appearance, ...patch },
    };
    await this.saveConfig(next);
    return this.getAppearance(next);
  }

  async updateProfiles(
    patch: ApplicationProfilesUpdate,
  ): Promise<ApplicationProfiles> {
    const current = await this.getConfig();
    const next: ApplicationConfig = {
      ...current,
      profiles: { ...current.profiles, ...patch },
    };
    await this.saveConfig(next);
    return next.profiles;
  }

  async uploadLogo(data: Buffer, declaredType: string): Promise<
    ApplicationAppearance & {
      logoUrl: string | null;
      faviconUrl: string | null;
    }
  > {
    const fileId = await this.storeBrandingFile(
      data,
      declaredType,
      LOGO_MEDIA_TYPES,
      LOGO_MAX_BYTES,
      "logo",
      "Logo must be a JPEG, PNG, or WebP image",
    );
    return this.updateAppearance({ logoFileId: fileId });
  }

  async uploadFavicon(
    data: Buffer,
    declaredType: string,
  ): Promise<
    ApplicationAppearance & {
      logoUrl: string | null;
      faviconUrl: string | null;
    }
  > {
    const fileId = await this.storeBrandingFile(
      data,
      declaredType,
      FAVICON_MEDIA_TYPES,
      FAVICON_MAX_BYTES,
      "favicon",
      "Favicon must be a JPEG, PNG, WebP, or SVG image",
    );
    return this.updateAppearance({ faviconFileId: fileId });
  }

  async clearLogo(): Promise<
    ApplicationAppearance & {
      logoUrl: string | null;
      faviconUrl: string | null;
    }
  > {
    return this.updateAppearance({ logoFileId: null });
  }

  async clearFavicon(): Promise<
    ApplicationAppearance & {
      logoUrl: string | null;
      faviconUrl: string | null;
    }
  > {
    return this.updateAppearance({ faviconFileId: null });
  }

  async getBrandingFileId(
    kind: "logo" | "favicon",
  ): Promise<string | null> {
    const config = await this.getConfig();
    return kind === "logo"
      ? config.appearance.logoFileId
      : config.appearance.faviconFileId;
  }

  private async saveConfig(config: ApplicationConfig): Promise<void> {
    const existing = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, APPLICATION_KEY),
    });
    if (existing) {
      await this.db
        .update(schema.systemSettings)
        .set({ value: config, updatedAt: new Date() })
        .where(eq(schema.systemSettings.key, APPLICATION_KEY));
    } else {
      await this.db.insert(schema.systemSettings).values({
        key: APPLICATION_KEY,
        value: config,
      });
    }
  }

  private async storeBrandingFile(
    data: Buffer,
    declaredType: string,
    allowedTypes: ReadonlySet<string>,
    maxBytes: number,
    kind: "logo" | "favicon",
    invalidMessage: string,
  ): Promise<string> {
    if (!allowedTypes.has(declaredType)) {
      throw new ValidationError(invalidMessage);
    }
    if (data.length > maxBytes) {
      throw new ValidationError(
        `${kind === "logo" ? "Logo" : "Favicon"} exceeds size limit`,
      );
    }

    const mediaType = detectImageMediaType(data, allowedTypes);
    if (!mediaType || mediaType !== declaredType) {
      throw new ValidationError(invalidMessage);
    }

    const storageLocationId = await this.files.getManagedStorageLocationId();
    if (!storageLocationId) {
      throw new ValidationError("Managed storage is not configured");
    }

    const ext = extensionForMediaType(mediaType);
    const relativePath = path.posix.join(
      "branding",
      kind,
      `${generateId()}${ext}`,
    );

    return this.files.storeDerivedFile({
      storageLocationId,
      relativePath,
      data,
      mediaType,
    });
  }
}
