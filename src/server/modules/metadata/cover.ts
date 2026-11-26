import { createHash } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import type { FileService } from "../files/service.js";
import type { RepresentationService } from "../representations/service.js";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { normalizeRelativePath } from "../../security/paths.js";
import type { EpubOpfCover } from "./extractors/epub-opf.js";
import { outboundFetchBuffer } from "./outbound-fetch.js";

const MAX_COVER_BYTES = 10 * 1024 * 1024;
const ALLOWED_COVER_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function extForMediaType(mediaType: string): string {
  switch (mediaType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return ".bin";
  }
}

function normalizeCoverMediaType(mediaType: string, href: string): string | null {
  if (ALLOWED_COVER_TYPES.has(mediaType)) return mediaType;
  const ext = href.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const guessed = map[ext];
  return guessed && ALLOWED_COVER_TYPES.has(guessed) ? guessed : null;
}

export class CoverPipeline {
  constructor(
    private readonly db: Database,
    private readonly files: FileService,
    private readonly representations: RepresentationService,
  ) {}

  async resolveAndStoreCover(input: {
    bookId: string;
    representationId: string;
    sourceFileId: string;
    embeddedCover?: EpubOpfCover;
    epubZip?: JSZip;
  }): Promise<string | null> {
    const book = await this.db.query.books.findFirst({
      where: eq(schema.books.id, input.bookId),
    });
    if (!book) return null;
    if (book.coverFileId) return book.coverFileId;

    const sourceFile = await this.files.getFile(input.sourceFileId);
    let coverData: Buffer | null = null;
    let mediaType: string | null = null;

    if (input.embeddedCover && input.epubZip) {
      const result = await this.readEmbeddedCover(
        input.epubZip,
        input.embeddedCover,
      );
      coverData = result?.data ?? null;
      mediaType = result?.mediaType ?? null;
    }

    if (!coverData) {
      const sibling = await this.files.findSiblingImage(
        sourceFile.relativePath,
        sourceFile.storageLocationId,
      );
      if (sibling) {
        const { stream } = await this.files.getStream(sibling.id);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        const data = Buffer.concat(chunks);
        const siblingType = normalizeCoverMediaType(
          sibling.mediaType ?? "",
          sibling.relativePath,
        );
        if (siblingType && data.length <= MAX_COVER_BYTES) {
          coverData = data;
          mediaType = siblingType;
        }
      }
    }

    if (!coverData || !mediaType) return null;

    const managedLocationId = await this.files.getManagedStorageLocationId();
    if (!managedLocationId) return null;

    const checksum = createHash("sha256").update(coverData).digest("hex");
    const ext = extForMediaType(mediaType);
    const relativePath = normalizeRelativePath(
      path.posix.join("artwork", "books", input.bookId, `${checksum}${ext}`),
    );

    const coverFileId = await this.files.storeDerivedFile({
      storageLocationId: managedLocationId,
      relativePath,
      data: coverData,
      mediaType,
    });

    await this.db
      .update(schema.books)
      .set({ coverFileId, updatedAt: new Date() })
      .where(eq(schema.books.id, input.bookId));

    await this.representations.linkFile(
      input.representationId,
      coverFileId,
      "cover",
    );

    return coverFileId;
  }

  async fetchAndStoreCoverFromUrl(input: {
    bookId: string;
    representationId: string;
    coverUrl: string;
    replaceExisting?: boolean;
  }): Promise<string | null> {
    const book = await this.db.query.books.findFirst({
      where: eq(schema.books.id, input.bookId),
    });
    if (!book || (book.coverFileId && !input.replaceExisting)) {
      return book?.coverFileId ?? null;
    }

    const previousCoverFileId = book.coverFileId;

    const { data, mediaType } = await outboundFetchBuffer(input.coverUrl, {
      maxBytes: MAX_COVER_BYTES,
    });
    const normalizedType = normalizeCoverMediaType(
      mediaType,
      input.coverUrl,
    );
    if (!normalizedType || data.length > MAX_COVER_BYTES) return null;

    const managedLocationId = await this.files.getManagedStorageLocationId();
    if (!managedLocationId) return null;

    const checksum = createHash("sha256").update(data).digest("hex");
    const ext = extForMediaType(normalizedType);
    const relativePath = normalizeRelativePath(
      path.posix.join("artwork", "books", input.bookId, `${checksum}${ext}`),
    );

    const coverFileId = await this.files.storeDerivedFile({
      storageLocationId: managedLocationId,
      relativePath,
      data,
      mediaType: normalizedType,
    });

    await this.db
      .update(schema.books)
      .set({ coverFileId, updatedAt: new Date() })
      .where(eq(schema.books.id, input.bookId));

    await this.representations.linkFile(
      input.representationId,
      coverFileId,
      "cover",
    );

    if (previousCoverFileId && previousCoverFileId !== coverFileId) {
      await this.representations.unlinkFile(
        input.representationId,
        previousCoverFileId,
      );
    }

    return coverFileId;
  }

