import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createPool, createDb } from "../src/server/db/client.js";
import { MetadataProviderRegistry } from "../src/server/modules/metadata/registry.js";
import { CustomFieldService } from "../src/server/modules/metadata/custom-fields.js";
import { bootstrapMetadataProviders } from "../src/server/modules/metadata/bootstrap.js";
import * as schema from "../src/server/db/schema.js";
import { generateId } from "../src/server/security/crypto.js";

const dbAvailable = !!process.env.DATABASE_URL;

describe.skipIf(!dbAvailable)("metadata custom fields", () => {
  const pool = createPool(process.env.DATABASE_URL!);
  const db = createDb(pool);
  const customFields = new CustomFieldService(db);
  const registry = new MetadataProviderRegistry();
  bootstrapMetadataProviders(registry);

  const userId = generateId();

  beforeAll(async () => {
    await db.delete(schema.customFieldValues);
    await db.delete(schema.metadataCustomFieldOptions);
    await db.delete(schema.metadataCustomFields);
    await db.insert(schema.users).values({
      id: userId,
      email: `cf_test_${userId.slice(0, 8)}@example.com`,
      username: `cf_test_${userId.slice(0, 8)}`,
      displayName: "CF Test",
      passwordHash: "x",
    });
  });

  afterAll(async () => {
    await db.delete(schema.customFieldValues);
    await db.delete(schema.metadataCustomFieldOptions);
    await db.delete(schema.metadataCustomFields);
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await pool.end();
  });

  it("creates and lists custom fields scoped to media module and entity type", async () => {
    const id = await customFields.create({
      mediaModule: "books",
      entityType: "item",
      key: "award_year",
      displayName: "Award year",
      type: "number",
    });
    const books = await customFields.listByScope("books", "item");
    expect(books.some((f) => f.id === id)).toBe(true);
    const video = await customFields.listByScope("video", "item");
    expect(video.some((f) => f.id === id)).toBe(false);
  });

  it("allows same key across different media modules", async () => {
    await customFields.create({
      mediaModule: "books",
      entityType: "item",
      key: "rating",
      displayName: "Book rating",
      type: "number",
    });
    const videoId = await customFields.create({
      mediaModule: "video",
      entityType: "item",
      key: "rating",
      displayName: "Video rating",
      type: "number",
    });
    expect(videoId).toBeTruthy();
  });

  it("allows same key across different entity types", async () => {
    await customFields.create({
      mediaModule: "books",
      entityType: "series",
      key: "rating",
      displayName: "Series rating",
      type: "number",
    });
    const itemFields = await customFields.listByScope("books", "item");
    const seriesFields = await customFields.listByScope("books", "series");
    expect(itemFields.some((f) => f.key === "rating")).toBe(true);
    expect(seriesFields.some((f) => f.key === "rating")).toBe(true);
  });

  it("rejects duplicate key within same scope", async () => {
    await expect(
      customFields.create({
        mediaModule: "books",
        entityType: "item",
        key: "award_year",
        displayName: "Duplicate",
        type: "text",
      }),
    ).rejects.toThrow();
  });

  it("supports global fields", async () => {
    const id = await customFields.create({
      mediaModule: "global",
      entityType: "item",
      key: "library_note",
      displayName: "Library note",
      type: "text",
    });
    const globalFields = await customFields.listByScope("global", "item");
    expect(globalFields.some((f) => f.id === id)).toBe(true);
  });

  it("persists and retrieves values with partial patch", async () => {
    const fieldId = await customFields.create({
      mediaModule: "books",
      entityType: "item",
      key: "reading_status",
      displayName: "Reading Status",
      type: "select",
      options: [
        { key: "unread", label: "Unread", sortOrder: 0 },
        { key: "finished", label: "Finished", sortOrder: 1 },
      ],
    });
    expect(fieldId).toBeTruthy();

    const subjectId = "abc123";
    await customFields.patchValues(
      "books",
      "item",
      subjectId,
      { reading_status: "finished" },
      userId,
    );

    const values = await customFields.getValuesForSubject(
      "books",
      "item",
      subjectId,
    );
    expect(values).toHaveLength(1);
    expect(values[0]?.value).toBe("finished");
    expect(values[0]?.displayValue).toBe("Finished");

    await customFields.patchValues(
      "books",
      "item",
      subjectId,
      { reading_status: null },
      userId,
    );
    const cleared = await customFields.getValuesForSubject(
      "books",
      "item",
      subjectId,
    );
    expect(cleared).toHaveLength(0);
  });

  it("rejects values for unknown keys in scope", async () => {
    await expect(
      customFields.patchValues(
        "books",
        "item",
        "xyz789",
        { nonexistent_key: "x" },
        userId,
      ),
    ).rejects.toThrow();
  });

  it("rejects values outside declared scope", async () => {
    await expect(
      customFields.patchValues(
        "video",
        "item",
        "xyz789",
        { reading_status: "finished" },
        userId,
      ),
    ).rejects.toThrow();
  });

  it("deletes custom fields and cascades values", async () => {
    const id = await customFields.create({
      mediaModule: "books",
      entityType: "item",
      key: "temp_field",
      displayName: "Temp",
      type: "boolean",
    });
    await customFields.patchValues(
      "books",
      "item",
      "book99",
      { temp_field: true },
      userId,
    );
    await customFields.delete(id);
    const rows = await customFields.listByScope("books", "item");
    expect(rows.some((f) => f.id === id)).toBe(false);
    const values = await customFields.getValuesForSubject(
      "books",
      "item",
      "book99",
    );
    expect(values).toHaveLength(0);
  });

  it("reorders fields within scope", async () => {
    const a = await customFields.create({
      mediaModule: "comics",
      entityType: "item",
      key: "field_a",
      displayName: "A",
      type: "text",
    });
    const b = await customFields.create({
      mediaModule: "comics",
      entityType: "item",
      key: "field_b",
      displayName: "B",
      type: "text",
    });
    await customFields.reorder("comics", "item", [b, a]);
    const fields = await customFields.listByScope("comics", "item");
    const ordered = fields.filter((f) => f.id === a || f.id === b);
    expect(ordered[0]?.id).toBe(b);
    expect(ordered[1]?.id).toBe(a);
  });

  it("does not modify provider descriptors when custom field is created", async () => {
    const olBefore = registry.getDescriptor("open-library")?.fields ?? [];
    await customFields.create({
      mediaModule: "books",
      entityType: "item",
      key: "reading_level",
      displayName: "Reading level",
      type: "text",
    });
    const olAfter = registry.getDescriptor("open-library")?.fields ?? [];
    expect(olAfter).toEqual(olBefore);
    expect(olAfter).not.toContain("reading_level");
  });

  it("stores values separately from canonical field overrides", async () => {
    const id = await customFields.create({
      mediaModule: "books",
      entityType: "item",
      key: "user_tag",
      displayName: "User tag",
      type: "text",
    });
    expect(id).toBeTruthy();
    const subjectId = "book01";
    await customFields.patchValues(
      "books",
      "item",
      subjectId,
      { user_tag: "favorite" },
      userId,
    );
    const values = await customFields.getValuesForSubject(
      "books",
      "item",
      subjectId,
    );
    expect(values[0]?.key).toBe("user_tag");
    const overrides = await db
      .select()
      .from(schema.fieldOverrides)
      .where(eq(schema.fieldOverrides.subjectId, subjectId));
    expect(overrides.some((o) => o.field === "user_tag")).toBe(false);
  });
});
