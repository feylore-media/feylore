import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { generateId } from "../../security/crypto.js";
import type {
  CustomFieldDefinitionDto,
  CustomFieldEntityType,
  CustomFieldMediaModule,
  CustomFieldOption,
  CustomFieldValueDto,
} from "../../../shared/custom-metadata-fields.js";
import {
  formatCustomFieldDisplayValue,
  isEntityTypeValidForModule,
  validateEntityValues,
} from "../../../shared/custom-metadata-fields.js";
import type { CustomFieldType } from "../../../shared/metadata-fields.js";
import { ValidationError, NotFoundError } from "../../../shared/errors.js";

type FieldRow = typeof schema.metadataCustomFields.$inferSelect;
type OptionRow = typeof schema.metadataCustomFieldOptions.$inferSelect;

export class CustomFieldService {
  constructor(private readonly db: Database) {}

  private mapDefinition(
    field: FieldRow,
    options: OptionRow[],
  ): CustomFieldDefinitionDto {
    return {
      id: field.id,
      mediaModule: field.mediaModule as CustomFieldMediaModule,
      entityType: field.entityType as CustomFieldEntityType,
      key: field.fieldKey,
      displayName: field.displayName,
      type: field.fieldType as CustomFieldType,
      description: field.description,
      sortOrder: field.sortOrder,
      options: options
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((o) => ({
          key: o.optionKey,
          label: o.label,
          sortOrder: o.sortOrder,
        })),
    };
  }

  private async loadOptionsForFields(
    fieldIds: string[],
  ): Promise<Map<string, OptionRow[]>> {
    if (fieldIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(schema.metadataCustomFieldOptions)
      .where(inArray(schema.metadataCustomFieldOptions.fieldId, fieldIds));
    const map = new Map<string, OptionRow[]>();
    for (const row of rows) {
      const list = map.get(row.fieldId) ?? [];
      list.push(row);
      map.set(row.fieldId, list);
    }
    return map;
  }

  async listByScope(
    mediaModule: CustomFieldMediaModule,
    entityType: CustomFieldEntityType,
  ): Promise<CustomFieldDefinitionDto[]> {
    const fields = await this.db
      .select()
      .from(schema.metadataCustomFields)
      .where(
        and(
          eq(schema.metadataCustomFields.mediaModule, mediaModule),
          eq(schema.metadataCustomFields.entityType, entityType),
        ),
      )
      .orderBy(asc(schema.metadataCustomFields.sortOrder));

    const optionsMap = await this.loadOptionsForFields(fields.map((f) => f.id));
    return fields.map((f) =>
      this.mapDefinition(f, optionsMap.get(f.id) ?? []),
    );
  }

  async getById(id: string): Promise<CustomFieldDefinitionDto | null> {
    const field = await this.db.query.metadataCustomFields.findFirst({
      where: eq(schema.metadataCustomFields.id, id),
    });
    if (!field) return null;
    const optionsMap = await this.loadOptionsForFields([field.id]);
    return this.mapDefinition(field, optionsMap.get(field.id) ?? []);
  }

  async create(input: {
    mediaModule: CustomFieldMediaModule;
    entityType: CustomFieldEntityType;
    key: string;
    displayName: string;
    type: CustomFieldType;
    description?: string;
    sortOrder?: number;
    options?: CustomFieldOption[];
  }): Promise<string> {
    if (!isEntityTypeValidForModule(input.mediaModule, input.entityType)) {
      throw new ValidationError("Entity type is not valid for this media module");
    }

    const existing = await this.db.query.metadataCustomFields.findFirst({
      where: and(
        eq(schema.metadataCustomFields.mediaModule, input.mediaModule),
        eq(schema.metadataCustomFields.entityType, input.entityType),
        eq(schema.metadataCustomFields.fieldKey, input.key),
      ),
    });
    if (existing) {
      throw new ValidationError("A custom field with this key already exists in this scope");
    }

    const scopeFields = await this.listByScope(input.mediaModule, input.entityType);
    const sortOrder = input.sortOrder ?? scopeFields.length;

    const id = generateId();
    await this.db.insert(schema.metadataCustomFields).values({
      id,
      mediaModule: input.mediaModule,
      entityType: input.entityType,
      fieldKey: input.key,
      displayName: input.displayName,
      fieldType: input.type,
      description: input.description ?? null,
      sortOrder,
    });

    if (input.options?.length) {
      await this.db.insert(schema.metadataCustomFieldOptions).values(
        input.options.map((opt, i) => ({
          id: generateId(),
          fieldId: id,
          optionKey: opt.key,
          label: opt.label,
          sortOrder: opt.sortOrder ?? i,
        })),
      );
    }

    return id;
  }

  async update(
    id: string,
    input: {
      displayName?: string;
      description?: string | null;
      sortOrder?: number;
      options?: CustomFieldOption[];
    },
  ): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new NotFoundError("Custom field not found");

    const patch: Partial<typeof schema.metadataCustomFields.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.description !== undefined) patch.description = input.description;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

