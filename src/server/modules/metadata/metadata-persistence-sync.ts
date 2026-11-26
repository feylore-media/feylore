import { eq, and, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { FileService } from "../files/service.js";
import type { StorageService } from "../storage/adapter.js";
import type { BooksService } from "../books/service.js";
import type { JobService } from "../jobs/service.js";
import type { MetadataPersistenceService } from "../settings/metadata-persistence-service.js";
import { inferFormatFromPath } from "../../../shared/subject.js";
import { StorageReadOnlyError } from "../../../shared/errors.js";
import {
  readEpubContainer,
  readEpubZipFromFile,
} from "./extractors/epub-opf.js";
import {
  applyBibliographicToOpf,
  canonicalFieldsToBibliographic,
} from "./epub-opf-write.js";
import { getBookEditorFieldOrder } from "../../../shared/book-metadata-field-kinds.js";
import { readBookCanonicalFieldValue } from "./book-canonical-values.js";
import { formatBookCanonicalValue } from "../../../shared/book-metadata-field-kinds.js";
import type { CanonicalFieldId } from "../../../shared/metadata-fields.js";
import { JOB_TYPES } from "../jobs/types.js";

const SIDECAR_SUFFIX = ".feylore-metadata.json";

export interface MetadataPersistenceSyncResult {
  log: string[];
  errors: string[];
}

export class MetadataPersistenceSyncService {
  constructor(
    private readonly db: Database,
    private readonly files: FileService,
    private readonly storage: StorageService,
    private readonly books: BooksService,
    private readonly metadataPersistence: MetadataPersistenceService,
    private readonly jobs: JobService,
  ) {}

  enqueueBookSync(bookId: string): void {
    void this.jobs
      .enqueue(
        JOB_TYPES.METADATA_PERSISTENCE_SYNC,
        { bookId },
        { singletonKey: `metadata-persistence:${bookId}` },
      )
      .catch(() => {
        // Best-effort scheduling; canonical state remains authoritative.
      });
  }

  async syncBook(bookId: string): Promise<MetadataPersistenceSyncResult> {
    const mode = await this.metadataPersistence.getForModule("books");
    const log: string[] = [];
    const errors: string[] = [];

    if (mode === "neither") {
      log.push("skipped:neither");
      return { log, errors };
    }

    const fields = await this.collectCanonicalFields(bookId);
    const epubFiles = await this.listBookEpubFiles(bookId);

    if (epubFiles.length === 0) {
      log.push("no-epub-files");
      return { log, errors };
    }

    for (const file of epubFiles) {
      try {
        if (mode === "write_to_file") {
          await this.writeToEpubFile(file.fileId, file.relativePath, fields);
          log.push(`file:${file.fileId}:ok`);
        } else if (mode === "write_to_sidecar") {
          await this.writeSidecar(file.fileId, file.relativePath, fields);
          log.push(`sidecar:${file.fileId}:ok`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        errors.push(`${file.fileId}:${message}`);
        log.push(`file:${file.fileId}:failed:${message}`);
      }
    }

    return { log, errors };
  }

  private async collectCanonicalFields(
    bookId: string,
  ): Promise<Record<string, unknown>> {
    const book = await this.books.getBook(bookId);
    const authors = await this.books.getAuthorNames(bookId);
    const contributors = await this.books.getContributorNames(bookId);
    const genres = await this.books.getGenreNames(bookId);
    const tags = await this.books.getTagNames(bookId);
    const series = await this.books.getSeriesForBook(bookId);

    const ctx = {
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
    };

    const fields: Record<string, unknown> = {};
    for (const fieldId of getBookEditorFieldOrder()) {
      const raw = readBookCanonicalFieldValue(
        fieldId as CanonicalFieldId,
        ctx,
        {},
        {},
      );
      const formatted = formatBookCanonicalValue(raw);
      if (formatted !== null) {
        fields[fieldId] = raw;
      }
    }
    return fields;
  }

  private async listBookEpubFiles(
    bookId: string,
  ): Promise<Array<{ fileId: string; relativePath: string; storageLocationId: string }>> {
    const expressions = await this.db
      .select({ id: schema.creativeWorkExpressions.id })
      .from(schema.creativeWorkExpressions)
      .where(
        and(
          eq(schema.creativeWorkExpressions.workType, "book"),
          eq(schema.creativeWorkExpressions.workId, bookId),
        ),
      );

    if (expressions.length === 0) return [];

    const manifestationIds = (
      await this.db
        .select({ id: schema.creativeWorkManifestations.id })
        .from(schema.creativeWorkManifestations)
        .where(
          inArray(
            schema.creativeWorkManifestations.expressionId,
            expressions.map((e) => e.id),
          ),
        )
    ).map((m) => m.id);

    if (manifestationIds.length === 0) return [];

    const representations = await this.db
      .select({ id: schema.representations.id })
      .from(schema.representations)
      .where(inArray(schema.representations.manifestationId, manifestationIds));

    const results: Array<{
      fileId: string;
      relativePath: string;
      storageLocationId: string;
    }> = [];

    for (const rep of representations) {
      const links = await this.db
        .select({ fileId: schema.representationFiles.fileId })
        .from(schema.representationFiles)
        .where(eq(schema.representationFiles.representationId, rep.id));

      for (const link of links) {
        const file = await this.files.getFile(link.fileId);
        if (inferFormatFromPath(file.relativePath) !== "epub") continue;
        results.push({
          fileId: file.id,
          relativePath: file.relativePath,
          storageLocationId: file.storageLocationId,
        });
      }
    }

    return results;
  }

  private async writeToEpubFile(
    fileId: string,
    relativePath: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    const file = await this.files.getFile(fileId);
    const adapter = await this.storage.getAdapter(file.storageLocationId);
    try {
      adapter.assertWritable();
    } catch (err) {
      if (err instanceof StorageReadOnlyError) return;
      throw err;
    }

    const bibliographic = canonicalFieldsToBibliographic(fields);
    const { zip } = await readEpubZipFromFile(this.files, fileId);
    const { opfPath, opfXml } = await readEpubContainer(zip);
    const updatedOpf = applyBibliographicToOpf(opfXml, bibliographic);
    zip.file(opfPath, updatedOpf);

    const output = await zip.generateAsync({ type: "nodebuffer" });
    const tempPath = `${relativePath}.metadata-sync`;
    await adapter.write(tempPath, output);
    await adapter.delete(relativePath);
    await adapter.move(tempPath, relativePath);
  }

  private async writeSidecar(
    fileId: string,
    relativePath: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    const file = await this.files.getFile(fileId);
    const adapter = await this.storage.getAdapter(file.storageLocationId);
    try {
      adapter.assertWritable();
    } catch (err) {
      if (err instanceof StorageReadOnlyError) return;
      throw err;
    }

    const sidecarPath = `${relativePath}${SIDECAR_SUFFIX}`;
    const payload = {
      feyloreVersion: 1,
      updatedAt: new Date().toISOString(),
      fileId,
      fields,
    };
    await adapter.write(sidecarPath, Buffer.from(JSON.stringify(payload, null, 2)));
  }
}

export function sidecarPathForFile(relativePath: string): string {
  return `${relativePath}${SIDECAR_SUFFIX}`;
}

export { SIDECAR_SUFFIX };
