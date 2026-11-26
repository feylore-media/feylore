import type { FileService } from "../files/service.js";
import type { MetadataService } from "./service.js";
import type { MetadataPolicyService } from "./policy.js";
import type { MetadataCanonicalService } from "./canonical.js";
import type { MetadataProviderRegistry } from "./registry.js";
import type { BooksService } from "../books/service.js";
import { inferFormatFromPath } from "../../../shared/subject.js";
import {
  EXTRACTOR_EPUB_OPF,
  extractEpubOpfFromFile,
} from "./extractors/epub-opf.js";
import {
  EXTRACTOR_FILENAME,
  extractFilenameMetadata,
} from "./extractors/filename.js";
import {
  mergeMetadataFields,
  opfToPayload,
  filenameToPayload,
} from "./merge.js";
import { resolveSourceCategory } from "./source-category.js";
import type { CanonicalFieldId } from "../../../shared/metadata-fields.js";

export async function reextractBookImportedMetadata(
  files: FileService,
  metadata: MetadataService,
  metadataPolicy: MetadataPolicyService,
  metadataCanonical: MetadataCanonicalService,
  registry: MetadataProviderRegistry,
  books: BooksService,
  bookId: string,
  fileIds: string[],
): Promise<{ log: string[] }> {
  const log: string[] = [];

  const sourcePayloads = new Map<string, Record<string, unknown>>();

  for (const fileId of fileIds) {
    const file = await files.getFile(fileId);
    const format = inferFormatFromPath(file.relativePath);

    if (format === "epub") {
      try {
        const extracted = await extractEpubOpfFromFile(files, fileId);
        await metadata.storeTechnicalMetadata(
          fileId,
          EXTRACTOR_EPUB_OPF,
          extracted.bibliographic as unknown as Record<string, unknown>,
        );
        await metadata.storeExtractorRecord({
          providerKey: EXTRACTOR_EPUB_OPF,
          subjectType: "book",
          subjectId: bookId,
          payload: extracted.bibliographic as unknown as Record<string, unknown>,
        });
        sourcePayloads.set(EXTRACTOR_EPUB_OPF, opfToPayload(extracted.bibliographic));
        log.push(`opf:${fileId}`);
      } catch (err) {
        log.push(
          `opf-failed:${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    }

    const filenameData = extractFilenameMetadata(file.relativePath);
    await metadata.storeTechnicalMetadata(
      fileId,
      EXTRACTOR_FILENAME,
      filenameData as unknown as Record<string, unknown>,
    );
    await metadata.storeExtractorRecord({
      providerKey: EXTRACTOR_FILENAME,
      subjectType: "book",
      subjectId: bookId,
      payload: filenameData as unknown as Record<string, unknown>,
    });
    sourcePayloads.set(EXTRACTOR_FILENAME, filenameToPayload(filenameData));
    log.push(`filename:${fileId}`);
  }

  const fieldPolicies = await metadataPolicy.getIngestFieldPriorities("books");
  const matchingRules = await metadataPolicy.getMatchingRules("books");
  const overrides = await metadata.getOverrides("book", bookId);
  const overriddenFields = new Set(overrides.map((o) => o.field));

  const { values, provenance } = mergeMetadataFields({
    fieldPolicies,
    sourcePayloads,
    overriddenFields,
    matchingRules,
  });

  const fields: Partial<
    Record<
      CanonicalFieldId,
      {
        value: unknown;
        sourceKey: string;
        sourceCategory: ReturnType<typeof resolveSourceCategory>;
      }
    >
  > = {};

  for (const [fieldId, value] of Object.entries(values)) {
    const sourceKey = provenance[fieldId as CanonicalFieldId];
    if (!sourceKey) continue;
    fields[fieldId as CanonicalFieldId] = {
      value,
      sourceKey,
      sourceCategory: resolveSourceCategory(sourceKey, registry),
    };
  }

  await metadataCanonical.applyMergedFields({
    subjectType: "book",
    subjectId: bookId,
    fields,
    origin: "merge",
    overriddenFields,
  });

  await books.indexBook(bookId);
  log.push("merge-applied");
  return { log };
}
