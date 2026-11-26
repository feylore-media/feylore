import type { FileService } from "../files/service.js";
import type { MetadataService } from "./service.js";
import type { MetadataPolicyService } from "./policy.js";
import type { MetadataCanonicalService } from "./canonical.js";
import type { MetadataProviderRegistry } from "./registry.js";
import type { BooksService } from "../books/service.js";
import type { CoverPipeline } from "./cover.js";
import type { JobService } from "../jobs/service.js";
import type { MetadataFormattingService } from "./formatting.js";
import { applyIngestFormatting } from "./apply-ingest-formatting.js";
import { inferFormatFromPath } from "../../../shared/subject.js";
import {
  EXTRACTOR_EPUB_OPF,
  extractEpubOpfFromFile,
  type EpubOpfBibliographic,
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
import { detectIsbn } from "./extractors/epub-opf.js";

function extractRemoteCoverUrl(cover: unknown): string | undefined {
  if (typeof cover !== "object" || cover === null || !("url" in cover)) {
    return undefined;
  }
  const url = (cover as { url?: unknown }).url;
  return typeof url === "string" && url.startsWith("https://") ? url : undefined;
}

export type BookMetadataResolutionMode = "ingest" | "providers_only";

export interface BookMetadataResolutionInput {
  fileId: string;
  bookId: string;
  representationId: string;
  manifestationId: string;
  userId?: string;
  mode?: BookMetadataResolutionMode;
}

export interface BookMetadataResolutionResult {
  title?: string;
  authors?: string[];
  series?: string;
  log: string[];
  merged: {
    title?: string;
    subtitle?: string;
    description?: string;
    authors?: string[];
    genres?: string[];
    isbn13?: string;
  };
}

export async function runBookMetadataResolution(
  files: FileService,
  metadata: MetadataService,
  metadataPolicy: MetadataPolicyService,
  metadataCanonical: MetadataCanonicalService,
  registry: MetadataProviderRegistry,
  books: BooksService,
  coverPipeline: CoverPipeline,
  input: BookMetadataResolutionInput,
  jobs?: JobService,
  formatting?: MetadataFormattingService,
): Promise<BookMetadataResolutionResult> {
  const {
    fileId,
    bookId,
    representationId,
    manifestationId,
    userId,
    mode = "ingest",
  } = input;
  const log: string[] = [];

  const file = await files.getFile(fileId);
  const format = inferFormatFromPath(file.relativePath);

  let opfData: EpubOpfBibliographic | undefined;
  let epubZip: Awaited<ReturnType<typeof extractEpubOpfFromFile>>["zip"] | undefined;
  let filenameData: ReturnType<typeof extractFilenameMetadata> | undefined;

  if (mode === "ingest") {
    if (format === "epub") {
      try {
        const extracted = await extractEpubOpfFromFile(files, fileId);
        opfData = extracted.bibliographic;
        epubZip = extracted.zip;
        await metadata.storeTechnicalMetadata(
          fileId,
          EXTRACTOR_EPUB_OPF,
          opfData as unknown as Record<string, unknown>,
        );
        await metadata.storeExtractorRecord({
          providerKey: EXTRACTOR_EPUB_OPF,
          subjectType: "book",
          subjectId: bookId,
          payload: opfData as unknown as Record<string, unknown>,
        });
        log.push("opf");
      } catch (err) {
        log.push(`opf-failed:${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    filenameData = extractFilenameMetadata(file.relativePath);
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
    log.push("filename");
  }

  const hints: Record<string, unknown> = { format };
  if (mode === "ingest") {
    if (opfData?.title) hints.title = opfData.title;
    if (opfData?.authors?.[0]) hints.author = opfData.authors[0];
    const isbn = opfData?.identifiers?.length
      ? detectIsbn(opfData.identifiers)
      : undefined;
    if (isbn) hints.isbn13 = isbn.value;
    if (opfData?.language) hints.language = opfData.language;
  } else {
    const book = await books.getBook(bookId);
    if (book.title) hints.title = book.title;
    const authorNames = await books.getAuthorNames(bookId);
    if (authorNames[0]) hints.author = authorNames[0];
  }

  const matchingRules = await metadataPolicy.getMatchingRules("books");

  let providerResults: Awaited<
    ReturnType<MetadataService["refreshMetadata"]>
  > = [];
  try {
    providerResults = await metadata.refreshMetadata(
      "book",
      bookId,
      {
        fileId,
        subjectType: "book",
        subjectId: bookId,
        hints,
        userId,
        matchingRules,
      },
      "books",
    );
    if (providerResults.length > 0) log.push(`providers:${providerResults.length}`);
  } catch (err) {
    log.push(
      `providers-failed:${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  const sourcePayloads = new Map<string, Record<string, unknown>>();
  if (mode === "ingest") {
    if (opfData) {
      sourcePayloads.set(EXTRACTOR_EPUB_OPF, opfToPayload(opfData));
    }
    if (filenameData) {
      sourcePayloads.set(EXTRACTOR_FILENAME, filenameToPayload(filenameData));
    }
  }
  for (const result of providerResults) {
    sourcePayloads.set(result.providerKey, result.payload);
  }

  const fieldPolicies =
    mode === "ingest"
      ? await metadataPolicy.getIngestFieldPriorities("books")
      : await metadataPolicy.getProviderFieldPriorities("books");
  const overrides = await metadata.getOverrides("book", bookId);
  const overriddenFields = new Set(overrides.map((o) => o.field));

  const { values, provenance } = mergeMetadataFields({
    fieldPolicies,
    sourcePayloads,
    overriddenFields,
    matchingRules,
  });

  const merged = {
    title: values.title as string | undefined,
    subtitle: values.subtitle as string | undefined,
    description: values.description as string | undefined,
    authors: values.authors as string[] | undefined,
    genres: values.genres as string[] | undefined,
    isbn13: values.isbn13 as string | undefined,
    language: opfData?.language,
  };

  if (formatting) {
    await applyIngestFormatting(formatting, merged, overriddenFields, {
      module: "books",
      subjectId: bookId,
    });
  }

  const canonicalFields: Partial<
    Record<
      CanonicalFieldId,
      {
        value: unknown;
        sourceKey: string;
        sourceCategory: ReturnType<typeof resolveSourceCategory>;
      }
    >
  > = {};

  for (const fieldId of [
    "title",
    "subtitle",
    "description",
    "authors",
    "genres",
  ] as const) {
    const value = merged[fieldId];
    if (value === undefined) continue;
    const sourceKey = provenance[fieldId];
    if (!sourceKey) continue;
    canonicalFields[fieldId] = {
      value,
      sourceKey,
      sourceCategory: resolveSourceCategory(sourceKey, registry),
    };
  }

  await metadataCanonical.applyMergedFields({
    subjectType: "book",
    subjectId: bookId,
    fields: canonicalFields,
    origin: mode === "ingest" ? "ingest" : "merge",
    overriddenFields,
  });

  await books.applyIngestedMetadata(bookId, {
    merged,
    opfIdentifiers: opfData?.identifiers,
    manifestationId,
    skipFieldWrites: true,
  });
  log.push("metadata-applied");

  if (mode === "ingest") {
    try {
      const coverId = await coverPipeline.resolveAndStoreCover({
        bookId,
        representationId,
        sourceFileId: fileId,
        embeddedCover: opfData?.cover,
        epubZip,
      });
      if (coverId) {
        log.push("cover");
      } else {
        const coverUrl = extractRemoteCoverUrl(values.cover);
        if (coverUrl && jobs) {
          await jobs.enqueue("artwork.fetch", {
            bookId,
            representationId,
            coverUrl,
          });
          log.push("cover-enqueued");
        }
      }
    } catch (err) {
      log.push(`cover-failed:${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  await books.indexBook(bookId);

  return {
    title: merged.title,
    authors: merged.authors,
    log,
    merged,
  };
}
