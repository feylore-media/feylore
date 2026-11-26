import fs from "node:fs/promises";
import { createReadStream, constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import {
  resolveSafePath,
  normalizeRelativePath,
} from "../../security/paths.js";
import { StorageReadOnlyError } from "../../../shared/errors.js";

export type StorageKind = "managed" | "external" | "read_only";

export interface StorageLocationRecord {
  id: string;
  name: string;
  kind: StorageKind;
  rootPath: string;
}

export interface DiscoveredFile {
  relativePath: string;
  size: number;
  mtime: Date;
  mediaType?: string;
  checksum?: string;
}

export class StorageAdapter {
  constructor(private readonly location: StorageLocationRecord) {}

  get kind(): StorageKind {
    return this.location.kind;
  }

  async resolve(relativePath: string): Promise<string> {
    return resolveSafePath(this.location.rootPath, relativePath);
  }

  assertWritable(): void {
    if (this.location.kind === "read_only") {
      throw new StorageReadOnlyError();
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const full = await this.resolve(relativePath);
      await fs.access(full, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async stat(relativePath: string) {
    const full = await this.resolve(relativePath);
    return fs.stat(full);
  }

  async createReadStream(
    relativePath: string,
    range?: { start: number; end: number },
  ): Promise<Readable> {
    const full = await this.resolve(relativePath);
    if (range) {
      return createReadStream(full, { start: range.start, end: range.end });
    }
    return createReadStream(full);
  }

  async write(relativePath: string, data: Buffer): Promise<void> {
    this.assertWritable();
    const full = await this.resolve(relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async delete(relativePath: string): Promise<void> {
    this.assertWritable();
    const full = await this.resolve(relativePath);
    await fs.unlink(full);
  }

  async move(from: string, to: string): Promise<void> {
    this.assertWritable();
    const fromPath = await this.resolve(from);
    const toPath = await this.resolve(to);
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.rename(fromPath, toPath);
  }

  async *walk(relativeDir = "."): AsyncGenerator<DiscoveredFile> {
    const dir = await this.resolve(relativeDir === "." ? "" : relativeDir);
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const rel = path.posix.join(
        normalizeRelativePath(relativeDir === "." ? "" : relativeDir),
        entry.name,
      );
      if (entry.isDirectory()) {
        yield* this.walk(rel);
      } else if (entry.isFile()) {
        const full = await this.resolve(rel);
        const stat = await fs.stat(full);
        const checksum = await computeChecksum(full);
        yield {
          relativePath: normalizeRelativePath(rel),
          size: stat.size,
          mtime: stat.mtime,
          mediaType: guessMediaType(entry.name),
          checksum,
        };
      }
    }
  }
}

async function computeChecksum(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function guessMediaType(filename: string): string | undefined {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".epub": "application/epub+zip",
    ".pdf": "application/pdf",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".cbz": "application/vnd.comicbook+zip",
  };
  return map[ext];
}

export class StorageService {
  private adapters = new Map<string, StorageAdapter>();

  register(location: StorageLocationRecord) {
    this.adapters.set(location.id, new StorageAdapter(location));
  }

  getAdapter(locationId: string): StorageAdapter {
    const adapter = this.adapters.get(locationId);
    if (!adapter) throw new Error(`Storage location not found: ${locationId}`);
    return adapter;
  }

  clear() {
    this.adapters.clear();
  }
}
