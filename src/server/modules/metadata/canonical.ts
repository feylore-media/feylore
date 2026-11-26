import type { MetadataService } from "./service.js";
import type { MetadataProvenanceService } from "./provenance.js";
import type { BooksService } from "../books/service.js";
import type { MetadataProvenanceOrigin } from "../../../shared/metadata-provenance.js";
import type { MetadataSourceCategory } from "../../../shared/metadata-source-category.js";
import { FEYLORE_SOURCE_KEY } from "../../../shared/metadata-source-category.js";
import type { CanonicalFieldId } from "../../../shared/metadata-fields.js";
import {
  getBookCanonicalFieldSpec,
  isBookUserFacingField,
  parseBookFieldValueForSave,
} from "../../../shared/book-metadata-field-kinds.js";
import {
  normalizeIdentifierCollection,
  normalizeIsbn10,
  normalizeIsbn13,
} from "../../../shared/identifier-normalization.js";
import { parseCombinedSeriesValue } from "../../../shared/series-normalization.js";
import { ValidationError } from "../../../shared/errors.js";
import { readBookCanonicalFieldValue } from "./book-canonical-values.js";

export interface SetCanonicalFieldInput {
  subjectType: string;
  subjectId: string;
  field: string;
  value: unknown;
  userId?: string;
  provenance: {
    sourceKey: string;
    sourceCategory: MetadataSourceCategory;
    origin: MetadataProvenanceOrigin;
  };
  lock?: boolean;
  unlock?: boolean;
  skipPersistenceSync?: boolean;
}

function normalizeComparableValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(String).join("\0");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function canonicalValuesEqual(a: unknown, b: unknown): boolean {
  return normalizeComparableValue(a) === normalizeComparableValue(b);
}

function normalizeScalarValue(
  fieldId: CanonicalFieldId,
  value: unknown,
): unknown {
  if (fieldId === "isbn10" && typeof value === "string") {
    return normalizeIsbn10(value) ?? value;
  }
  if (fieldId === "isbn13" && typeof value === "string") {
    return normalizeIsbn13(value) ?? value;
  }
  if (fieldId === "identifiers" && Array.isArray(value)) {
    return normalizeIdentifierCollection(
      value as Array<{ scheme?: string; value: string }>,
    );
  }
  return value;
}

export class MetadataCanonicalService {
  constructor(
    private readonly metadata: MetadataService,
    private readonly provenance: MetadataProvenanceService,
    private readonly books: BooksService,
    private readonly schedulePersistenceSync?: (bookId: string) => void,
  ) {}

  private notifyPersistenceSync(bookId: string): void {
    this.schedulePersistenceSync?.(bookId);
  }

  async setCanonicalField(input: SetCanonicalFieldInput): Promise<boolean> {
    if (input.subjectType !== "book") {
      throw new Error(`Unsupported subject type: ${input.subjectType}`);
    }

    const fieldId = input.field as CanonicalFieldId;
    const normalizedValue = normalizeScalarValue(fieldId, input.value);
    const current = await this.getBookCanonicalValue(input.subjectId, input.field);
    const valueChanged = !canonicalValuesEqual(current, normalizedValue);

    if (valueChanged) {
      await this.writeBookCanonicalValue(
        input.subjectId,
        input.field,
        normalizedValue,
      );
      await this.provenance.upsertProvenance({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
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
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        field: input.field,
        sourceKey: input.provenance.sourceKey,
        sourceCategory: input.provenance.sourceCategory,
        origin: input.provenance.origin,
        userId: input.userId,
      });
    }

    if (input.unlock) {
      await this.metadata.clearOverride(
        input.subjectType,
        input.subjectId,
        input.field,
      );
    } else if (input.lock && input.userId) {
      await this.metadata.setOverride({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        field: input.field,
        value: normalizedValue,
        userId: input.userId,
      });
    }

    if (valueChanged && !input.skipPersistenceSync) {
      this.notifyPersistenceSync(input.subjectId);
    }

    return valueChanged;
  }

  async applyMergedFields(input: {
    subjectType: string;
    subjectId: string;
    fields: Partial<
      Record<
        CanonicalFieldId,
        {
          value: unknown;
          sourceKey: string;
          sourceCategory: MetadataSourceCategory;
        }
      >
    >;
    origin: MetadataProvenanceOrigin;
    overriddenFields: Set<string>;
  }): Promise<void> {
    let changed = false;
    for (const [fieldId, entry] of Object.entries(input.fields)) {
      if (!entry) continue;
      if (input.overriddenFields.has(fieldId)) continue;
      const current = await this.getBookCanonicalValue(input.subjectId, fieldId);
      if (canonicalValuesEqual(current, entry.value)) continue;
      const didChange = await this.setCanonicalField({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        field: fieldId,
        value: entry.value,
        provenance: {
          sourceKey: entry.sourceKey,
          sourceCategory: entry.sourceCategory,
          origin: input.origin,
        },
        skipPersistenceSync: true,
      });
      if (didChange) changed = true;
    }
    if (changed) {
      this.notifyPersistenceSync(input.subjectId);
    }
  }