    await this.db
      .update(schema.metadataCustomFields)
      .set(patch)
      .where(eq(schema.metadataCustomFields.id, id));

    if (input.options !== undefined) {
      const needsOptions =
        existing.type === "select" || existing.type === "multi_select";
      if (!needsOptions) {
        throw new ValidationError("Options are only allowed for select fields");
      }
      await this.db
        .delete(schema.metadataCustomFieldOptions)
        .where(eq(schema.metadataCustomFieldOptions.fieldId, id));
      if (input.options.length > 0) {
        await this.db.insert(schema.metadataCustomFieldOptions).values(
          input.options.map((opt, i) => ({
            id: generateId(),
            fieldId: id,
            optionKey: opt.key,
            label: opt.label,
            sortOrder: opt.sortOrder ?? i,
          })),
        );
      }
    }
  }

  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new NotFoundError("Custom field not found");
    await this.db
      .delete(schema.metadataCustomFields)
      .where(eq(schema.metadataCustomFields.id, id));
  }

  async reorder(
    mediaModule: CustomFieldMediaModule,
    entityType: CustomFieldEntityType,
    orderedIds: string[],
  ): Promise<void> {
    const fields = await this.listByScope(mediaModule, entityType);
    const fieldIdSet = new Set(fields.map((f) => f.id));
    for (const id of orderedIds) {
      if (!fieldIdSet.has(id)) {
        throw new ValidationError("Invalid field id in reorder list");
      }
    }
    if (orderedIds.length !== fields.length) {
      throw new ValidationError("Reorder list must include all fields in scope");
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await this.db
        .update(schema.metadataCustomFields)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(eq(schema.metadataCustomFields.id, orderedIds[i]!));
    }
  }

  async getValuesForSubject(
    mediaModule: CustomFieldMediaModule,
    entityType: CustomFieldEntityType,
    subjectId: string,
  ): Promise<CustomFieldValueDto[]> {
    const definitions = await this.listByScope(mediaModule, entityType);
    if (definitions.length === 0) return [];

    const fieldIds = definitions.map((d) => d.id);
    const valueRows = await this.db
      .select()
      .from(schema.customFieldValues)
      .where(
        and(
          inArray(schema.customFieldValues.fieldId, fieldIds),
          eq(schema.customFieldValues.subjectId, subjectId),
        ),
      );

    const valueByFieldId = new Map(valueRows.map((v) => [v.fieldId, v.value]));
    const result: CustomFieldValueDto[] = [];

    for (const def of definitions) {
      const value = valueByFieldId.get(def.id);
      if (value === undefined) continue;
      result.push({
        key: def.key,
        displayName: def.displayName,
        type: def.type,
        value,
        displayValue: formatCustomFieldDisplayValue(def.type, value, def.options),
      });
    }

    return result;
  }

  async getValuesForSubjectWithGlobal(
    mediaModule: CustomFieldMediaModule,
    entityType: CustomFieldEntityType,
    subjectId: string,
  ): Promise<CustomFieldValueDto[]> {
    const moduleValues = await this.getValuesForSubject(
      mediaModule,
      entityType,
      subjectId,
    );
    if (mediaModule === "global") return moduleValues;

    const globalValues = await this.getValuesForSubject(
      "global",
      "item",
      subjectId,
    );
    return [...moduleValues, ...globalValues];
  }

  async patchValues(
    mediaModule: CustomFieldMediaModule,
    entityType: CustomFieldEntityType,
    subjectId: string,
    partialValues: Record<string, unknown>,
    userId: string,
  ): Promise<CustomFieldValueDto[]> {
    const definitions = await this.listByScope(mediaModule, entityType);
    const validation = validateEntityValues(
      mediaModule,
      entityType,
      partialValues,
      definitions,
    );
    if (!validation.ok) {
      const firstError = Object.entries(validation.errors)[0];
      throw new ValidationError(firstError?.[1] ?? "Invalid custom field values");
    }

    for (const [key, value] of Object.entries(validation.validated)) {
      const def = definitions.find((d) => d.key === key);
      if (!def) continue;

      if (value === null) {
        await this.db
          .delete(schema.customFieldValues)
          .where(
            and(
              eq(schema.customFieldValues.fieldId, def.id),
              eq(schema.customFieldValues.subjectId, subjectId),
            ),
          );
        continue;
      }

      const existing = await this.db.query.customFieldValues.findFirst({
        where: and(
          eq(schema.customFieldValues.fieldId, def.id),
          eq(schema.customFieldValues.subjectId, subjectId),
        ),
      });

      if (existing) {
        await this.db
          .update(schema.customFieldValues)
          .set({ value, setByUserId: userId, updatedAt: new Date() })
          .where(eq(schema.customFieldValues.id, existing.id));
      } else {
        await this.db.insert(schema.customFieldValues).values({
          id: generateId(),
          fieldId: def.id,
          subjectId,
          value,
          setByUserId: userId,
        });
      }
    }

    return this.getValuesForSubject(mediaModule, entityType, subjectId);
  }
}
