import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPool, createDb } from "../src/server/db/client.js";
import { SystemSettingsService } from "../src/server/modules/settings/system-service.js";
import { DEFAULT_ENABLED_MODULES } from "../src/shared/media-modules.js";
import { DEFAULT_ENABLED_FEATURE_MODULES } from "../src/shared/feature-modules.js";
import * as schema from "../src/server/db/schema.js";
import { eq } from "drizzle-orm";

const dbAvailable = !!process.env.DATABASE_URL;

describe.skipIf(!dbAvailable)("system module settings", () => {
  const pool = createPool(process.env.DATABASE_URL!);
  const db = createDb(pool);
  const systemSettings = new SystemSettingsService(db);

  beforeAll(async () => {
    await db
      .delete(schema.systemSettings)
      .where(eq(schema.systemSettings.key, "modules.enabled"));
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns default enabled modules when unset", async () => {
    const enabled = await systemSettings.getEnabledModules();
    expect(enabled).toEqual(DEFAULT_ENABLED_MODULES);
  });

  it("treats persisted empty list as defaults", async () => {
    await db.insert(schema.systemSettings).values({
      key: "modules.enabled",
      value: { enabled: [] },
    });
    const enabled = await systemSettings.getEnabledModules();
    expect(enabled).toEqual(DEFAULT_ENABLED_MODULES);
  });

  it("persists module enable/disable", async () => {
    await systemSettings.setEnabledModules(["books", "audiobooks"]);
    const enabled = await systemSettings.getEnabledModules();
    expect(enabled).toEqual(["books", "audiobooks"]);
    expect(enabled).not.toContain("video");
  });

  it("lists modules with enabled state", async () => {
    const list = await systemSettings.listModulesWithState();
    expect(list.find((m) => m.id === "books")?.enabled).toBe(true);
    expect(list.find((m) => m.id === "video")?.enabled).toBe(false);
  });

  it("registers feature modules alongside media modules", async () => {
    const list = await systemSettings.listModulesWithState();
    const achievements = list.find((m) => m.id === "achievements");
    const challenges = list.find((m) => m.id === "challenges");
    expect(achievements?.kind).toBe("feature");
    expect(challenges?.kind).toBe("feature");
    expect(list.filter((m) => m.kind === "media").length).toBeGreaterThan(0);
  });

  it("returns default enabled feature modules when unset", async () => {
    await db
      .delete(schema.systemSettings)
      .where(eq(schema.systemSettings.key, "feature_modules.enabled"));
    const enabled = await systemSettings.getEnabledFeatureModules();
    expect(enabled).toEqual(DEFAULT_ENABLED_FEATURE_MODULES);
  });

  it("persists feature module enable/disable independently of media modules", async () => {
    await systemSettings.setEnabledFeatureModules(["challenges"]);
    expect(await systemSettings.getEnabledFeatureModules()).toEqual([
      "challenges",
    ]);
    // Media module state is untouched by the feature toggle.
    expect(await systemSettings.getEnabledModules()).toEqual([
      "books",
      "audiobooks",
    ]);

    const list = await systemSettings.listModulesWithState();
    expect(list.find((m) => m.id === "achievements")?.enabled).toBe(false);
    expect(list.find((m) => m.id === "challenges")?.enabled).toBe(true);

    await systemSettings.setEnabledFeatureModules([
      "achievements",
      "challenges",
    ]);
    expect(await systemSettings.getEnabledFeatureModules()).toEqual([
      "achievements",
      "challenges",
    ]);
  });
});
