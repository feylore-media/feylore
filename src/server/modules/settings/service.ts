import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";
import type {
  AppearanceSettings,
  AppearanceSettingsUpdate,
  PrivacySettings,
  PrivacySettingsUpdate,
  ReaderSettings,
  ReaderSettingsUpdate,
  PlaybackSettings,
  PlaybackSettingsUpdate,
} from "../../../shared/settings.js";
import type {
  MetadataSettings,
  MetadataSettingsUpdate,
} from "../../../shared/metadata-edition-preference.js";
import {
  readMetadataSettings,
  writeMetadataSettings,
} from "../metadata/edition-preference.js";

export class SettingsService {
  constructor(private readonly db: Database) {}

  async getReaderSettings(userId: string): Promise<ReaderSettings> {
    const row = await this.db.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });
    return {
      progressSyncEnabled: row?.progressSyncEnabled ?? true,
    };
  }

  async updateReaderSettings(
    userId: string,
    update: ReaderSettingsUpdate,
  ): Promise<ReaderSettings> {
    const existing = await this.db.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });
    if (!existing) {
      await this.db.insert(schema.userPreferences).values({
        userId,
        progressSyncEnabled: update.progressSyncEnabled ?? true,
      });
    } else if (update.progressSyncEnabled !== undefined) {
      await this.db
        .update(schema.userPreferences)
        .set({ progressSyncEnabled: update.progressSyncEnabled })
        .where(eq(schema.userPreferences.userId, userId));
    }
    return this.getReaderSettings(userId);
  }

  async getPlaybackSettings(userId: string): Promise<PlaybackSettings> {
    return this.getReaderSettings(userId);
  }

  async updatePlaybackSettings(
    userId: string,
    update: PlaybackSettingsUpdate,
  ): Promise<PlaybackSettings> {
    return this.updateReaderSettings(userId, update);
  }

  async getAppearanceSettings(userId: string): Promise<AppearanceSettings> {
    const row = await this.db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    const theme = row?.theme ?? "system";
    if (theme === "light" || theme === "dark" || theme === "system") {
      return { theme };
    }
    return { theme: "system" };
  }

  async updateAppearanceSettings(
    userId: string,
    update: AppearanceSettingsUpdate,
  ): Promise<AppearanceSettings> {
    if (update.theme !== undefined) {
      await this.db
        .update(schema.users)
        .set({ theme: update.theme, updatedAt: new Date() })
        .where(eq(schema.users.id, userId));
    }
    return this.getAppearanceSettings(userId);
  }

  async getPrivacySettings(userId: string): Promise<PrivacySettings> {
    const [prefs, user] = await Promise.all([
      this.db.query.userPreferences.findFirst({
        where: eq(schema.userPreferences.userId, userId),
      }),
      this.db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      }),
    ]);
    const v = prefs?.privacyActivity ?? "private";
    const activityVisibility = v === "friends" || v === "public" ? v : "private";
    const visibility = user?.profileVisibility;
    const profileVisibility =
      visibility === "members" || visibility === "private" ? visibility : "public";
    return { activityVisibility, profileVisibility };
  }

  async updatePrivacySettings(
    userId: string,
    update: PrivacySettingsUpdate,
  ): Promise<PrivacySettings> {
    const existing = await this.db.query.userPreferences.findFirst({
      where: eq(schema.userPreferences.userId, userId),
    });
    if (!existing) {
      await this.db.insert(schema.userPreferences).values({
        userId,
        privacyActivity: update.activityVisibility ?? "private",
      });
    } else if (update.activityVisibility !== undefined) {
      await this.db
        .update(schema.userPreferences)
        .set({ privacyActivity: update.activityVisibility })
        .where(eq(schema.userPreferences.userId, userId));
    }
    if (update.profileVisibility !== undefined) {
      await this.db
        .update(schema.users)
        .set({ profileVisibility: update.profileVisibility, updatedAt: new Date() })
        .where(eq(schema.users.id, userId));
    }
    return this.getPrivacySettings(userId);
  }

  async getMetadataSettings(userId: string): Promise<MetadataSettings> {
    return readMetadataSettings(this.db, userId);
  }

  async updateMetadataSettings(
    userId: string,
    update: MetadataSettingsUpdate,
  ): Promise<MetadataSettings> {
    return writeMetadataSettings(this.db, userId, update);
  }
}