  async setBookFieldsFromEdit(
    bookId: string,
    userId: string,
    fields: Partial<Record<string, unknown>>,
  ): Promise<void> {
    let changed = false;
    for (const [field, rawValue] of Object.entries(fields)) {
      if (rawValue === undefined) continue;
      const fieldId = field as CanonicalFieldId;
      if (!isBookUserFacingField(fieldId)) {
        throw new ValidationError("This metadata field is not user-editable");
      }
      const value =
        typeof rawValue === "string"
          ? parseBookFieldValueForSave(fieldId, rawValue)
          : rawValue;
      const didChange = await this.setCanonicalField({
        subjectType: "book",
        subjectId: bookId,
        field,
        value,
        userId,
        provenance: {
          sourceKey: FEYLORE_SOURCE_KEY,
          sourceCategory: "canonical",
          origin: "edit",
        },
        lock: true,
        skipPersistenceSync: true,
      });
      if (didChange) changed = true;
    }
    if (changed) {
      this.notifyPersistenceSync(bookId);
    }
  }

  private async getBookCanonicalContext(bookId: string) {
    const book = await this.books.getBook(bookId);
    const [
      authors,
      contributors,
      genres,
      tags,
      series,
      overrides,
    ] = await Promise.all([
      this.books.getAuthorNames(bookId),
      this.books.getContributorNames(bookId),
      this.books.getGenreNames(bookId),
      this.books.getTagNames(bookId),
      this.books.getSeriesForBook(bookId),
      this.metadata.getOverrides("book", bookId),
    ]);

    const overrideMap: Record<string, unknown> = {};
    for (const override of overrides) {
      overrideMap[override.field] = override.value;
    }

    return {
      book,
      ctx: {
        title: book.title,
        subtitle: book.subtitle,
        description: book.description,
        authors,
        contributors,
        genres,
        tags,
        seriesName: series?.name,
        seriesPosition: series?.position,
        coverFileId: book.coverFileId,
      },
      overrideMap,
    };
  }

  private async getBookCanonicalValue(
    bookId: string,
    field: string,
  ): Promise<unknown> {
    const { ctx, overrideMap } = await this.getBookCanonicalContext(bookId);
    return readBookCanonicalFieldValue(
      field as CanonicalFieldId,
      ctx,
      overrideMap,
      {},
    );
  }

  private async writeBookCanonicalValue(
    bookId: string,
    field: string,
    value: unknown,
  ): Promise<void> {
    const fieldId = field as CanonicalFieldId;
    const spec = getBookCanonicalFieldSpec(fieldId);
    if (!spec) return;

    switch (spec.storage) {
      case "bookColumn":
        if (
          fieldId === "title" ||
          fieldId === "subtitle" ||
          fieldId === "description"
        ) {
          await this.books.updateBook(bookId, {
            [fieldId]: value as string,
          });
        }
        break;
      case "association":
        if (fieldId === "authors") {
          await this.books.setAuthors(bookId, value as string[]);
        } else if (fieldId === "contributors") {
          await this.books.setContributors(bookId, value as string[]);
        } else if (fieldId === "genres") {
          await this.books.setGenres(bookId, value as string[]);
        } else if (fieldId === "tags") {
          await this.books.setTags(bookId, value as string[]);
        }
        break;
      case "series":
        if (fieldId === "series") {
          const seriesName =
            typeof value === "string" ? parseCombinedSeriesValue(value).name : "";
          const current = await this.books.getSeriesForBook(bookId);
          await this.books.setSeriesByName(
            bookId,
            seriesName || null,
            current?.position ?? undefined,
          );
        } else if (fieldId === "seriesPosition") {
          const current = await this.books.getSeriesForBook(bookId);
          const position =
            typeof value === "number"
              ? value
              : typeof value === "string" && value.trim()
                ? Number(value)
                : undefined;
          if (current?.name) {
            await this.books.setSeriesByName(
              bookId,
              current.name,
              Number.isFinite(position) ? position : undefined,
            );
          }
        }
        break;
      case "artwork":
        if (fieldId === "cover" && typeof value === "string") {
          await this.books.updateBook(bookId, { coverFileId: value });
        }
        break;
      case "scalar":
        break;
      default:
        break;
    }
  }
}
