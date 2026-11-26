import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import {
  DEFAULT_ENABLED_MODULES,
  MEDIA_MODULES,
  type MediaModuleId,
  isMediaModuleId,
} from "../../../shared/media-modules.js";
import {
  DEFAULT_ENABLED_FEATURE_MODULES,
  FEATURE_MODULES,
  type FeatureModuleId,
  isFeatureModuleId,
} from "../../../shared/feature-modules.js";

const MODULES_ENABLED_KEY = "modules.enabled";
const FEATURE_MODULES_ENABLED_KEY = "feature_modules.enabled";

export type RegisteredModuleKind = "media" | "feature";

export interface RegisteredModuleState {
  id: MediaModuleId | FeatureModuleId;
  name: string;
  enabled: boolean;
  kind: RegisteredModuleKind;
}

export class SystemSettingsService {
  constructor(private readonly db: Database) {}

  async getEnabledModules(): Promise<MediaModuleId[]> {
    const row = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, MODULES_ENABLED_KEY),
    });
    if (!row?.value) return [...DEFAULT_ENABLED_MODULES];
    const enabled = (row.value as { enabled?: unknown }).enabled;
    if (!Array.isArray(enabled)) return [...DEFAULT_ENABLED_MODULES];
    const filtered = enabled.filter((m): m is MediaModuleId =>
      isMediaModuleId(m),
    );
    // Empty persisted list is treated as unset — use defaults.
    if (filtered.length === 0) return [...DEFAULT_ENABLED_MODULES];
    return filtered;
  }

  async setEnabledModules(modules: MediaModuleId[]): Promise<MediaModuleId[]> {
    const valid = modules.filter(isMediaModuleId);
    const existing = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, MODULES_ENABLED_KEY),
    });
    if (existing) {
      await this.db
        .update(schema.systemSettings)
        .set({ value: { enabled: valid }, updatedAt: new Date() })
        .where(eq(schema.systemSettings.key, MODULES_ENABLED_KEY));
    } else {
      await this.db.insert(schema.systemSettings).values({
        key: MODULES_ENABLED_KEY,
        value: { enabled: valid },
      });
    }
    return valid;
  }

  async listModulesWithState(): Promise<RegisteredModuleState[]> {
    const [mediaEnabled, featureEnabled] = await Promise.all([
      this.getEnabledModules(),
      this.getEnabledFeatureModules(),
    ]);
    const media = new Set(mediaEnabled);
    const features = new Set(featureEnabled);
    return [
      ...MEDIA_MODULES.map((m) => ({
        id: m.id,
        name: m.name,
        enabled: media.has(m.id),
        kind: "media" as const,
      })),
      ...FEATURE_MODULES.map((m) => ({
        id: m.id,
        name: m.name,
        enabled: features.has(m.id),
        kind: "feature" as const,
      })),
    ];
  }

  /**
   * Instance feature modules (Achievements, Challenges). Stored separately
   * from media/metadata modules so their toggle never leaks into provider
   * configuration. Defaults to all enabled; an empty persisted list is
   * treated as unset — same convention as media modules.
   */
  async getEnabledFeatureModules(): Promise<FeatureModuleId[]> {
    const row = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, FEATURE_MODULES_ENABLED_KEY),
    });
    if (!row?.value) return [...DEFAULT_ENABLED_FEATURE_MODULES];
    const enabled = (row.value as { enabled?: unknown }).enabled;
    if (!Array.isArray(enabled)) return [...DEFAULT_ENABLED_FEATURE_MODULES];
    const filtered = enabled.filter((m): m is FeatureModuleId =>
      isFeatureModuleId(m),
    );
    if (filtered.length === 0) return [...DEFAULT_ENABLED_FEATURE_MODULES];
    return filtered;
  }

  async setEnabledFeatureModules(
    modules: FeatureModuleId[],
  ): Promise<FeatureModuleId[]> {
    const valid = modules.filter(isFeatureModuleId);
    const existing = await this.db.query.systemSettings.findFirst({
      where: eq(schema.systemSettings.key, FEATURE_MODULES_ENABLED_KEY),
    });
    if (existing) {
      await this.db
        .update(schema.systemSettings)
        .set({ value: { enabled: valid }, updatedAt: new Date() })
        .where(eq(schema.systemSettings.key, FEATURE_MODULES_ENABLED_KEY));
    } else {
      await this.db.insert(schema.systemSettings).values({
        key: FEATURE_MODULES_ENABLED_KEY,
        value: { enabled: valid },
      });
    }
    return valid;
  }
}
