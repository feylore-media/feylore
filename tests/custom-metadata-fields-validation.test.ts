import { describe, it, expect } from "vitest";
import {
  validateCustomFieldValue,
  validateEntityValues,
  customFieldKeySchema,
  createCustomFieldSchema,
  type CustomFieldDefinitionDto,
} from "../src/shared/custom-metadata-fields.js";

describe("custom metadata field validation", () => {
  const selectDef: CustomFieldDefinitionDto = {
    id: "00000000-0000-4000-8000-000000000001",
    mediaModule: "books",
    entityType: "item",
    key: "reading_status",
    displayName: "Reading Status",
    type: "select",
    description: null,
    sortOrder: 0,
    options: [
      { key: "unread", label: "Unread", sortOrder: 0 },
      { key: "finished", label: "Finished", sortOrder: 1 },
    ],
  };

  it("accepts valid keys", () => {
    expect(customFieldKeySchema.safeParse("reading_status").success).toBe(true);
    expect(customFieldKeySchema.safeParse("a").success).toBe(true);
  });

  it("rejects invalid keys", () => {
    expect(customFieldKeySchema.safeParse("Reading_Status").success).toBe(false);
    expect(customFieldKeySchema.safeParse("custom.foo").success).toBe(false);
    expect(customFieldKeySchema.safeParse("title").success).toBe(false);
  });

  it("validates text values", () => {
    expect(validateCustomFieldValue("text", "hello", []).ok).toBe(true);
    expect(validateCustomFieldValue("text", 1, []).ok).toBe(false);
  });

  it("validates number values", () => {
    expect(validateCustomFieldValue("number", 42, []).ok).toBe(true);
    expect(validateCustomFieldValue("number", "42", []).ok).toBe(false);
  });

  it("validates boolean values", () => {
    expect(validateCustomFieldValue("boolean", true, []).ok).toBe(true);
    expect(validateCustomFieldValue("boolean", "true", []).ok).toBe(false);
  });

  it("validates date values", () => {
    expect(validateCustomFieldValue("date", "2024-01-15", []).ok).toBe(true);
    expect(validateCustomFieldValue("date", "not-a-date", []).ok).toBe(false);
  });

  it("validates select values using option keys", () => {
    const opts = selectDef.options;
    expect(validateCustomFieldValue("select", "finished", opts).ok).toBe(true);
    expect(validateCustomFieldValue("select", "Finished", opts).ok).toBe(false);
  });

  it("validates multi_select values", () => {
    const opts = selectDef.options;
    expect(
      validateCustomFieldValue("multi_select", ["unread", "finished"], opts).ok,
    ).toBe(true);
    expect(
      validateCustomFieldValue("multi_select", ["Unread"], opts).ok,
    ).toBe(false);
  });

  it("validateEntityValues supports partial sets", () => {
    const result = validateEntityValues(
      "books",
      "item",
      { reading_status: "finished" },
      [selectDef],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.validated.reading_status).toBe("finished");
    }
  });

  it("validateEntityValues allows null to clear", () => {
    const result = validateEntityValues(
      "books",
      "item",
      { reading_status: null },
      [selectDef],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.validated.reading_status).toBeNull();
    }
  });

  it("rejects unknown keys in partial set", () => {
    const result = validateEntityValues(
      "books",
      "item",
      { unknown_field: "x" },
      [selectDef],
    );
    expect(result.ok).toBe(false);
  });

  it("createCustomFieldSchema requires options for select", () => {
    const bad = createCustomFieldSchema.safeParse({
      mediaModule: "books",
      entityType: "item",
      key: "status",
      displayName: "Status",
      type: "select",
    });
    expect(bad.success).toBe(false);

    const good = createCustomFieldSchema.safeParse({
      mediaModule: "books",
      entityType: "item",
      key: "status",
      displayName: "Status",
      type: "select",
      options: [{ key: "a", label: "A", sortOrder: 0 }],
    });
    expect(good.success).toBe(true);
  });
});
