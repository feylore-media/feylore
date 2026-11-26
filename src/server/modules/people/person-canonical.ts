import type { MetadataService } from "../metadata/service.js";
import type { MetadataProvenanceService } from "../metadata/provenance.js";
import type { PeopleService } from "./service.js";
import type { MetadataProvenanceOrigin } from "../../../shared/metadata-provenance.js";
import type { MetadataSourceCategory } from "../../../shared/metadata-source-category.js";
import { FEYLORE_SOURCE_KEY } from "../../../shared/metadata-source-category.js";
import type { CanonicalFieldId } from "../../../shared/metadata-fields.js";
import { getCanonicalFieldsForModule } from "../../../shared/metadata-fields.js";
import {
  getPersonCanonicalFieldSpec,
  isPersonUserFacingField,
  parsePersonFieldValueForSave,
} from "../../../shared/person-metadata-field-kinds.js";
import { ValidationError } from "../../../shared/errors.js";

export type PersonCanonicalColumn =
  | "name"
  | "sortName"
  | "alternateNames"
  | "bio"
  | "pronouns"
  | "personalUrl"
  | "birthDate"
  | "deathDate"
  | "birthPlace"
  | "deathPlace"
  | "photoFileId";

export const PERSON_COLUMN_BY_FIELD: Partial<
  Record<CanonicalFieldId, PersonCanonicalColumn>
> = {
  name: "name",
  sortName: "sortName",
  alternateNames: "alternateNames",
  bio: "bio",
  pronouns: "pronouns",
  personalUrl: "personalUrl",
  birthDate: "birthDate",
  deathDate: "deathDate",
  birthPlace: "birthPlace",
  deathPlace: "deathPlace",
  photo: "photoFileId",
};

export function isPersonField(field: string): boolean {
  return getCanonicalFieldsForModule("people").some((f) => f.id === field);
}

export interface SetPersonFieldInput {
  personId: string;
  field: CanonicalFieldId;
  value: unknown;
  userId?: string;
  provenance: {
    sourceKey: string;
    sourceCategory: MetadataSourceCategory;
    origin: MetadataProvenanceOrigin;
  };
  lock?: boolean;
  unlock?: boolean;
}

function normalizeComparableValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(String).join("\0");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function personCanonicalValuesEqual(a: unknown, b: unknown): boolean {
  return normalizeComparableValue(a) === normalizeComparableValue(b);
}

/**
 * Person canonical fields live directly on the people row and are protected by
 * field_overrides acting as locks. This service is a person-specific mirror of
 * MetadataCanonicalService: it never merges automatically and only writes what
 * the user (or an explicit adopt) requests.
 */
export class PersonCanonicalService {
  constructor(
    private readonly metadata: MetadataService,
    private readonly provenance: MetadataProvenanceService,
    private readonly people: PeopleService,
  ) {}

  async setPersonField(input: SetPersonFieldInput): Promise<boolean> {
    const spec = getPersonCanonicalFieldSpec(input.field);
    if (!spec) {
      throw new ValidationError("Unknown person metadata field");
    }
    if (!isPersonUserFacingField(input.field)) {
      throw new ValidationError("This metadata field is not user-editable");
    }
    if (input.field === "photo" && !spec) {
      throw new ValidationError("Portrait must be managed via the photo endpoint");
    }

    const current = await this.getPersonCanonicalValue(
      input.personId,
      input.field,
    );
    const valueChanged = !personCanonicalValuesEqual(current, input.value);

    if (valueChanged) {
      await this.writePersonCanonicalValue(
        input.personId,
        input.field,
        input.value,
      );
      await this.provenance.upsertProvenance({
        subjectType: "person",
        subjectId: input.personId,
        field: input.field,
        sourceKey: input.provenance.sourceKey,
        sourceCategory: input.provenance.sourceCategory,
        origin: input.provenance.origin,
        userId: input.userId,
      });
    } else if (
      input.provenance.origin === "adopt" ||
      input.provenance.origin === "edit"
    ) {
      await this.provenance.upsertProvenance({
        subjectType: "person",
        subjectId: input.personId,
        field: input.field,
        sourceKey: input.provenance.sourceKey,
        sourceCategory: input.provenance.sourceCategory,
        origin: input.provenance.origin,
        userId: input.userId,
      });
    }

    if (input.unlock) {
      await this.metadata.clearOverride(
        "person",
        input.personId,
        input.field,
      );
    } else if (input.lock && input.userId) {
      await this.metadata.setOverride({
        subjectType: "person",
        subjectId: input.personId,
        field: input.field,
        value: input.value,
        userId: input.userId,
      });
    }

    return valueChanged;
  }

  async setPersonFieldsFromEdit(
    personId: string,
    userId: string,
    fields: Array<{ fieldId: string; value?: string | null }>,
  ): Promise<void> {
    for (const entry of fields) {
      if (entry.value === undefined && !entry.fieldId) continue;
      const fieldId = entry.fieldId as CanonicalFieldId;
      if (!isPersonUserFacingField(fieldId)) {
        throw new ValidationError("This metadata field is not user-editable");
      }
      const value =
        entry.value === undefined || entry.value === null
          ? undefined
          : parsePersonFieldValueForSave(fieldId, entry.value);
      await this.setPersonField({
        personId,
        field: fieldId,
        value,
        userId,
        provenance: {
          sourceKey: FEYLORE_SOURCE_KEY,
          sourceCategory: "canonical",
          origin: "edit",
        },
        lock: true,
      });
    }
  }

  async setPersonFieldLock(
    personId: string,
    userId: string,
    field: CanonicalFieldId,
    lock: boolean,
  ): Promise<void> {
    if (lock) {
      const current = await this.getPersonCanonicalValue(personId, field);
      await this.metadata.setOverride({
        subjectType: "person",
        subjectId: personId,
        field,
        value: current ?? "",
        userId,
      });
    } else {
      await this.metadata.clearOverride("person", personId, field);
    }
  }

  async getPersonCanonicalValue(
    personId: string,
    field: string,
  ): Promise<unknown> {
    const spec = getPersonCanonicalFieldSpec(field as CanonicalFieldId);
    if (!spec) return undefined;
    const person = await this.people.getPersonRow(personId);
    if (!person) return undefined;

    const overrides = await this.metadata.getOverrides("person", personId);
    const override = overrides.find((o) => o.field === field);
    if (override) return override.value ?? undefined;

    const column = PERSON_COLUMN_BY_FIELD[field as CanonicalFieldId];
    if (!column) return undefined;
    return person[column] ?? undefined;
  }

  private async writePersonCanonicalValue(
    personId: string,
    field: CanonicalFieldId,
    value: unknown,
  ): Promise<void> {
    if (field === "photo") {
      throw new ValidationError("Portrait must be managed via the photo endpoint");
    }
    const column = PERSON_COLUMN_BY_FIELD[field];
    if (!column) return;
    await this.people.updatePersonFields(personId, {
      [column]: value as never,
    });
  }
}