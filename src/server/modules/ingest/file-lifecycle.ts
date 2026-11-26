import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { INGEST_UPLOAD_STAGING_PREFIX } from "../../../shared/ingest.js";
import type { StorageAdapter } from "../storage/adapter.js";

export interface FileCommitResult {
  destinationPath: string;
  checksum: string;
  size: number;
}

async function computeChecksum(fullPath: string): Promise<string> {
  const data = await fs.readFile(fullPath);
  return createHash("sha256").update(data).digest("hex");
}

export class IngestFileLifecycle {
  async verifySource(
    adapter: StorageAdapter,
    relativePath: string,
    expectedSize?: number,
    expectedChecksum?: string | null,
  ): Promise<{ size: number; checksum: string }> {
    const exists = await adapter.exists(relativePath);
    if (!exists) {
      throw new Error("Source file not found");
    }
    const stat = await adapter.stat(relativePath);
    if (stat.size === 0) {
      throw new Error("Source file is empty");
    }
    const full = await adapter.resolve(relativePath);
    const checksum = await computeChecksum(full);
    if (expectedSize !== undefined && stat.size !== expectedSize) {
      throw new Error("Source file size changed");
    }
    if (expectedChecksum && checksum !== expectedChecksum) {
      throw new Error("Source file checksum changed");
    }
    return { size: stat.size, checksum };
  }

  async copyToDestination(
    sourceAdapter: StorageAdapter,
    destAdapter: StorageAdapter,
    sourcePath: string,
    destPath: string,
  ): Promise<FileCommitResult> {
    const sourceFull = await sourceAdapter.resolve(sourcePath);
    const destFull = await destAdapter.resolve(destPath);
    await fs.mkdir(path.dirname(destFull), { recursive: true });
    await fs.copyFile(sourceFull, destFull);
    const stat = await fs.stat(destFull);
    const checksum = await computeChecksum(destFull);
    const sourceStat = await fs.stat(sourceFull);
    if (stat.size !== sourceStat.size) {
      await fs.unlink(destFull).catch(() => undefined);
      throw new Error("Destination size mismatch after copy");
    }
    return { destinationPath: destPath, checksum, size: stat.size };
  }

  async moveToDestination(
    sourceAdapter: StorageAdapter,
    destAdapter: StorageAdapter,
    sourcePath: string,
    destPath: string,
    sameStorageLocation: boolean,
  ): Promise<FileCommitResult> {
    const sourceFull = await sourceAdapter.resolve(sourcePath);
    const destFull = await destAdapter.resolve(destPath);
    const sourceStat = await fs.stat(sourceFull);
    const sourceChecksum = await computeChecksum(sourceFull);

    if (sameStorageLocation) {
      await destAdapter.move(sourcePath, destPath);
    } else {
      await this.copyToDestination(
        sourceAdapter,
        destAdapter,
        sourcePath,
        destPath,
      );
      await sourceAdapter.delete(sourcePath);
      const stat = await destAdapter.stat(destPath);
      return {
        destinationPath: destPath,
        checksum: sourceChecksum,
        size: stat.size,
      };
    }

    const stat = await destAdapter.stat(destPath);
    const destChecksum = await computeChecksum(destFull);
    if (destChecksum !== sourceChecksum || stat.size !== sourceStat.size) {
      throw new Error("Destination verification failed after move");
    }
    return {
      destinationPath: destPath,
      checksum: destChecksum,
      size: stat.size,
    };
  }

  async retireSource(
    adapter: StorageAdapter,
    relativePath: string,
    verifiedDestination?: FileCommitResult,
  ): Promise<void> {
    if (verifiedDestination) {
      const exists = await adapter.exists(relativePath);
      if (exists) {
        await adapter.delete(relativePath);
      }
    }
  }

  async cleanupUploadStagingDir(
    adapter: StorageAdapter,
    sourcePath: string,
  ): Promise<void> {
    const prefix = `${INGEST_UPLOAD_STAGING_PREFIX}/`;
    if (!sourcePath.startsWith(prefix)) return;

    const parts = sourcePath.split("/");
    if (parts.length < 2) return;
    const uploadDir = `${parts[0]}/${parts[1]}`;

    const exists = await adapter.exists(uploadDir);
    if (!exists) return;

    const full = await adapter.resolve(uploadDir);
    const entries = await fs.readdir(full).catch(() => [] as string[]);
    if (entries.length > 0) return;

    await fs.rmdir(full).catch(() => undefined);
  }
}
