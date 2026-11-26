import { z } from "zod";
import {
  isMediaModuleId,
  MEDIA_MODULE_IDS,
  type MediaModuleId,
} from "./media-modules.js";
import {
  CANONICAL_FIELD_IDS,
  CUSTOM_FIELD_TYPES,
  type CustomFieldType,
} from "./metadata-fields.js";

/** Media scope for custom metadata field definitions. */
export const CUSTOM_FIELD_GLOBAL_MODULE = "global" as const;

export type CustomFieldMediaModule =
  | typeof CUSTOM_FIELD_GLOBAL_MODULE
  | MediaModuleId;

export const CUSTOM_FIELD_ENTITY_TYPES = ["item", "series", "file"] as const;

export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

export function isCustomFieldEntityType(
  value: string,
): value is CustomFieldEntityType {
  return (CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(value);
}

/** Entity types available per media module. */
const ENTITY_TYPES_BY_MODULE: Record<
  CustomFieldMediaModule,
  readonly CustomFieldEntityType[]
> = {
  global: ["item"],
  books: ["item", "series", "file"],
  comics: ["item", "series", "file"],
  audiobooks: ["item", "series"],
  music: ["item"],
  video: ["item"],
  people: ["item"],
};

export function isCustomFieldMediaModule(
  value: string,
): value is CustomFieldMediaModule {
  return value === CUSTOM_FIELD_GLOBAL_MODULE || isMediaModuleId(value);
}

export function getCustomFieldEntityTypes(
  mediaModule: CustomFieldMediaModule,
): readonly CustomFieldEntityType[] {
  return ENTITY_TYPES_BY_MODULE[mediaModule];
}

export function isEntityTypeValidForModule(
  mediaModule: CustomFieldMediaModule,
  entityType: string,
): entityType is CustomFieldEntityType {
  return getCustomFieldEntityTypes(mediaModule).includes(
    entityType as CustomFieldEntityType,
  );
}

export const CUSTOM_FIELD_KEY_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

export const customFieldKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(CUSTOM_FIELD_KEY_REGEX)
  .refine(
    (key) =>
      !(CANONICAL_FIELD_IDS as readonly string[]).includes(key),
    { message: "Key conflicts with a canonical metadata field" },
  );

export const customFieldOptionSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string().min(1).max(128),
  sortOrder: z.number().int().min(0).default(0),
});

export type CustomFieldOption = z.infer<typeof customFieldOptionSchema>;

export const customFieldMediaModuleSchema = z.union([
  z.literal(CUSTOM_FIELD_GLOBAL_MODULE),
  z.enum(MEDIA_MODULE_IDS),
]);

export const createCustomFieldSchema = z
  .object({
    mediaModule: customFieldMediaModuleSchema,
    entityType: z.enum(CUSTOM_FIELD_ENTITY_TYPES),
    key: customFieldKeySchema,
    displayName: z.string().min(1).max(128),
    type: z.enum(CUSTOM_FIELD_TYPES),
    description: z.string().max(512).optional(),
    sortOrder: z.number().int().min(0).optional(),
    options: z.array(customFieldOptionSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (!isEntityTypeValidForModule(data.mediaModule, data.entityType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Entity type is not valid for this media module",
        path: ["entityType"],
      });
    }
    const needsOptions =
      data.type === "select" || data.type === "multi_select";
    if (needsOptions && (!data.options || data.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Options are required for select and multi_select fields",
        path: ["options"],
      });
    }
    if (!needsOptions && data.options && data.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Options are only allowed for select and multi_select fields",
        path: ["options"],
      });
    }
    if (data.options) {
      const keys = new Set<string>();
      for (const opt of data.options) {
        if (keys.has(opt.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate option key: ${opt.key}`,
            path: ["options"],
          });
        }
        keys.add(opt.key);
      }
    }
  });

export const updateCustomFieldSchema = z
  .object({
    displayName: z.string().min(1).max(128).optional(),
    description: z.string().max(512).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    options: z.array(customFieldOptionSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.options) {
      const keys = new Set<string>();
      for (const opt of data.options) {
        if (keys.has(opt.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate option key: ${opt.key}`,
            path: ["options"],
          });
        }
        keys.add(opt.key);
      }
    }
  });

