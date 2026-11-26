import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import * as schema from "../../db/schema.js";
import type { FileService } from "../files/service.js";
import type { IngestService } from "./service.js";
import { isPathContainedInRoot } from "../../security/paths.js";

type ChokidarModule = typeof import("chokidar");

export class IngestWatcher {
  private watcher: ReturnType<ChokidarModule["watch"]> | null = null;
  private pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly ingest: IngestService,
    private readonly db: Database,
    private readonly files: FileService,
  ) {}

  async start() {
    const chokidar = await import("chokidar");
    const roots = await this.ingest.listRoots();
    const enabled = roots.filter((r) => r.enabled);

    if (enabled.length === 0) return;

    await this.files.loadStorageLocations();

    const watchPaths: string[] = [];
    for (const root of enabled) {
      const loc = await this.db.query.storageLocations.findFirst({
        where: eq(schema.storageLocations.id, root.storageLocationId),
      });
      if (loc) watchPaths.push(loc.rootPath);
    }

    if (watchPaths.length === 0) return;

    this.watcher = chokidar.watch(watchPaths, {
      ignored: (watchPath) => {
        const base = path.basename(watchPath);
        return this.ingest.isTempFile(base);
      },
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 500,
      },
    });

    const handle = (fullPath: string) => {
      void this.scheduleFile(fullPath);
    };

    this.watcher.on("add", handle);
    this.watcher.on("change", handle);
  }

  private scheduleFile(fullPath: string) {
    const key = fullPath;
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing);

    this.pending.set(
      key,
      setTimeout(() => {
        this.pending.delete(key);
        void this.processFile(fullPath);
      }, 500),
    );
  }

  private async processFile(fullPath: string) {
    const roots = await this.ingest.listRoots();
    for (const root of roots) {
      if (!root.enabled) continue;
      const loc = await this.db.query.storageLocations.findFirst({
        where: eq(schema.storageLocations.id, root.storageLocationId),
      });
      if (!loc) continue;

      const normalizedRoot = path.resolve(loc.rootPath);
      const normalizedFile = path.resolve(fullPath);
      if (!isPathContainedInRoot(normalizedRoot, normalizedFile)) continue;

      const relativePath = path
        .relative(normalizedRoot, normalizedFile)
        .split(path.sep)
        .join("/");

      const filename = path.basename(relativePath);
      if (this.ingest.isTempFile(filename)) return;

      try {
        const adapter = this.files
          .getStorageService()
          .getAdapter(root.storageLocationId);
        const stat = await adapter.stat(relativePath);
        const full = await adapter.resolve(relativePath);
        const data = await readFile(full);
        const checksum = createHash("sha256").update(data).digest("hex");

        await this.ingest.reconcileFilesystemFile({
          ingestRootId: root.id,
          storageLocationId: root.storageLocationId,
          relativePath,
          originalFilename: filename,
          checksum,
          size: stat.size,
          mtime: stat.mtime,
        });
      } catch {
        // file may have disappeared or still be copying
      }
      return;
    }
  }

  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
  }
}