  async fetchAndStoreAudiobookCoverFromUrl(input: {
    audiobookId: string;
    representationId: string;
    coverUrl: string;
  }): Promise<string | null> {
    const audiobook = await this.db.query.audiobooks.findFirst({
      where: eq(schema.audiobooks.id, input.audiobookId),
    });
    if (!audiobook || audiobook.coverFileId) return audiobook?.coverFileId ?? null;

    const { data, mediaType } = await outboundFetchBuffer(input.coverUrl, {
      maxBytes: MAX_COVER_BYTES,
    });
    const normalizedType = normalizeCoverMediaType(
      mediaType,
      input.coverUrl,
    );
    if (!normalizedType || data.length > MAX_COVER_BYTES) return null;

    const managedLocationId = await this.files.getManagedStorageLocationId();
    if (!managedLocationId) return null;

    const checksum = createHash("sha256").update(data).digest("hex");
    const ext = extForMediaType(normalizedType);
    const relativePath = normalizeRelativePath(
      path.posix.join(
        "artwork",
        "audiobooks",
        input.audiobookId,
        `${checksum}${ext}`,
      ),
    );

    const coverFileId = await this.files.storeDerivedFile({
      storageLocationId: managedLocationId,
      relativePath,
      data,
      mediaType: normalizedType,
    });

    await this.db
      .update(schema.audiobooks)
      .set({ coverFileId, updatedAt: new Date() })
      .where(eq(schema.audiobooks.id, input.audiobookId));

    await this.representations.linkFile(
      input.representationId,
      coverFileId,
      "cover",
    );

    return coverFileId;
  }

  async fetchAndStoreAlbumCoverFromUrl(input: {
    albumId: string;
    representationId: string;
    coverUrl: string;
  }): Promise<string | null> {
    const album = await this.db.query.albums.findFirst({
      where: eq(schema.albums.id, input.albumId),
    });
    if (!album || album.coverFileId) return album?.coverFileId ?? null;

    const { data, mediaType } = await outboundFetchBuffer(input.coverUrl, {
      maxBytes: MAX_COVER_BYTES,
    });
    const normalizedType = normalizeCoverMediaType(
      mediaType,
      input.coverUrl,
    );
    if (!normalizedType || data.length > MAX_COVER_BYTES) return null;

    const managedLocationId = await this.files.getManagedStorageLocationId();
    if (!managedLocationId) return null;

    const checksum = createHash("sha256").update(data).digest("hex");
    const ext = extForMediaType(normalizedType);
    const relativePath = normalizeRelativePath(
      path.posix.join("artwork", "albums", input.albumId, `${checksum}${ext}`),
    );

    const coverFileId = await this.files.storeDerivedFile({
      storageLocationId: managedLocationId,
      relativePath,
      data,
      mediaType: normalizedType,
    });

    await this.db
      .update(schema.albums)
      .set({ coverFileId, updatedAt: new Date() })
      .where(eq(schema.albums.id, input.albumId));

    await this.representations.linkFile(
      input.representationId,
      coverFileId,
      "cover",
    );

    return coverFileId;
  }

  async fetchAndStorePodcastCover(input: {
    showId: string;
    coverUrl: string;
  }): Promise<string | null> {
    const show = await this.db.query.podcastShows.findFirst({
      where: eq(schema.podcastShows.id, input.showId),
    });
    if (!show || show.coverFileId) return show?.coverFileId ?? null;

    const { data, mediaType } = await outboundFetchBuffer(input.coverUrl, {
      maxBytes: MAX_COVER_BYTES,
    });
    const normalizedType = normalizeCoverMediaType(
      mediaType,
      input.coverUrl,
    );
    if (!normalizedType || data.length > MAX_COVER_BYTES) return null;

    const managedLocationId = await this.files.getManagedStorageLocationId();
    if (!managedLocationId) return null;

    const checksum = createHash("sha256").update(data).digest("hex");
    const ext = extForMediaType(normalizedType);
    const relativePath = normalizeRelativePath(
      path.posix.join(
        "artwork",
        "podcasts",
        input.showId,
        `${checksum}${ext}`,
      ),
    );

    const coverFileId = await this.files.storeDerivedFile({
      storageLocationId: managedLocationId,
      relativePath,
      data,
      mediaType: normalizedType,
    });

    await this.db
      .update(schema.podcastShows)
      .set({ coverFileId, updatedAt: new Date() })
      .where(eq(schema.podcastShows.id, input.showId));

    return coverFileId;
  }

  private async readEmbeddedCover(
    zip: JSZip,
    cover: EpubOpfCover,
  ): Promise<{ data: Buffer; mediaType: string } | null> {
    const href = normalizeRelativePath(cover.href);
    const entry = zip.file(href);
    if (!entry) return null;

    const data = Buffer.from(await entry.async("arraybuffer"));
    if (data.length > MAX_COVER_BYTES) return null;

    const mediaType = normalizeCoverMediaType(cover.mediaType, cover.href);
    if (!mediaType) return null;

    return { data, mediaType };
  }
}