export const reorderCustomFieldsSchema = z.object({
  mediaModule: customFieldMediaModuleSchema,
  entityType: z.enum(CUSTOM_FIELD_ENTITY_TYPES),
  orderedIds: z.array(z.string().uuid()),
});

export const setCustomFieldValuesSchema = z.object({
  values: z.record(z.string(), z.unknown()),
});

export interface CustomFieldDefinitionDto {
  id: string;
  mediaModule: CustomFieldMediaModule;
  entityType: CustomFieldEntityType;
  key: string;
  displayName: string;
  type: CustomFieldType;
  description: string | null;
  sortOrder: number;
  options: CustomFieldOption[];
}

export interface CustomFieldValueDto {
  key: string;
  displayName: string;
  type: CustomFieldType;
  value: unknown;
  displayValue: string | null;
}

export function validateCustomFieldValue(
  type: CustomFieldType,
  value: unknown,
  options: CustomFieldOption[],
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: false, error: "Value is required" };
  }

  const optionKeys = new Set(options.map((o) => o.key));

  switch (type) {
    case "text":
      if (typeof value !== "string") {
        return { ok: false, error: "Expected a string" };
      }
      return { ok: true, value };

    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        return { ok: false, error: "Expected a number" };
      }
      return { ok: true, value };

    case "boolean":
      if (typeof value !== "boolean") {
        return { ok: false, error: "Expected a boolean" };
      }
      return { ok: true, value };

    case "date":
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        return { ok: false, error: "Expected an ISO date string" };
      }
      return { ok: true, value };

    case "select":
      if (typeof value !== "string" || !optionKeys.has(value)) {
        return { ok: false, error: "Expected a valid option key" };
      }
      return { ok: true, value };

    case "multi_select":
      if (!Array.isArray(value)) {
        return { ok: false, error: "Expected an array of option keys" };
      }
      for (const item of value) {
        if (typeof item !== "string" || !optionKeys.has(item)) {
          return { ok: false, error: "Expected valid option keys" };
        }
      }
      return { ok: true, value };

    default:
      return { ok: false, error: "Unknown field type" };
  }
}

export function formatCustomFieldDisplayValue(
  type: CustomFieldType,
  value: unknown,
  options: CustomFieldOption[],
): string | null {
  if (value === null || value === undefined) return null;

  const labelFor = (key: string) =>
    options.find((o) => o.key === key)?.label ?? key;

  switch (type) {
    case "text":
    case "date":
      return typeof value === "string" ? value : null;
    case "number":
      return typeof value === "number" ? String(value) : null;
    case "boolean":
      return typeof value === "boolean" ? (value ? "Yes" : "No") : null;
    case "select":
      return typeof value === "string" ? labelFor(value) : null;
    case "multi_select":
      return Array.isArray(value)
        ? value.map((v) => (typeof v === "string" ? labelFor(v) : String(v))).join(", ")
        : null;
    default:
      return null;
  }
}

export function validateEntityValues(
  mediaModule: CustomFieldMediaModule,
  entityType: CustomFieldEntityType,
  partialValues: Record<string, unknown>,
  definitions: CustomFieldDefinitionDto[],
): { ok: true; validated: Record<string, unknown | null> } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const validated: Record<string, unknown | null> = {};

  for (const [key, value] of Object.entries(partialValues)) {
    const def = definitions.find(
      (d) =>
        d.key === key &&
        d.mediaModule === mediaModule &&
        d.entityType === entityType,
    );
    if (!def) {
      errors[key] = "Unknown custom field for this scope";
      continue;
    }
    if (value === null) {
      validated[key] = null;
      continue;
    }
    const result = validateCustomFieldValue(def.type, value, def.options);
    if (!result.ok) {
      errors[key] = result.error;
    } else {
      validated[key] = result.value;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, validated };
}

/** Returns true if a key is reserved for canonical metadata (not custom fields). */
export function isCanonicalMetadataKey(key: string): boolean {
  return (CANONICAL_FIELD_IDS as readonly string[]).includes(key);
}
