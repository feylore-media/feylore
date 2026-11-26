/**
 * Instance feature modules (Achievements, Challenges) as distinct from the
 * metadata-configuration media modules in `./media-modules.js`.
 *
 * Feature modules gate instance-wide product behavior and can be enabled or
 * disabled from Admin → Library → Modules. Disabling a module stops its
 * processing and hides its surfaces; stored data is retained so re-enabling
 * restores the feature.
 */
export const FEATURE_MODULE_IDS = ["achievements", "challenges"] as const;

export type FeatureModuleId = (typeof FEATURE_MODULE_IDS)[number];

export const DEFAULT_ENABLED_FEATURE_MODULES: FeatureModuleId[] = [
  "achievements",
  "challenges",
];

export interface FeatureModuleDefinition {
  id: FeatureModuleId;
  name: string;
  i18nKey: string;
}

export const FEATURE_MODULES: FeatureModuleDefinition[] = [
  {
    id: "achievements",
    name: "Achievements",
    i18nKey: "modules.achievements",
  },
  {
    id: "challenges",
    name: "Challenges",
    i18nKey: "modules.challenges",
  },
];

export function isFeatureModuleId(value: string): value is FeatureModuleId {
  return (FEATURE_MODULE_IDS as readonly string[]).includes(value);
}
